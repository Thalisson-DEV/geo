package com.nexo.app.modules.frota.infrastructure.telemetria;

import com.fasterxml.jackson.databind.JsonNode;
import com.nexo.app.modules.frota.application.TelemetriaFrotaProperties;
import com.nexo.app.modules.frota.domain.FonteTelemetria;
import com.nexo.app.modules.frota.domain.ProvedorTelemetria;
import com.nexo.app.modules.frota.domain.TipoEventoTelemetria;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Vivo / Ubicaly (AIKO External API v3). A lista de veículos traz placa, odômetro (em metros) e
 * posição numa chamada; os eventos de condução vêm dos trajetos ({@code dpa}) de cada veículo.
 */
@Component
public class UbicalyFonteTelemetria implements FonteTelemetria {

    static final String VARIAVEL = "UBICALY_API_KEY";
    /** Janela máxima de um pedido de trajetos: rastreador parado por dias não pede semanas de uma vez. */
    static final Duration JANELA_MAXIMA = Duration.ofDays(7);
    private static final Duration JANELA_HISTORICO = Duration.ofDays(3);

    private static final Map<String, TipoEventoTelemetria> TIPOS_DPA = Map.of(
            "over_speed", TipoEventoTelemetria.EXCESSO_VELOCIDADE,
            "hard_braking", TipoEventoTelemetria.FRENAGEM_BRUSCA,
            "fast_acceleration", TipoEventoTelemetria.ACELERACAO_BRUSCA,
            "fast_sharp_turn", TipoEventoTelemetria.CURVA_BRUSCA);

    private final TelemetriaFrotaProperties.Provedor config;
    private final ClienteHttpTelemetria http;

    public UbicalyFonteTelemetria(TelemetriaFrotaProperties properties, ClienteHttpTelemetria http) {
        this.config = properties.getUbicaly();
        this.http = http;
    }

    @Override
    public ProvedorTelemetria provedor() {
        return ProvedorTelemetria.UBICALY;
    }

    @Override
    public boolean configurada() {
        return config.configurado();
    }

    @Override
    public List<VeiculoProvedor> veiculos() {
        return lerVeiculos(get("/v3/company/vehicles"));
    }

    @Override
    public EventosLidos eventos(Map<String, OffsetDateTime> desdePorVeiculo, OffsetDateTime ate) {
        var eventos = new ArrayList<EventoProvedor>();
        var lidosAte = new HashMap<String, OffsetDateTime>();
        for (var entrada : desdePorVeiculo.entrySet()) {
            OffsetDateTime desde = entrada.getValue();
            if (desde.isBefore(ate.minus(JANELA_MAXIMA))) {
                desde = ate.minus(JANELA_MAXIMA);
            }
            if (!desde.isBefore(ate)) {
                continue;
            }
            JsonNode trajetos = get("/v3/company/vehicles/id/" + entrada.getKey() + "/historical/tracks?from_ts="
                    + desde.toInstant().toEpochMilli() + "&to_ts=" + ate.toInstant().toEpochMilli());
            var lido = lerTrajetos(entrada.getKey(), trajetos, ate);
            eventos.addAll(lido.eventos());
            lidosAte.put(entrada.getKey(), lido.lidosAte().get(entrada.getKey()));
        }
        return new EventosLidos(eventos, lidosAte);
    }

    /** Posições do veículo ({@code .../historical/pos}), em janelas de até 3 dias. */
    @Override
    public List<Leitura> historico(String idExterno, String placa, OffsetDateTime de, OffsetDateTime ate) {
        if (idExterno == null || idExterno.isBlank()) {
            return null;
        }
        var leituras = new ArrayList<Leitura>();
        for (OffsetDateTime inicio = de; inicio.isBefore(ate); inicio = inicio.plus(JANELA_HISTORICO)) {
            OffsetDateTime fim = inicio.plus(JANELA_HISTORICO).isBefore(ate) ? inicio.plus(JANELA_HISTORICO) : ate;
            leituras.addAll(lerPosicoes(get("/v3/company/vehicles/id/" + idExterno.trim() + "/historical/pos?from_ts="
                    + inicio.toInstant().toEpochMilli() + "&to_ts=" + fim.toInstant().toEpochMilli())));
        }
        // O fim de uma janela é o início da próxima: o mesmo instante não entra duas vezes.
        var porInstante = new java.util.TreeMap<OffsetDateTime, Leitura>();
        leituras.forEach(l -> porInstante.putIfAbsent(l.lidoEm(), l));
        return new ArrayList<>(porInstante.values());
    }

    /** Só posição com GPS (fonte 1 ou 2); torre de celular e Wi-Fi erram centenas de metros. */
    static List<Leitura> lerPosicoes(JsonNode corpo) {
        var lista = new ArrayList<Leitura>();
        for (JsonNode p : LeitorJson.itens(corpo)) {
            Long ts = LeitorJson.inteiro(p, "ts");
            Long fonte = LeitorJson.inteiro(p, "src");
            Double lat = LeitorJson.decimal(p, "lat");
            Double lng = LeitorJson.decimal(p, "lng");
            if (ts == null || ts <= 0 || lat == null || lng == null || (fonte != null && fonte != 1 && fonte != 2)) {
                continue;
            }
            lista.add(new Leitura(LeitorJson.instanteMs(ts), lat, lng, LeitorJson.decimal(p, "spd"), null, null, null, null));
        }
        return lista;
    }

    private JsonNode get(String caminho) {
        String base = config.getBaseUrl().replaceAll("/+$", "");
        return http.get(URI.create(base + caminho), "Bearer " + config.getChave().trim(), VARIAVEL);
    }

    static List<VeiculoProvedor> lerVeiculos(JsonNode corpo) {
        var lista = new ArrayList<VeiculoProvedor>();
        for (JsonNode v : LeitorJson.itens(corpo)) {
            Long id = LeitorJson.inteiro(v, "vehicleId");
            if (id == null) {
                continue;
            }
            JsonNode pos = v.get("pos");
            JsonNode odo = v.get("odo");
            OffsetDateTime posEm = LeitorJson.instanteMs(LeitorJson.inteiro(pos, "ts"));
            OffsetDateTime odoEm = LeitorJson.instanteMs(LeitorJson.inteiro(odo, "ts"));
            OffsetDateTime lidoEm = posEm == null ? odoEm : odoEm == null || posEm.isAfter(odoEm) ? posEm : odoEm;
            Long odometro = odoEm == null ? null : LeitorJson.inteiro(odo, "value");
            Leitura leitura = lidoEm == null ? null : new Leitura(lidoEm,
                    posEm == null ? null : LeitorJson.decimal(pos, "lat"),
                    posEm == null ? null : LeitorJson.decimal(pos, "lng"),
                    posEm == null ? null : LeitorJson.decimal(pos, "spd"),
                    null, odometro, null, null);
            lista.add(new VeiculoProvedor(String.valueOf(id), LeitorJson.texto(v, "plate"), LeitorJson.texto(v, "name"), leitura));
        }
        return lista;
    }

    /**
     * Eventos dos trajetos encerrados. Um trajeto em andamento segura o cursor no início dele,
     * para os eventos serem lidos quando ele terminar (a importação não duplica).
     */
    static EventosLidos lerTrajetos(String idVeiculo, JsonNode corpo, OffsetDateTime ate) {
        var eventos = new ArrayList<EventoProvedor>();
        OffsetDateTime cursor = ate;
        for (JsonNode trajeto : LeitorJson.itens(corpo)) {
            OffsetDateTime inicio = LeitorJson.instanteMs(LeitorJson.inteiro(trajeto, "startTs"));
            OffsetDateTime fim = LeitorJson.instanteMs(LeitorJson.inteiro(trajeto, "endTs"));
            if (fim == null) {
                if (inicio != null && inicio.isBefore(cursor)) {
                    cursor = inicio;
                }
                continue;
            }
            String idTrajeto = LeitorJson.texto(trajeto, "trackId");
            Long idMotorista = LeitorJson.inteiro(trajeto, "driverId");
            String nomeMotorista = LeitorJson.texto(trajeto, "driverName");
            Motorista motorista = idMotorista == null || idMotorista == 0 ? null
                    : new Motorista(String.valueOf(idMotorista), nomeMotorista, null, null);
            JsonNode dpa = trajeto.path("track").path("dpa");
            for (var tipo : TIPOS_DPA.entrySet()) {
                JsonNode ocorrencias = dpa.get(tipo.getKey());
                if (ocorrencias == null || !ocorrencias.isArray()) {
                    continue;
                }
                for (JsonNode o : ocorrencias) {
                    OffsetDateTime em = o.isArray() && o.size() > 0 ? LeitorJson.instanteMs(o.get(0).asLong()) : null;
                    if (em == null) {
                        continue;
                    }
                    Double velocidade = o.size() > 3 ? LeitorJson.decimal(o.get(3)) : null;
                    Double valor = o.size() > 4 ? LeitorJson.decimal(o.get(4)) : null;
                    boolean excesso = tipo.getValue() == TipoEventoTelemetria.EXCESSO_VELOCIDADE;
                    eventos.add(new EventoProvedor(
                            (idTrajeto == null ? "trk" : idTrajeto) + ":" + tipo.getKey() + ":" + em.toInstant().toEpochMilli(),
                            idVeiculo, null, tipo.getValue(), em,
                            o.size() > 1 ? LeitorJson.decimal(o.get(1)) : null,
                            o.size() > 2 ? LeitorJson.decimal(o.get(2)) : null,
                            null, velocidade, excesso ? valor : null, null, null, motorista));
                }
            }
        }
        return new EventosLidos(eventos, Map.of(idVeiculo, cursor));
    }
}
