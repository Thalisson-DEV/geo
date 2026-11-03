package com.nexo.app.modules.frota.infrastructure.telemetria;

import com.fasterxml.jackson.databind.JsonNode;
import com.nexo.app.modules.frota.application.TelemetriaFrotaProperties;
import com.nexo.app.modules.frota.domain.FonteTelemetria;
import com.nexo.app.modules.frota.domain.ProvedorTelemetria;
import com.nexo.app.modules.frota.domain.TipoEventoTelemetria;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Zuq (API ZUQ Performance). O tempo real traz placa, odômetro (km), horímetro, ignição e o
 * motorista com CPF; os eventos vêm das violações de regra ({@code /api/notification/list}).
 * A CNH do motorista, usada para casar com o condutor, vem do cadastro de motoristas (buscado
 * pelo CPF), guardado por uma hora.
 */
@Component
public class ZuqFonteTelemetria implements FonteTelemetria {

    static final String VARIAVEL = "ZUQ_API_TOKEN";
    static final int TAMANHO_PAGINA = 500;
    private static final int PAGINAS_MAXIMAS = 40;
    private static final int DIAS_MAXIMOS = 89;
    private static final Duration VALIDADE_MOTORISTAS = Duration.ofHours(1);
    /** O histórico de pontos aceita no máximo 3 dias por pedido. */
    private static final Duration JANELA_HISTORICO = Duration.ofDays(3);
    private static final java.time.format.DateTimeFormatter HORA_LOCAL = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final ZoneId BRASILIA = ZoneId.of("America/Sao_Paulo");
    private static final Pattern LIMITE_NA_REGRA = Pattern.compile("(\\d{2,3})\\s*(km|$)", Pattern.CASE_INSENSITIVE);

    private final TelemetriaFrotaProperties.Provedor config;
    private final ClienteHttpTelemetria http;
    private final Map<String, Motorista> motoristas = new ConcurrentHashMap<>();
    private volatile Instant motoristasLidosEm = Instant.EPOCH;

    public ZuqFonteTelemetria(TelemetriaFrotaProperties properties, ClienteHttpTelemetria http) {
        this.config = properties.getZuq();
        this.http = http;
    }

    @Override
    public ProvedorTelemetria provedor() {
        return ProvedorTelemetria.ZUQ;
    }

    @Override
    public boolean configurada() {
        return config.configurado();
    }

    @Override
    public List<VeiculoProvedor> veiculos() {
        var veiculos = lerTempoReal(get("/api/realtime/vehicles"));
        carregarMotoristas(veiculos.stream().map(v -> v.leitura() == null ? null : v.leitura().motorista())
                .filter(m -> m != null && m.cpf() != null).map(Motorista::cpf).toList());
        return veiculos.stream().map(v -> v.leitura() == null || v.leitura().motorista() == null ? v
                : new VeiculoProvedor(v.idExterno(), v.placa(), v.nome(), comMotorista(v.leitura()))).toList();
    }

    @Override
    public EventosLidos eventos(Map<String, OffsetDateTime> desdePorVeiculo, OffsetDateTime ate) {
        if (desdePorVeiculo.isEmpty()) {
            return new EventosLidos(List.of(), Map.of());
        }
        LocalDate fim = ate.atZoneSameInstant(BRASILIA).toLocalDate();
        LocalDate inicio = desdePorVeiculo.values().stream().min(OffsetDateTime::compareTo).orElse(ate)
                .atZoneSameInstant(BRASILIA).toLocalDate();
        if (inicio.isBefore(fim.minusDays(DIAS_MAXIMOS))) {
            inicio = fim.minusDays(DIAS_MAXIMOS);
        }
        var eventos = new ArrayList<EventoProvedor>();
        for (int pagina = 1; pagina <= PAGINAS_MAXIMAS; pagina++) {
            JsonNode corpo = get("/api/notification/list?start=" + inicio + "&end=" + fim + "&page=" + pagina + "&size=" + TAMANHO_PAGINA);
            JsonNode itens = LeitorJson.itens(corpo);
            eventos.addAll(lerNotificacoes(itens));
            boolean temMais = corpo != null && corpo.has("hasNext") ? corpo.get("hasNext").asBoolean() : itens.size() >= TAMANHO_PAGINA;
            if (!temMais) {
                break;
            }
        }
        carregarMotoristas(eventos.stream().map(e -> e.motorista() == null ? null : e.motorista().cpf())
                .filter(cpf -> cpf != null).toList());
        var comCnh = eventos.stream().map(e -> e.motorista() == null ? e : new EventoProvedor(e.idExterno(), e.idExternoVeiculo(),
                e.placa(), e.tipo(), e.ocorridoEm(), e.latitude(), e.longitude(), e.endereco(), e.velocidadeKmh(),
                e.limiteKmh(), e.duracaoSegundos(), e.descricao(), completar(e.motorista()))).toList();
        var lidosAte = new HashMap<String, OffsetDateTime>();
        desdePorVeiculo.keySet().forEach(id -> lidosAte.put(id, ate));
        return new EventosLidos(comCnh, lidosAte);
    }

    /** Pontos de rastreamento ({@code /api/realtime/vehicle/p2p}), pela placa, em janelas de até 3 dias. */
    @Override
    public List<Leitura> historico(String idExterno, String placa, OffsetDateTime de, OffsetDateTime ate) {
        if (placa == null || placa.isBlank()) {
            return null;
        }
        var leituras = new ArrayList<Leitura>();
        for (OffsetDateTime inicio = de; inicio.isBefore(ate); inicio = inicio.plus(JANELA_HISTORICO)) {
            OffsetDateTime fim = inicio.plus(JANELA_HISTORICO).isBefore(ate) ? inicio.plus(JANELA_HISTORICO) : ate;
            leituras.addAll(lerPontos(get("/api/realtime/vehicle/p2p?vehicle=" + URLEncoder.encode(placa.trim(), StandardCharsets.UTF_8)
                    + "&start=" + horaLocal(inicio) + "&end=" + horaLocal(fim))));
        }
        // O fim de uma janela é o início da próxima: o mesmo instante não entra duas vezes.
        var porInstante = new java.util.TreeMap<OffsetDateTime, Leitura>();
        leituras.forEach(l -> porInstante.putIfAbsent(l.lidoEm(), l));
        return new ArrayList<>(porInstante.values());
    }

    /** A Zuq recebe o período sem fuso, na hora de Brasília. */
    private static String horaLocal(OffsetDateTime instante) {
        return HORA_LOCAL.format(instante.atZoneSameInstant(BRASILIA));
    }

    static List<Leitura> lerPontos(JsonNode corpo) {
        var lista = new ArrayList<Leitura>();
        for (JsonNode p : LeitorJson.itens(corpo)) {
            OffsetDateTime em = LeitorJson.instanteMs(LeitorJson.inteiro(p, "gpsTime"));
            Double lat = LeitorJson.decimal(p, "lat");
            Double lng = LeitorJson.decimal(p, "lng");
            if (em == null || lat == null || lng == null || (lat == 0 && lng == 0)) {
                continue;
            }
            lista.add(new Leitura(em, lat, lng, LeitorJson.decimal(p, "speedKMH"), LeitorJson.logico(p, "ignition"), null, null, null));
        }
        return lista;
    }

    private JsonNode get(String caminho) {
        String base = config.getBaseUrl().replaceAll("/+$", "");
        return http.get(URI.create(base + caminho), config.getChave().trim(), VARIAVEL);
    }

    /** CNH dos motoristas pelo CPF, lida do cadastro da Zuq no máximo uma vez por hora. */
    private void carregarMotoristas(Collection<String> cpfs) {
        boolean vencido = Instant.now().isAfter(motoristasLidosEm.plus(VALIDADE_MOTORISTAS));
        if (vencido) {
            motoristas.clear();
        }
        Set<String> faltam = new LinkedHashSet<>();
        for (String cpf : cpfs) {
            if (!motoristas.containsKey(cpf)) {
                faltam.add(cpf);
            }
        }
        if (faltam.isEmpty()) {
            return;
        }
        var lista = new ArrayList<>(faltam);
        for (int i = 0; i < lista.size(); i += 100) {
            var lote = lista.subList(i, Math.min(lista.size(), i + 100));
            StringBuilder q = new StringBuilder("/api/contact/drivers/v2/list?page=1&size=").append(TAMANHO_PAGINA);
            lote.forEach(cpf -> q.append("&cpf=").append(URLEncoder.encode(cpf, StandardCharsets.UTF_8)));
            lerMotoristas(get(q.toString())).forEach(m -> motoristas.put(m.cpf(), m));
            // Sem cadastro: fica registrado para não perguntar de novo nesta hora.
            lote.forEach(cpf -> motoristas.putIfAbsent(cpf, new Motorista(null, null, cpf, null)));
        }
        if (vencido) {
            motoristasLidosEm = Instant.now();
        }
    }

    private Leitura comMotorista(Leitura leitura) {
        return new Leitura(leitura.lidoEm(), leitura.latitude(), leitura.longitude(), leitura.velocidadeKmh(),
                leitura.ignicao(), leitura.odometroMetros(), leitura.horimetroHoras(), completar(leitura.motorista()));
    }

    private Motorista completar(Motorista m) {
        var cadastro = m.cpf() == null ? null : motoristas.get(m.cpf());
        if (cadastro == null) {
            return m;
        }
        return new Motorista(m.idExterno(), m.nome() != null ? m.nome() : cadastro.nome(), m.cpf(), cadastro.cnh());
    }

    static List<VeiculoProvedor> lerTempoReal(JsonNode corpo) {
        var lista = new ArrayList<VeiculoProvedor>();
        for (JsonNode r : LeitorJson.itens(corpo)) {
            JsonNode veiculo = r.get("vehicle");
            Long id = LeitorJson.inteiro(veiculo, "id");
            if (id == null) {
                continue;
            }
            OffsetDateTime lidoEm = LeitorJson.instanteMs(LeitorJson.inteiro(r, "gpsTime"));
            Long odometroKm = LeitorJson.inteiro(r, "odometer");
            Long hor = LeitorJson.inteiro(r, "hourmeter");
            Leitura leitura = lidoEm == null ? null : new Leitura(lidoEm,
                    LeitorJson.decimal(r, "latitude"), LeitorJson.decimal(r, "longitude"),
                    LeitorJson.decimal(r, "speedKMH"), LeitorJson.logico(r, "ignition"),
                    odometroKm == null || odometroKm <= 0 ? null : odometroKm * 1000,
                    hor == null || hor <= 0 ? null : hor.doubleValue(),
                    motorista(r.get("driver")));
            lista.add(new VeiculoProvedor(String.valueOf(id), LeitorJson.texto(veiculo, "licensePlate"),
                    LeitorJson.texto(veiculo, "code"), leitura));
        }
        return lista;
    }

    static List<Motorista> lerMotoristas(JsonNode corpo) {
        var lista = new ArrayList<Motorista>();
        for (JsonNode d : LeitorJson.itens(corpo)) {
            String cpf = LeitorJson.digitos(LeitorJson.texto(d, "cpf"));
            if (cpf == null) {
                continue;
            }
            lista.add(new Motorista(LeitorJson.texto(d, "id"), LeitorJson.texto(d, "name"), cpf,
                    LeitorJson.digitos(LeitorJson.texto(d.get("cnh"), "numero"))));
        }
        return lista;
    }

    static List<EventoProvedor> lerNotificacoes(JsonNode itens) {
        var lista = new ArrayList<EventoProvedor>();
        for (JsonNode n : itens) {
            String id = LeitorJson.texto(n, "id");
            JsonNode veiculo = n.get("vehicle");
            Long idVeiculo = LeitorJson.inteiro(veiculo, "id");
            OffsetDateTime em = LeitorJson.instanteIso(LeitorJson.texto(n, "eventDate"));
            JsonNode regra = n.get("rule");
            String propriedade = LeitorJson.texto(regra, "property");
            String nomeRegra = LeitorJson.texto(regra, "name");
            String descricao = LeitorJson.texto(n, "description");
            TipoEventoTelemetria tipo = tipo(propriedade, nomeRegra, descricao);
            if (id == null || idVeiculo == null || em == null || tipo == null) {
                continue;
            }
            Double valor = LeitorJson.decimal(n, "newValue");
            Long segundos = LeitorJson.inteiro(n, "seconds");
            boolean excesso = tipo == TipoEventoTelemetria.EXCESSO_VELOCIDADE;
            lista.add(new EventoProvedor(id, String.valueOf(idVeiculo), LeitorJson.texto(veiculo, "licensePlate"), tipo, em,
                    null, null, LeitorJson.texto(n, "address"),
                    excesso ? valor : null, excesso ? limite(nomeRegra) : null,
                    segundos == null ? null : (int) Math.min(Integer.MAX_VALUE, segundos),
                    descricao != null ? descricao : nomeRegra, motorista(n.get("driver"))));
        }
        return lista;
    }

    /** Só os eventos de condução; ignição, cerca, bloqueio, uso, odômetro, parada e temperatura ficam de fora. */
    static TipoEventoTelemetria tipo(String propriedade, String regra, String descricao) {
        if (propriedade == null) {
            return null;
        }
        return switch (propriedade.toUpperCase(Locale.ROOT)) {
            case "SPEED" -> TipoEventoTelemetria.EXCESSO_VELOCIDADE;
            case "STOPPED_IGNITION" -> TipoEventoTelemetria.MOTOR_LIGADO_PARADO;
            case "PANIC" -> TipoEventoTelemetria.PANICO;
            case "NO_DRIVER" -> TipoEventoTelemetria.SEM_MOTORISTA;
            case "POWER" -> TipoEventoTelemetria.DESCONEXAO_BATERIA;
            case "ALERT" -> dirigibilidade(regra + " " + descricao);
            default -> null;
        };
    }

    private static TipoEventoTelemetria dirigibilidade(String texto) {
        String t = Normalizer.normalize(texto, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
        if (t.contains("fren")) return TipoEventoTelemetria.FRENAGEM_BRUSCA;
        if (t.contains("aceler")) return TipoEventoTelemetria.ACELERACAO_BRUSCA;
        if (t.contains("curva")) return TipoEventoTelemetria.CURVA_BRUSCA;
        return TipoEventoTelemetria.CONDUCAO_AGRESSIVA;
    }

    /** "Velocidade acima de 80 km/h" → 80. */
    static Double limite(String regra) {
        if (regra == null) {
            return null;
        }
        Matcher m = LIMITE_NA_REGRA.matcher(regra);
        return m.find() ? Double.valueOf(m.group(1)) : null;
    }

    private static Motorista motorista(JsonNode d) {
        String id = LeitorJson.texto(d, "id");
        String nome = LeitorJson.texto(d, "name");
        if (id == null && nome == null) {
            return null;
        }
        return new Motorista(id, nome, LeitorJson.digitos(LeitorJson.texto(d, "taxpayerId")), null);
    }
}
