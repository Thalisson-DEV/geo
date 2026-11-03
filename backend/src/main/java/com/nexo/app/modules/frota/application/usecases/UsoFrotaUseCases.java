package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.UsoFrotaDtos.CustoVeiculo;
import com.nexo.app.modules.frota.application.dto.UsoFrotaDtos.Duplicado;
import com.nexo.app.modules.frota.application.dto.UsoFrotaDtos.Problema;
import com.nexo.app.modules.frota.application.dto.UsoFrotaDtos.RastreadorDuplicado;
import com.nexo.app.modules.frota.application.dto.UsoFrotaDtos.RastreadorProblema;
import com.nexo.app.modules.frota.application.dto.UsoFrotaDtos.SaidaForaExpediente;
import com.nexo.app.modules.frota.application.dto.UsoFrotaDtos.SaudeResponse;
import com.nexo.app.modules.frota.application.dto.UsoFrotaDtos.UsoVeiculoResponse;
import com.nexo.app.modules.frota.application.dto.FichaVeiculoFilter;
import com.nexo.app.modules.frota.application.dto.VeiculoFrotaResumoResponse;
import com.nexo.app.modules.frota.domain.AnaliseTrajeto;
import com.nexo.app.modules.frota.domain.Expediente;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.RastreadorTelemetria;
import com.nexo.app.modules.frota.domain.RegimeVeiculo;
import com.nexo.app.modules.frota.domain.SituacaoRastreador;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository.GastoDia;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.RastreadorTelemetriaRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * O uso de um veículo pela telemetria (ficha do veículo, aba Uso) e a saúde dos rastreadores
 * (cadastro de rastreadores, para quem administra o contrato).
 */
@Service
@RequiredArgsConstructor
public class UsoFrotaUseCases {

    /** Opções de período da aba Uso. */
    static final List<Integer> PERIODOS_DIAS = List.of(7, 30, 90);
    /** As saídas fora do expediente são recalculadas das posições: no máximo os últimos 31 dias. */
    static final int MAXIMO_DIAS_SAIDAS = 31;
    /** Parada menor que isto entre dois movimentos fora do expediente não separa duas saídas. */
    private static final Duration PAUSA_DA_SAIDA = Duration.ofMinutes(15);
    private static final Locale PT_BR = Locale.forLanguageTag("pt-BR");

    private final AnaliseTelemetriaRepository analises;
    private final RastreadorTelemetriaRepository rastreadores;
    private final FichaVeiculoRepository fichas;
    private final VeiculoFrotaUseCases veiculos;
    private final ParametrosFrotaUseCases parametros;
    private final UsoTelemetriaVeiculos uso;
    private final CalculoAnalisesFrota calculo;

    // ── Uso do veículo ─────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public UsoVeiculoResponse usoDoVeiculo(UUID idVeiculo, Integer dias) {
        int periodo = dias == null ? 30 : dias;
        if (!PERIODOS_DIAS.contains(periodo)) {
            throw new InvarianteVioladaException("Escolha 7, 30 ou 90 dias.");
        }
        var ficha = veiculos.buscarFicha(idVeiculo);
        LocalDate ate = LocalDate.now(Expediente.FUSO);
        LocalDate de = ate.minusDays(periodo - 1L);
        var expediente = parametros.obter().expediente();
        var u = uso.calcular(List.of(idVeiculo), de, ate).get(idVeiculo);
        boolean rastreado = !rastreadores.findAllByIdVeiculoAndAtivoTrueOrderByUltimaComunicacaoDesc(idVeiculo).isEmpty();
        var custo = custo(ficha, de, ate, u);
        var saidas = u == null || u.diasForaExpediente() == 0 ? List.<SaidaForaExpediente>of()
                : saidasForaExpediente(idVeiculo, periodo > MAXIMO_DIAS_SAIDAS ? ate.minusDays(MAXIMO_DIAS_SAIDAS - 1L) : de, ate, expediente);
        return new UsoVeiculoResponse(periodo, de, ate, textoExpediente(expediente), rastreado, u != null,
                u == null ? 0 : u.km(), u == null ? 0 : u.kmPorDiaUtil(), u == null ? 0 : u.diasComUso(),
                u == null ? 0 : u.diasUteisMedidos(), u != null && u.rodaPouco(), UsoTelemetriaVeiculos.KM_DIA_RODA_POUCO,
                u == null ? 0 : u.minutosAndando(), u == null ? 0 : u.minutosLigadoParado(), u == null ? 0 : u.litrosOciosos(),
                u == null ? 0 : u.kmForaExpediente(), u == null ? 0 : u.diasForaExpediente(), saidas,
                periodo > MAXIMO_DIAS_SAIDAS, custo);
    }

    /** "seg. a sex., das 06:00 às 19:00" (com sábado: "seg. a sáb."). */
    static String textoExpediente(Expediente e) {
        return (e.sabado() ? "seg. a sáb." : "seg. a sex.") + ", das " + e.inicio() + " às " + e.fim();
    }

    /**
     * Custos do período desde que o rastreador passou a medir o veículo (custo do mês sobre o km de
     * um dia não é custo por km). O motor ligado parado vale ao preço que o veículo pagou no período.
     */
    private CustoVeiculo custo(FichaVeiculo ficha, LocalDate de, LocalDate ate, UsoTelemetriaVeiculos.Uso u) {
        UUID id = ficha.getIdVeiculo();
        var primeiro = analises.primeiroDiaPorVeiculo().get(id);
        LocalDate desde = primeiro != null && primeiro.isAfter(de) ? primeiro : de;
        OffsetDateTime inicio = desde.atStartOfDay(Expediente.FUSO).toOffsetDateTime();
        OffsetDateTime fim = ate.plusDays(1).atStartOfDay(Expediente.FUSO).toOffsetDateTime();
        BigDecimal combustivel = soma(analises.gastosAbastecimento(inicio, fim), id, GastoDia::valor);
        BigDecimal litros = soma(analises.gastosAbastecimento(inicio, fim), id, GastoDia::litros);
        BigDecimal manutencao = soma(analises.gastosManutencao(inicio, fim), id, GastoDia::valor);
        BigDecimal despesas = soma(analises.gastosDespesas(desde, ate), id, GastoDia::valor);
        BigDecimal locacao = locacaoNoPeriodo(ficha, desde, ate);
        BigDecimal total = combustivel.add(manutencao).add(despesas).add(locacao == null ? BigDecimal.ZERO : locacao);
        double km = u == null ? 0 : u.km();
        BigDecimal precoLitro = litros.signum() > 0 ? combustivel.divide(litros, 4, RoundingMode.HALF_UP) : null;
        return new CustoVeiculo(desde, combustivel, litros, manutencao, despesas, locacao, total,
                km >= 1 && total.signum() > 0 ? total.divide(BigDecimal.valueOf(km), 2, RoundingMode.HALF_UP) : null,
                km >= 1 && litros.signum() > 0 ? BigDecimal.valueOf(km).divide(litros, 1, RoundingMode.HALF_UP) : null,
                precoLitro == null || u == null ? null
                        : precoLitro.multiply(BigDecimal.valueOf(u.litrosOciosos())).setScale(2, RoundingMode.HALF_UP));
    }

    private static BigDecimal soma(List<GastoDia> gastos, UUID idVeiculo, Function<GastoDia, BigDecimal> campo) {
        return gastos.stream().filter(g -> idVeiculo.equals(g.idVeiculo())).map(campo).filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** Aluguel proporcional aos dias do período em que o veículo esteve locado (mês de 30 dias). */
    static BigDecimal locacaoNoPeriodo(FichaVeiculo ficha, LocalDate de, LocalDate ate) {
        if (ficha == null || ficha.getRegime() != RegimeVeiculo.LOCADO || ficha.getCustoMensalLocacao() == null) return null;
        LocalDate inicio = ficha.getInicioLocacao() != null && ficha.getInicioLocacao().isAfter(de) ? ficha.getInicioLocacao() : de;
        LocalDate fim = ficha.getFimLocacao() != null && ficha.getFimLocacao().isBefore(ate) ? ficha.getFimLocacao() : ate;
        long dias = ChronoUnit.DAYS.between(inicio, fim) + 1;
        if (dias <= 0) return BigDecimal.ZERO;
        return ficha.getCustoMensalLocacao().multiply(BigDecimal.valueOf(dias)).divide(BigDecimal.valueOf(30), 2, RoundingMode.HALF_UP);
    }

    /** Cada saída fora do expediente: movimento contínuo (paradas curtas não a quebram), com o trajeto. */
    List<SaidaForaExpediente> saidasForaExpediente(UUID idVeiculo, LocalDate de, LocalDate ate, Expediente expediente) {
        var ids = calculo.idsRastreadores(idVeiculo);
        var saidas = new ArrayList<SaidaForaExpediente>();
        SaidaAberta aberta = null;
        for (LocalDate dia = de; !dia.isAfter(ate); dia = dia.plusDays(1)) {
            OffsetDateTime inicio = dia.atStartOfDay(Expediente.FUSO).toOffsetDateTime();
            OffsetDateTime fim = dia.plusDays(1).atStartOfDay(Expediente.FUSO).toOffsetDateTime();
            UUID principal = analises.rastreadorPrincipal(ids, inicio, fim);
            if (principal == null) continue;
            for (var t : AnaliseTrajeto.trechos(calculo.pontos(principal, inicio, fim))) {
                if (t.estado() != AnaliseTrajeto.Estado.MOVIMENTO || expediente.dentro(t.meio())) continue;
                if (aberta != null && Duration.between(aberta.fim, t.inicio().em()).compareTo(PAUSA_DA_SAIDA) > 0) {
                    saidas.add(aberta.fechar());
                    aberta = null;
                }
                if (aberta == null) aberta = new SaidaAberta(t.inicio());
                aberta.somar(t);
            }
        }
        if (aberta != null) saidas.add(aberta.fechar());
        saidas.removeIf(s -> s.km() < 0.5);
        saidas.sort(Comparator.comparing(SaidaForaExpediente::inicio).reversed());
        return saidas;
    }

    private static final class SaidaAberta {
        private final OffsetDateTime inicio;
        private OffsetDateTime fim;
        private double metros;
        private double minutos;
        private final List<double[]> trajeto = new ArrayList<>();

        SaidaAberta(AnaliseTrajeto.Ponto ponto) {
            this.inicio = ponto.em();
            this.fim = ponto.em();
            trajeto.add(new double[]{ponto.latitude(), ponto.longitude()});
        }

        void somar(AnaliseTrajeto.Trecho t) {
            metros += t.metros();
            minutos += t.minutos();
            fim = t.fim().em();
            if (t.fim().temCoordenada()) trajeto.add(new double[]{t.fim().latitude(), t.fim().longitude()});
        }

        SaidaForaExpediente fechar() {
            var dia = inicio.atZoneSameInstant(Expediente.FUSO);
            String quando = dia.getDayOfWeek().getDisplayName(TextStyle.SHORT, PT_BR);
            return new SaidaForaExpediente(inicio, fim, UsoTelemetriaVeiculos.arredondar(metros / 1000), (int) Math.round(minutos),
                    quando, trajeto);
        }
    }

    // ── Saúde dos rastreadores ──────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public SaudeResponse saude() {
        var agora = OffsetDateTime.now();
        var limiteSinal = agora.minus(TelemetriaFrotaUseCases.SEM_COMUNICACAO);
        var todos = rastreadores.findAll().stream()
                .filter(RastreadorTelemetria::isAtivo).filter(r -> r.getSituacao() != SituacaoRastreador.IGNORADO).toList();
        var frota = veiculos.listar(new FichaVeiculoFilter(null, null, null, null, null, true), PageRequest.of(0, 3000))
                .getContent().stream()
                .collect(Collectors.toMap(VeiculoFrotaResumoResponse::idVeiculo, Function.identity(), (a, b) -> a, LinkedHashMap::new));

        Map<String, List<RastreadorTelemetria>> porPlaca = new LinkedHashMap<>();
        for (var r : todos) {
            String placa = placaDoRastreador(r, frota);
            if (placa != null) porPlaca.computeIfAbsent(placa, k -> new ArrayList<>()).add(r);
        }
        var duplicados = new ArrayList<Duplicado>();
        porPlaca.forEach((placa, lista) -> {
            if (lista.size() < 2) return;
            var ordenados = lista.stream().sorted(melhorPrimeiro(limiteSinal)).toList();
            var idVeiculo = lista.stream().map(RastreadorTelemetria::getIdVeiculo).filter(Objects::nonNull).findFirst().orElse(null);
            var v = idVeiculo == null ? null : frota.get(idVeiculo);
            var itens = new ArrayList<RastreadorDuplicado>();
            for (int i = 0; i < ordenados.size(); i++) {
                var r = ordenados.get(i);
                itens.add(new RastreadorDuplicado(r.getId(), r.getProvedor(), r.getProvedor().getRotulo(), r.getUltimaComunicacao(),
                        r.getOdometroMetros() != null, i == 0));
            }
            // Sem veículo na frota, o nome no provedor costuma ser a própria placa: só vale quando acrescenta.
            String nome = ordenados.get(0).getNomeProvedor();
            boolean nomeAcrescenta = nome != null && !nome.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "").equals(placa);
            duplicados.add(new Duplicado(v != null ? v.placa() : placa, idVeiculo, v != null ? v.modelo() : nomeAcrescenta ? nome : null,
                    v != null ? v.baseOperacional() : null, itens));
        });
        duplicados.sort(Comparator.comparing(Duplicado::placa));

        var problemas = new ArrayList<RastreadorProblema>();
        for (var r : todos) {
            Problema problema = !comunicou(r, limiteSinal) ? Problema.SEM_SINAL
                    : r.getLatitude() == null ? Problema.SEM_POSICAO
                    : r.getOdometroMetros() == null ? Problema.SEM_ODOMETRO : null;
            if (problema == null) continue;
            var v = r.getIdVeiculo() == null ? null : frota.get(r.getIdVeiculo());
            problemas.add(new RastreadorProblema(r.getId(), r.getIdVeiculo(), v != null ? v.placa() : placaOuId(r),
                    v != null ? v.baseOperacional() : null, r.getProvedor(), r.getProvedor().getRotulo(), problema,
                    problema.getRotulo(), r.getUltimaComunicacao()));
        }
        problemas.sort(Comparator.comparing((RastreadorProblema p) -> p.problema().ordinal())
                .thenComparing(RastreadorProblema::ultimaComunicacao, Comparator.nullsFirst(Comparator.naturalOrder())));
        return new SaudeResponse(duplicados, problemas, agora);
    }

    private static boolean comunicou(RastreadorTelemetria r, OffsetDateTime limite) {
        return r.getUltimaComunicacao() != null && !r.getUltimaComunicacao().isBefore(limite);
    }

    /** O que comunica, com odômetro e mais recente primeiro: é o que fica. */
    private static Comparator<RastreadorTelemetria> melhorPrimeiro(OffsetDateTime limite) {
        return Comparator.comparing((RastreadorTelemetria r) -> !comunicou(r, limite))
                .thenComparing(r -> r.getOdometroMetros() == null)
                .thenComparing(RastreadorTelemetria::getUltimaComunicacao, Comparator.nullsLast(Comparator.reverseOrder()));
    }

    private static String placaDoRastreador(RastreadorTelemetria r, Map<UUID, VeiculoFrotaResumoResponse> frota) {
        var v = r.getIdVeiculo() == null ? null : frota.get(r.getIdVeiculo());
        String placa = v != null ? v.placa() : r.getPlacaProvedor();
        return placa == null || placa.isBlank() ? null : placa.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }

    private static String placaOuId(RastreadorTelemetria r) {
        return r.getPlacaProvedor() != null ? r.getPlacaProvedor() : r.getIdExterno();
    }
}
