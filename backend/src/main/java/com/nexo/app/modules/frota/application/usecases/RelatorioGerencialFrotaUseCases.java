package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.execucao.TurnoVeiculoApi;
import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.application.dto.RelatorioGerencialFrotaFilter;
import com.nexo.app.modules.frota.application.dto.RelatorioGerencialFrotaResponse;
import com.nexo.app.modules.frota.application.dto.RelatorioGerencialFrotaResponse.*;
import com.nexo.app.modules.frota.infrastructure.persistence.RelatorioGerencialFrotaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.RelatorioGerencialFrotaRepository.Ficha;
import com.nexo.app.modules.frota.infrastructure.persistence.RelatorioGerencialFrotaRepository.OsConcluida;
import com.nexo.app.modules.rh.BaseOperacionalApi;
import com.nexo.app.modules.rh.BaseOperacionalResponse;
import com.nexo.app.modules.rh.ColaboradorApi;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.EquipeResponse;
import com.nexo.app.modules.rh.ResumoColaborador;
import com.nexo.app.modules.sst.SstAnalyticsApi;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Relatórios gerenciais da frota: custos, manutenção, combustível, uso e conformidade num recorte,
 * comparados com o período anterior de mesma duração. Cada parte só é calculada para quem lê o
 * assunto; o custo total soma o que a pessoa enxerga e diz o que ficou de fora.
 */
@Service
@RequiredArgsConstructor
public class RelatorioGerencialFrotaUseCases {

    static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");
    static final int MAXIMO_DIAS = 731;
    static final int DIAS_RETRABALHO = 30;
    static final int DIAS_A_VENCER = 30;
    static final int DIAS_APOLICE_VENCENDO = 60;
    static final BigDecimal META_CHECKLIST = new BigDecimal("0.80");
    static final BigDecimal TOLERANCIA_CONSUMO = new BigDecimal("0.85");
    static final BigDecimal DIAS_MES = new BigDecimal("30");

    /** Categorias de custo, na ordem em que aparecem. */
    enum Parte {
        MANUTENCAO("Manutenção"), COMBUSTIVEL("Combustível"), DESPESAS("Despesas"), SEGURO("Seguro"),
        LOCACAO("Locação"), FRANQUIAS("Franquias de sinistro");

        final String rotulo;

        Parte(String rotulo) {
            this.rotulo = rotulo;
        }
    }

    private static final Map<String, String> ROTULOS = Map.ofEntries(
            Map.entry("VERBAL", "Pedido verbal"), Map.entry("CHECKLIST", "Checklist"), Map.entry("INSPECAO", "Inspeção"),
            Map.entry("PREVENTIVA", "Plano preventivo"), Map.entry("MANUAL", "Lançamento manual"),
            Map.entry("IMPORTACAO", "Importação"), Map.entry("SINISTRO", "Sinistro"),
            Map.entry("AVARIA", "Avaria"), Map.entry("DESGASTE_NATURAL", "Desgaste natural"),
            Map.entry("USO_INDEVIDO", "Uso indevido"), Map.entry("SERVICO_CORRETIVO", "Serviço corretivo"),
            Map.entry("SERVICO_PREVENTIVO", "Serviço preventivo"), Map.entry("ESTOQUE", "Estoque"),
            Map.entry("SUBSTITUICAO_PNEUS", "Substituição de pneus"), Map.entry("SEM_CAUSA", "Sem causa informada"),
            Map.entry("MEDICAO_MENOR", "Medição menor que a anterior"), Map.entry("VOLUME_ACIMA_TANQUE", "Volume acima do tanque"),
            Map.entry("CONSUMO_FORA_PADRAO", "Consumo fora do padrão"), Map.entry("PRECO_ACIMA_MEDIA", "Preço acima da média"),
            Map.entry("FOTO_REPETIDA", "Foto repetida"), Map.entry("FREQUENCIA_ALTA", "Frequência alta"),
            Map.entry("POSTO_SEM_PRECO", "Posto sem preço"), Map.entry("SEM_CHECKLIST", "Sem checklist"),
            Map.entry("LONGE_DO_POSTO", "Longe do posto"),
            Map.entry("COLISAO_SEM_VITIMA", "Colisão sem vítima"), Map.entry("COLISAO_COM_VITIMA", "Colisão com vítima"),
            Map.entry("SEM_TERCEIROS", "Sem terceiros"), Map.entry("INTRAFROTA", "Intrafrota"),
            Map.entry("CARGA_AVARIADA", "Carga avariada"), Map.entry("FURTO", "Furto"), Map.entry("ASSALTO", "Assalto"),
            Map.entry("EXCESSO_VELOCIDADE", "Excesso de velocidade"), Map.entry("FRENAGEM_BRUSCA", "Frenagem brusca"),
            Map.entry("ACELERACAO_BRUSCA", "Aceleração brusca"), Map.entry("CURVA_BRUSCA", "Curva brusca"),
            Map.entry("CONDUCAO_AGRESSIVA", "Condução agressiva"),
            Map.entry("PROPRIO", "Próprio"), Map.entry("LOCADO", "Locado"));

    private final RelatorioGerencialFrotaRepository repositorio;
    private final PreventivaUseCases preventiva;
    private final BaseOperacionalApi bases;
    private final EquipeApi equipes;
    private final ColaboradorApi colaboradores;
    private final TurnoVeiculoApi turnos;
    private final SstAnalyticsApi sst;
    private final FinanceiroApi financeiro;

    @Transactional(readOnly = true)
    public RelatorioGerencialFrotaResponse gerar(RelatorioGerencialFrotaFilter filtro) {
        return gerar(filtro, OffsetDateTime.now(FUSO));
    }

    /** Recorte e janelas resolvidos: base comum do relatório gerencial e das consultas de detalhe. */
    record Contexto(LocalDate hoje, Janela atual, Janela anterior, int dias, List<Ficha> recorte, Map<UUID, Ficha> fichas,
                    Map<UUID, String> nomesBase, Map<UUID, Processo> processos) {
        Set<UUID> ids() {
            return fichas.keySet();
        }
    }

    Contexto contexto(RelatorioGerencialFrotaFilter filtro, OffsetDateTime agora) {
        LocalDate hoje = agora.atZoneSameInstant(FUSO).toLocalDate();
        LocalDate ate = filtro.ate() == null ? hoje : filtro.ate();
        LocalDate de = filtro.de() == null ? ate.withDayOfMonth(1).minusMonths(6) : filtro.de();
        if (ate.isBefore(de)) {
            throw new InvarianteVioladaException("A data final não pode ser antes da inicial.");
        }
        if (ChronoUnit.DAYS.between(de, ate) + 1 > MAXIMO_DIAS) {
            throw new InvarianteVioladaException("Consulte no máximo 24 meses por vez.");
        }
        int dias = (int) ChronoUnit.DAYS.between(de, ate) + 1;
        var processos = processosPorVeiculo();
        List<Ficha> todas = repositorio.fichas();
        List<Ficha> recorte = recortar(todas, filtro, processos);
        Map<UUID, Ficha> fichas = recorte.stream().collect(Collectors.toMap(Ficha::idVeiculo, f -> f, (a, b) -> a, LinkedHashMap::new));
        return new Contexto(hoje, new Janela(de, ate, agora), new Janela(de.minusDays(dias), de.minusDays(1), agora), dias,
                recorte, fichas, nomesDasBases(todas), processos);
    }

    RelatorioGerencialFrotaResponse gerar(RelatorioGerencialFrotaFilter filtro, OffsetDateTime agora) {
        var acesso = Acesso.doUsuario();
        var ctx = contexto(filtro, agora);
        LocalDate hoje = ctx.hoje();
        LocalDate de = ctx.atual().de();
        LocalDate ate = ctx.atual().ate();
        int dias = ctx.dias();
        var atual = ctx.atual();
        var anterior = ctx.anterior();
        var processos = ctx.processos();
        Map<UUID, String> nomesBase = ctx.nomesBase();
        List<Ficha> recorte = ctx.recorte();
        Map<UUID, Ficha> fichas = ctx.fichas();
        Set<UUID> ids = fichas.keySet();

        var calcAtual = calcular(ids, fichas, atual, acesso);
        var calcAnterior = calcular(ids, fichas, anterior, acesso);

        int emOperacao = (int) recorte.stream().filter(f -> !"BAIXADO".equals(f.situacao())).count();
        int baixados = recorte.size() - emOperacao;
        int locados = (int) recorte.stream().filter(f -> "LOCADO".equals(f.regime())).count();
        int diasUteis = diasUteis(de, ate.isAfter(hoje) ? hoje : ate);

        var preventivas = acesso.os() ? preventiva.pendenciasPorVeiculo() : Map.<UUID, PreventivaUseCases.PendenciaPreventiva>of();
        var linhas = linhasPorVeiculo(fichas, calcAtual, calcAnterior, nomesBase, processos, preventivas, diasUteis, acesso);

        var resumo = new Resumo(
                ind(calcAtual.custoTotal(), calcAnterior.custoTotal()),
                ind(calcAtual.custoPorKm(), calcAnterior.custoPorKm()),
                ind(custoVeiculoMes(calcAtual.custoTotal(), emOperacao, dias), custoVeiculoMes(calcAnterior.custoTotal(), emOperacao, dias)),
                ind(BigDecimal.valueOf(calcAtual.kmTotal()), BigDecimal.valueOf(calcAnterior.kmTotal())),
                acesso.os() ? ind(calcAtual.disponibilidade(), calcAnterior.disponibilidade()) : null,
                acesso.os() ? ind(calcAtual.percentualPreventiva(), calcAnterior.percentualPreventiva()) : null,
                ind(calcAtual.custoSobreFaturamento(), calcAnterior.custoSobreFaturamento()),
                repositorio.aguardandoFinanceiro(ids, acesso.despesa(), acesso.seguro()));

        return new RelatorioGerencialFrotaResponse(
                new Periodo(de, ate, anterior.de(), anterior.ate(), dias, diasUteis, agora),
                new Recorte(recorte.size(), emOperacao, baixados, locados),
                acesso.omitidas(),
                resumo,
                custos(calcAtual, calcAnterior, fichas, nomesBase, processos, ids, atual, acesso),
                acesso.os() ? manutencao(calcAtual, calcAnterior, fichas, ids, atual, agora, preventivas) : null,
                acesso.abastecimento() ? combustivel(calcAtual, calcAnterior, fichas, ids, atual) : null,
                uso(calcAtual, calcAnterior, fichas, nomesBase, acesso),
                conformidade(calcAtual, calcAnterior, fichas, ids, nomesBase, hoje, diasUteis, acesso, filtroVazio(filtro), atual),
                linhas);
    }

    // ── Recorte ────────────────────────────────────────────────────────────────────

    private List<Ficha> recortar(List<Ficha> todas, RelatorioGerencialFrotaFilter f, Map<UUID, Processo> processos) {
        Set<UUID> bases = conjunto(f.idBase());
        Set<UUID> tipos = conjunto(f.idTipoVeiculo());
        Set<UUID> veiculos = conjunto(f.idVeiculo());
        Set<UUID> idsProcesso = conjunto(f.idProcesso());
        Set<String> regimes = maiusculas(f.regime());
        Set<String> situacoes = maiusculas(f.situacao());
        return todas.stream()
                .filter(x -> bases == null || bases.contains(x.idBase()))
                .filter(x -> tipos == null || tipos.contains(x.idTipo()))
                .filter(x -> veiculos == null || veiculos.contains(x.idVeiculo()))
                .filter(x -> regimes == null || regimes.contains(x.regime()))
                .filter(x -> situacoes == null || situacoes.contains(x.situacao()))
                .filter(x -> idsProcesso == null || (processos.containsKey(x.idVeiculo())
                        && idsProcesso.contains(processos.get(x.idVeiculo()).id())))
                .toList();
    }

    static boolean filtroVazio(RelatorioGerencialFrotaFilter f) {
        return conjunto(f.idBase()) == null && conjunto(f.idTipoVeiculo()) == null && conjunto(f.idVeiculo()) == null
                && conjunto(f.idProcesso()) == null && maiusculas(f.regime()) == null && maiusculas(f.situacao()) == null;
    }

    record Processo(UUID id, String nome) {
    }

    /** Processo de cada veículo pela equipe ativa a que ele está vinculado. */
    Map<UUID, Processo> processosPorVeiculo() {
        Map<UUID, Processo> mapa = new HashMap<>();
        for (EquipeResponse e : equipes.listarEquipesAtivas()) {
            if (e.veiculo() != null && e.processo() != null) {
                mapa.putIfAbsent(e.veiculo().id(), new Processo(e.processo().id(), e.processo().nome()));
            }
        }
        return mapa;
    }

    private Map<UUID, String> nomesDasBases(List<Ficha> fichas) {
        var ids = fichas.stream().map(Ficha::idBase).filter(Objects::nonNull).collect(Collectors.toSet());
        if (ids.isEmpty()) return Map.of();
        return bases.buscarPorIdsResponse(ids).values().stream()
                .collect(Collectors.toMap(BaseOperacionalResponse::id, BaseOperacionalResponse::nome, (a, b) -> a));
    }

    // ── Cálculo de uma janela ──────────────────────────────────────────────────────

    record Janela(LocalDate de, LocalDate ate, OffsetDateTime agora) {
        OffsetDateTime inicio() {
            return de.atStartOfDay(FUSO).toOffsetDateTime();
        }

        OffsetDateTime fim() {
            return ate.plusDays(1).atStartOfDay(FUSO).toOffsetDateTime();
        }

        /** Horas já transcorridas da janela (a parte futura não conta para disponibilidade). */
        double horas() {
            var limite = fim().isAfter(agora) ? agora : fim();
            return Math.max(0, Duration.between(inicio(), limite).toMinutes() / 60.0);
        }

        long diasTranscorridos() {
            return Math.max(1, (long) Math.ceil(horas() / 24.0));
        }
    }

    record Calculo(Map<UUID, EnumMap<Parte, BigDecimal>> custoVeiculo, Map<LocalDate, EnumMap<Parte, BigDecimal>> custoMes,
                   Map<UUID, Long> km, Map<LocalDate, Long> kmMes, Map<UUID, BigDecimal> litros,
                   Map<UUID, BigDecimal> valorCombustivel, long abastecimentos, Map<LocalDate, BigDecimal[]> combustivelMes,
                   List<OsConcluida> os, Map<UUID, Double> horasParado, Map<UUID, TurnoVeiculoApi.ProducaoDoVeiculo> producao,
                   Map<UUID, RelatorioGerencialFrotaRepository.ChecklistVeiculo> checklists,
                   List<RelatorioGerencialFrotaRepository.EventoConducao> eventos,
                   List<RelatorioGerencialFrotaRepository.SinistroLinha> sinistros,
                   Map<UUID, RelatorioGerencialFrotaRepository.TelemetriaVeiculo> telemetria,
                   int veiculosOperando, double horasJanela, long diasJanela) {

        BigDecimal custoTotal() {
            return custoVeiculo.values().stream().flatMap(m -> m.values().stream()).reduce(BigDecimal.ZERO, BigDecimal::add);
        }

        BigDecimal custoDe(UUID id) {
            var m = custoVeiculo.get(id);
            return m == null ? BigDecimal.ZERO : m.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        }

        long kmTotal() {
            return km.values().stream().mapToLong(Long::longValue).sum();
        }

        /** Custo dos veículos com km ÷ km rodado. */
        BigDecimal custoPorKm() {
            long total = kmTotal();
            if (total <= 0) return null;
            BigDecimal custo = km.entrySet().stream().filter(e -> e.getValue() > 0).map(e -> custoDe(e.getKey()))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            return dividir(custo, BigDecimal.valueOf(total), 4);
        }

        BigDecimal disponibilidade() {
            double frota = veiculosOperando * horasJanela;
            if (frota <= 0) return null;
            double parado = horasParado.values().stream().mapToDouble(Double::doubleValue).sum();
            return BigDecimal.valueOf(Math.max(0, 1 - parado / frota)).setScale(4, RoundingMode.HALF_UP);
        }

        BigDecimal percentualPreventiva() {
            if (os.isEmpty()) return null;
            long preventivas = os.stream().filter(o -> "PREVENTIVA".equals(o.tipoManutencao())).count();
            return dividir(BigDecimal.valueOf(preventivas), BigDecimal.valueOf(os.size()), 4);
        }

        BigDecimal faturado() {
            return producao.values().stream().map(TurnoVeiculoApi.ProducaoDoVeiculo::valorFaturado)
                    .filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
        }

        /** Custo dos veículos que produziram ÷ o faturamento deles. */
        BigDecimal custoSobreFaturamento() {
            BigDecimal faturado = faturado();
            if (faturado.signum() <= 0) return null;
            BigDecimal custo = producao.keySet().stream().map(this::custoDe).reduce(BigDecimal.ZERO, BigDecimal::add);
            return dividir(custo, faturado, 4);
        }

        BigDecimal mttrHoras() {
            var horas = os.stream().filter(o -> "CORRETIVA".equals(o.tipoManutencao()))
                    .map(RelatorioGerencialFrotaUseCases::horasDeReparo).filter(Objects::nonNull).toList();
            if (horas.isEmpty()) return null;
            return BigDecimal.valueOf(horas.stream().mapToDouble(Double::doubleValue).average().orElse(0))
                    .setScale(1, RoundingMode.HALF_UP);
        }

        BigDecimal mtbfDias() {
            long corretivas = os.stream().filter(o -> "CORRETIVA".equals(o.tipoManutencao())).count();
            if (corretivas == 0 || veiculosOperando == 0) return null;
            return dividir(BigDecimal.valueOf((long) veiculosOperando * diasJanela), BigDecimal.valueOf(corretivas), 1);
        }

        BigDecimal litrosTotal() {
            return litros.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        }

        BigDecimal valorCombustivelTotal() {
            return valorCombustivel.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        }

        /** Km dos veículos que abasteceram ÷ litros deles. */
        BigDecimal kmPorLitro() {
            BigDecimal l = litrosTotal();
            if (l.signum() <= 0) return null;
            long kmAbastecidos = litros.entrySet().stream().filter(e -> e.getValue().signum() > 0)
                    .mapToLong(e -> km.getOrDefault(e.getKey(), 0L)).sum();
            return kmAbastecidos <= 0 ? null : dividir(BigDecimal.valueOf(kmAbastecidos), l, 2);
        }

        long eventosTotal() {
            return eventos.stream().mapToLong(RelatorioGerencialFrotaRepository.EventoConducao::total).sum();
        }

        BigDecimal coberturaChecklist(Map<UUID, Ficha> fichas, int diasUteis) {
            var ativos = fichas.values().stream().filter(f -> "ATIVO".equals(f.situacao())).map(Ficha::idVeiculo).toList();
            if (ativos.isEmpty() || diasUteis <= 0) return null;
            long feitos = ativos.stream().mapToLong(id -> checklists.containsKey(id) ? checklists.get(id).diasUteisComChecklist() : 0).sum();
            return dividir(BigDecimal.valueOf(feitos), BigDecimal.valueOf((long) ativos.size() * diasUteis), 4);
        }
    }

    private Calculo calcular(Set<UUID> ids, Map<UUID, Ficha> fichas, Janela j, Acesso acesso) {
        var inicio = j.inicio();
        var fim = j.fim();
        Map<UUID, EnumMap<Parte, BigDecimal>> custoVeiculo = new HashMap<>();
        Map<LocalDate, EnumMap<Parte, BigDecimal>> custoMes = new TreeMap<>();
        for (LocalDate m = j.de().withDayOfMonth(1); !m.isAfter(j.ate()); m = m.plusMonths(1)) {
            custoMes.put(m, new EnumMap<>(Parte.class));
        }

        for (var c : repositorio.custosPorMes(ids, inicio, fim, acesso.os(), acesso.despesa(), acesso.sinistro())) {
            somar(custoVeiculo, custoMes, c.idVeiculo(), c.mes(), Parte.valueOf(c.categoria()), c.valor());
        }

        Map<UUID, BigDecimal> litros = new HashMap<>();
        Map<UUID, BigDecimal> valorCombustivel = new HashMap<>();
        Map<LocalDate, BigDecimal[]> combustivelMes = new TreeMap<>();
        long abastecimentos = 0;
        if (acesso.abastecimento()) {
            for (var c : repositorio.combustivelPorMes(ids, inicio, fim)) {
                somar(custoVeiculo, custoMes, c.idVeiculo(), c.mes(), Parte.COMBUSTIVEL, c.valorTotal());
                litros.merge(c.idVeiculo(), c.litros(), BigDecimal::add);
                valorCombustivel.merge(c.idVeiculo(), c.valorCombustivel(), BigDecimal::add);
                combustivelMes.merge(c.mes(), new BigDecimal[]{c.litros(), c.valorTotal()},
                        (a, b) -> new BigDecimal[]{a[0].add(b[0]), a[1].add(b[1])});
                abastecimentos += c.abastecimentos();
            }
        }

        if (acesso.seguro()) {
            for (var c : repositorio.coberturas(j.de(), j.ate())) {
                if (!ids.contains(c.idVeiculo()) || c.vigenciaInicio() == null || c.vigenciaFim() == null) continue;
                long vigencia = ChronoUnit.DAYS.between(c.vigenciaInicio(), c.vigenciaFim()) + 1;
                if (vigencia <= 0 || c.veiculosCobertos() <= 0) continue;
                BigDecimal porDia = c.valor().divide(BigDecimal.valueOf(vigencia * c.veiculosCobertos()), 10, RoundingMode.HALF_UP);
                ratear(c.coberturaInicio(), c.coberturaFim(), j, porDia,
                        (mes, valor) -> somar(custoVeiculo, custoMes, c.idVeiculo(), mes, Parte.SEGURO, valor));
            }
        }

        for (Ficha f : fichas.values()) {
            if (!"LOCADO".equals(f.regime()) || f.custoMensalLocacao() == null || f.custoMensalLocacao().signum() <= 0) continue;
            BigDecimal porDia = f.custoMensalLocacao().divide(DIAS_MES, 10, RoundingMode.HALF_UP);
            ratear(f.inicioLocacao(), f.fimLocacao(), j, porDia,
                    (mes, valor) -> somar(custoVeiculo, custoMes, f.idVeiculo(), mes, Parte.LOCACAO, valor));
        }

        Map<UUID, Long> km = new HashMap<>();
        Map<LocalDate, Long> kmMes = new TreeMap<>();
        for (var k : repositorio.kmPorMes(ids, inicio, fim)) {
            km.merge(k.idVeiculo(), k.km(), Long::sum);
            kmMes.merge(k.mes(), k.km(), Long::sum);
        }

        List<OsConcluida> os = acesso.os() ? repositorio.osConcluidas(ids, inicio, fim) : List.of();
        Map<UUID, Double> horasParado = acesso.os()
                ? repositorio.horasParado(ids, inicio, fim, j.agora()).stream()
                .collect(Collectors.toMap(RelatorioGerencialFrotaRepository.HorasParado::idVeiculo,
                        RelatorioGerencialFrotaRepository.HorasParado::horas))
                : Map.of();

        Map<UUID, TurnoVeiculoApi.ProducaoDoVeiculo> producao = turnos.producaoPorVeiculo(inicio, fim).stream()
                .filter(p -> ids.contains(p.idVeiculo()))
                .collect(Collectors.toMap(TurnoVeiculoApi.ProducaoDoVeiculo::idVeiculo, Function.identity()));

        var checklists = acesso.checklist()
                ? repositorio.checklists(ids, inicio, fim).stream()
                .collect(Collectors.toMap(RelatorioGerencialFrotaRepository.ChecklistVeiculo::idVeiculo, Function.identity()))
                : Map.<UUID, RelatorioGerencialFrotaRepository.ChecklistVeiculo>of();
        var eventos = acesso.telemetria() ? repositorio.eventosConducao(ids, inicio, fim)
                : List.<RelatorioGerencialFrotaRepository.EventoConducao>of();
        var sinistros = acesso.sinistro() ? repositorio.sinistros(ids, inicio, fim)
                : List.<RelatorioGerencialFrotaRepository.SinistroLinha>of();
        var telemetria = acesso.telemetria()
                ? repositorio.telemetria(ids, j.de(), j.ate()).stream()
                .collect(Collectors.toMap(RelatorioGerencialFrotaRepository.TelemetriaVeiculo::idVeiculo, Function.identity()))
                : Map.<UUID, RelatorioGerencialFrotaRepository.TelemetriaVeiculo>of();

        int operando = (int) fichas.values().stream().filter(f -> !"BAIXADO".equals(f.situacao())).count();
        return new Calculo(custoVeiculo, custoMes, km, kmMes, litros, valorCombustivel, abastecimentos, combustivelMes,
                os, horasParado, producao, checklists, eventos, sinistros, telemetria, operando, j.horas(),
                j.diasTranscorridos());
    }

    private static void somar(Map<UUID, EnumMap<Parte, BigDecimal>> porVeiculo, Map<LocalDate, EnumMap<Parte, BigDecimal>> porMes,
                              UUID id, LocalDate mes, Parte parte, BigDecimal valor) {
        if (valor == null || valor.signum() == 0) return;
        porVeiculo.computeIfAbsent(id, k -> new EnumMap<>(Parte.class)).merge(parte, valor, BigDecimal::add);
        porMes.computeIfAbsent(mes.withDayOfMonth(1), k -> new EnumMap<>(Parte.class)).merge(parte, valor, BigDecimal::add);
    }

    /** Distribui um valor diário pelos meses da interseção de {@code [inicio, fim]} com a janela. */
    static void ratear(LocalDate inicio, LocalDate fim, Janela j, BigDecimal porDia,
                       java.util.function.BiConsumer<LocalDate, BigDecimal> destino) {
        LocalDate de = inicio == null || inicio.isBefore(j.de()) ? j.de() : inicio;
        LocalDate ate = fim == null || fim.isAfter(j.ate()) ? j.ate() : fim;
        for (LocalDate mes = de.withDayOfMonth(1); !de.isAfter(ate) && !mes.isAfter(ate); mes = mes.plusMonths(1)) {
            LocalDate a = mes.isBefore(de) ? de : mes;
            LocalDate b = mes.plusMonths(1).minusDays(1).isAfter(ate) ? ate : mes.plusMonths(1).minusDays(1);
            long dias = ChronoUnit.DAYS.between(a, b) + 1;
            if (dias > 0) destino.accept(mes, porDia.multiply(BigDecimal.valueOf(dias)));
        }
    }

    // ── Seções ─────────────────────────────────────────────────────────────────────

    private Custos custos(Calculo atual, Calculo anterior, Map<UUID, Ficha> fichas, Map<UUID, String> nomesBase,
                          Map<UUID, Processo> processos, Set<UUID> ids, Janela j, Acesso acesso) {
        List<Categoria> categorias = new ArrayList<>();
        for (Parte p : Parte.values()) {
            if (!acesso.ve(p)) continue;
            categorias.add(new Categoria(p.name(), p.rotulo, dinheiro(somaParte(atual, p)), dinheiro(somaParte(anterior, p))));
        }
        List<MesCusto> mensal = new ArrayList<>();
        atual.custoMes().forEach((mes, partes) -> {
            BigDecimal total = partes.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
            mensal.add(new MesCusto(mes, dinheiro(partes.get(Parte.MANUTENCAO)), dinheiro(partes.get(Parte.COMBUSTIVEL)),
                    dinheiro(partes.get(Parte.DESPESAS)), dinheiro(partes.get(Parte.SEGURO)), dinheiro(partes.get(Parte.LOCACAO)),
                    dinheiro(partes.get(Parte.FRANQUIAS)), dinheiro(total), atual.kmMes().getOrDefault(mes, 0L)));
        });
        List<Grupo> despesasPorTipo = acesso.despesa()
                ? repositorio.despesasPorTipo(ids, j.inicio(), j.fim()).stream()
                .collect(Collectors.groupingBy(RelatorioGerencialFrotaRepository.DespesaTipo::tipo, TreeMap::new,
                        Collectors.reducing(BigDecimal.ZERO, RelatorioGerencialFrotaRepository.DespesaTipo::valor, BigDecimal::add)))
                .entrySet().stream().map(e -> new Grupo(e.getKey(), e.getKey(), 0, dinheiro(e.getValue()), 0, null))
                .sorted(Comparator.comparing(Grupo::valor).reversed()).toList()
                : null;
        return new Custos(categorias, mensal,
                agrupar(fichas.values(), atual, f -> f.idBase() == null ? null : f.idBase().toString(),
                        f -> f.idBase() == null ? "Sem base" : nomesBase.getOrDefault(f.idBase(), "Base")),
                agrupar(fichas.values(), atual, f -> f.idTipo() == null ? null : f.idTipo().toString(),
                        f -> f.tipo() == null ? "Sem tipo" : f.tipo()),
                agrupar(fichas.values(), atual, Ficha::regime, f -> ROTULOS.getOrDefault(f.regime(), "Sem regime")),
                agrupar(fichas.values(), atual,
                        f -> processos.containsKey(f.idVeiculo()) ? processos.get(f.idVeiculo()).id().toString() : null,
                        f -> processos.containsKey(f.idVeiculo()) ? processos.get(f.idVeiculo()).nome() : "Sem equipe vinculada"),
                despesasPorTipo);
    }

    private static BigDecimal somaParte(Calculo c, Parte p) {
        return c.custoVeiculo().values().stream().map(m -> m.getOrDefault(p, BigDecimal.ZERO)).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static List<Grupo> agrupar(Collection<Ficha> fichas, Calculo c, Function<Ficha, String> chave,
                                       Function<Ficha, String> nome) {
        Map<String, List<Ficha>> grupos = fichas.stream()
                .collect(Collectors.groupingBy(f -> Objects.requireNonNullElse(chave.apply(f), "-"), LinkedHashMap::new, Collectors.toList()));
        return grupos.entrySet().stream().map(e -> {
            BigDecimal valor = e.getValue().stream().map(f -> c.custoDe(f.idVeiculo())).reduce(BigDecimal.ZERO, BigDecimal::add);
            long km = e.getValue().stream().mapToLong(f -> c.km().getOrDefault(f.idVeiculo(), 0L)).sum();
            BigDecimal custoKmVeiculos = e.getValue().stream().filter(f -> c.km().getOrDefault(f.idVeiculo(), 0L) > 0)
                    .map(f -> c.custoDe(f.idVeiculo())).reduce(BigDecimal.ZERO, BigDecimal::add);
            return new Grupo("-".equals(e.getKey()) ? null : e.getKey(), nome.apply(e.getValue().get(0)), e.getValue().size(),
                    dinheiro(valor), km, km > 0 ? dividir(custoKmVeiculos, BigDecimal.valueOf(km), 2) : null);
        }).sorted(Comparator.comparing(Grupo::valor).reversed()).toList();
    }

    private Manutencao manutencao(Calculo atual, Calculo anterior, Map<UUID, Ficha> fichas, Set<UUID> ids, Janela j,
                                  OffsetDateTime agora, Map<UUID, PreventivaUseCases.PendenciaPreventiva> preventivas) {
        var os = atual.os();
        long corretivas = os.stream().filter(o -> "CORRETIVA".equals(o.tipoManutencao())).count();
        BigDecimal valor = os.stream().map(OsConcluida::valor).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal valorAnterior = anterior.os().stream().map(OsConcluida::valor).reduce(BigDecimal.ZERO, BigDecimal::add);

        var abertas = repositorio.osAbertas(ids);
        long ate7 = 0, ate30 = 0, acima30 = 0, atrasadas = 0, paradas = 0;
        List<OsFila> fila = new ArrayList<>();
        for (var o : abertas) {
            long dias = o.abertaEm() == null ? 0 : ChronoUnit.DAYS.between(o.abertaEm(), agora);
            if (dias <= 7) ate7++; else if (dias <= 30) ate30++; else acima30++;
            boolean atrasada = o.previsaoTermino() != null && o.previsaoTermino().isBefore(agora);
            if (atrasada) atrasadas++;
            if (o.veiculoParado()) paradas++;
            fila.add(new OsFila(o.id(), o.numero(), o.idVeiculo(), o.placa(), o.situacao(), o.criticidade(),
                    o.tipoManutencao(), o.abertaEm(), dias, atrasada, o.veiculoParado()));
        }
        var paradosAgora = abertas.stream().filter(RelatorioGerencialFrotaRepository.OsAberta::veiculoParado)
                .map(o -> {
                    var desde = o.paradoDesde() == null ? o.abertaEm() : o.paradoDesde();
                    return new VeiculoParado(o.idVeiculo(), o.placa(), o.id(), o.numero(), desde,
                            desde == null ? 0 : ChronoUnit.DAYS.between(desde, agora), o.descricao());
                })
                .sorted(Comparator.comparing(VeiculoParado::dias).reversed()).toList();

        var porOficina = os.stream().collect(Collectors.groupingBy(OsConcluida::oficina)).entrySet().stream()
                .map(e -> {
                    var horas = e.getValue().stream().filter(o -> o.inicioReal() != null && o.fimReal() != null)
                            .mapToDouble(o -> Duration.between(o.inicioReal(), o.fimReal()).toMinutes() / 60.0).average();
                    return new Oficina(e.getKey(), e.getValue().size(),
                            dinheiro(e.getValue().stream().map(OsConcluida::valor).reduce(BigDecimal.ZERO, BigDecimal::add)),
                            horas.isPresent() ? BigDecimal.valueOf(horas.getAsDouble()).setScale(1, RoundingMode.HALF_UP) : null);
                })
                .sorted(Comparator.comparing(Oficina::valor).reversed()).toList();

        var retrabalho = repositorio.retrabalhos(ids, j.inicio(), j.fim(), DIAS_RETRABALHO).stream()
                .map(r -> new RetrabalhoLinha(r.idOs(), r.numero(), r.idVeiculo(), placa(fichas, r.idVeiculo()), r.item(),
                        r.numeroAnterior(), r.dias()))
                .toList();

        Map<LocalDate, long[]> contagemMes = new TreeMap<>();
        Map<LocalDate, BigDecimal> valorMes = new TreeMap<>();
        atual.custoMes().keySet().forEach(m -> {
            contagemMes.put(m, new long[2]);
            valorMes.put(m, BigDecimal.ZERO);
        });
        for (var o : os) {
            LocalDate mes = o.fimReal().atZoneSameInstant(FUSO).toLocalDate().withDayOfMonth(1);
            var c = contagemMes.computeIfAbsent(mes, k -> new long[2]);
            c["PREVENTIVA".equals(o.tipoManutencao()) ? 1 : 0]++;
            valorMes.merge(mes, o.valor(), BigDecimal::add);
        }
        var mensal = contagemMes.entrySet().stream()
                .map(e -> new MesManutencao(e.getKey(), e.getValue()[0], e.getValue()[1], dinheiro(valorMes.get(e.getKey()))))
                .toList();

        long vencidas = 0, proximas = 0;
        for (UUID id : ids) {
            var p = preventivas.get(id);
            if (p != null) {
                vencidas += p.vencidas();
                proximas += p.proximas();
            }
        }

        return new Manutencao(
                ind(BigDecimal.valueOf(os.size()), BigDecimal.valueOf(anterior.os().size())),
                corretivas, os.size() - corretivas,
                ind(dinheiro(valor), dinheiro(valorAnterior)),
                ind(atual.percentualPreventiva(), anterior.percentualPreventiva()),
                ind(atual.mttrHoras(), anterior.mttrHoras()),
                ind(atual.mtbfDias(), anterior.mtbfDias()),
                ind(atual.disponibilidade(), anterior.disponibilidade()),
                new Fila(abertas.size(), ate7, ate30, acima30, atrasadas, paradas),
                fila.stream().sorted(Comparator.comparing(OsFila::diasAberta).reversed()).limit(50).toList(),
                paradosAgora,
                contar(os.stream().map(OsConcluida::origem).toList()),
                contar(os.stream().filter(o -> "CORRETIVA".equals(o.tipoManutencao()))
                        .map(o -> o.causa() == null ? "SEM_CAUSA" : o.causa()).toList()),
                porOficina, retrabalho, vencidas, proximas, mensal);
    }

    private Combustivel combustivel(Calculo atual, Calculo anterior, Map<UUID, Ficha> fichas, Set<UUID> ids, Janela j) {
        long fora = fichas.values().stream().filter(f -> foraDoPadrao(f, atual)).count();
        var postos = repositorio.combustivelPorPosto(ids, j.inicio(), j.fim()).stream()
                .map(p -> new Posto(p.idPosto(), p.posto(), p.abastecimentos(), p.litros(), dinheiro(p.valor()),
                        p.litros().signum() > 0 ? dividir(p.valor(), p.litros(), 3) : null))
                .toList();
        var produtos = repositorio.combustivelPorProduto(ids, j.inicio(), j.fim()).stream()
                .map(p -> new Produto(p.produto(), p.categoria(), p.quantidade(), dinheiro(p.valor()))).toList();
        var mensal = new ArrayList<MesCombustivel>();
        atual.custoMes().keySet().forEach(m -> {
            var v = atual.combustivelMes().get(m);
            BigDecimal litros = v == null ? BigDecimal.ZERO : v[0];
            BigDecimal valor = v == null ? BigDecimal.ZERO : v[1];
            mensal.add(new MesCombustivel(m, litros, dinheiro(valor), litros.signum() > 0 ? dividir(valor, litros, 3) : null));
        });
        return new Combustivel(
                ind(atual.litrosTotal(), anterior.litrosTotal()),
                ind(dinheiro(somaParte(atual, Parte.COMBUSTIVEL)), dinheiro(somaParte(anterior, Parte.COMBUSTIVEL))),
                ind(preco(atual), preco(anterior)),
                ind(atual.kmPorLitro(), anterior.kmPorLitro()),
                atual.abastecimentos(), fora, produtos, postos,
                repositorio.alertasAbastecimento(ids, j.inicio(), j.fim()).stream()
                        .map(a -> new Contagem(a.chave(), rotulo(a.chave()), a.total())).toList(),
                mensal);
    }

    private static BigDecimal preco(Calculo c) {
        BigDecimal l = c.litrosTotal();
        return l.signum() > 0 ? dividir(c.valorCombustivelTotal(), l, 3) : null;
    }

    private static boolean foraDoPadrao(Ficha f, Calculo c) {
        BigDecimal kmL = kmPorLitro(f.idVeiculo(), c);
        return kmL != null && f.consumoReferenciaKmL() != null && f.consumoReferenciaKmL().signum() > 0
                && kmL.compareTo(f.consumoReferenciaKmL().multiply(TOLERANCIA_CONSUMO)) < 0;
    }

    private static BigDecimal kmPorLitro(UUID id, Calculo c) {
        BigDecimal l = c.litros().get(id);
        long km = c.km().getOrDefault(id, 0L);
        return l == null || l.signum() <= 0 || km <= 0 ? null : dividir(BigDecimal.valueOf(km), l, 2);
    }

    private Uso uso(Calculo atual, Calculo anterior, Map<UUID, Ficha> fichas, Map<UUID, String> nomesBase, Acesso acesso) {
        var ociosos = fichas.values().stream()
                .filter(f -> "ATIVO".equals(f.situacao()) || "RESERVA".equals(f.situacao()))
                .filter(f -> atual.km().getOrDefault(f.idVeiculo(), 0L) == 0 && !atual.producao().containsKey(f.idVeiculo()))
                .filter(f -> !atual.telemetria().containsKey(f.idVeiculo()) || atual.telemetria().get(f.idVeiculo()).kmTelemetria() < 1)
                .map(f -> ref(f, nomesBase)).toList();
        long turnosTotal = atual.producao().values().stream().mapToLong(TurnoVeiculoApi.ProducaoDoVeiculo::turnos).sum();
        long notas = atual.producao().values().stream().mapToLong(TurnoVeiculoApi.ProducaoDoVeiculo::notasConcluidas).sum();
        BigDecimal ligado = null, fora = null;
        if (acesso.telemetria()) {
            ligado = BigDecimal.valueOf(atual.telemetria().values().stream()
                    .mapToLong(RelatorioGerencialFrotaRepository.TelemetriaVeiculo::minutosLigadoParado).sum())
                    .divide(BigDecimal.valueOf(60), 1, RoundingMode.HALF_UP);
            fora = BigDecimal.valueOf(atual.telemetria().values().stream()
                    .mapToDouble(RelatorioGerencialFrotaRepository.TelemetriaVeiculo::kmForaExpediente).sum())
                    .setScale(1, RoundingMode.HALF_UP);
        }
        var mensal = atual.custoMes().keySet().stream().map(m -> new MesUso(m, atual.kmMes().getOrDefault(m, 0L))).toList();
        return new Uso(
                ind(BigDecimal.valueOf(atual.kmTotal()), BigDecimal.valueOf(anterior.kmTotal())),
                atual.km().values().stream().filter(k -> k > 0).count(),
                ociosos, turnosTotal, notas,
                ind(dinheiro(atual.faturado()), dinheiro(anterior.faturado())),
                ind(atual.custoSobreFaturamento(), anterior.custoSobreFaturamento()),
                acesso.telemetria() && !atual.telemetria().isEmpty(), ligado, fora, mensal);
    }

    private Conformidade conformidade(Calculo atual, Calculo anterior, Map<UUID, Ficha> fichas, Set<UUID> ids,
                                      Map<UUID, String> nomesBase, LocalDate hoje, int diasUteis, Acesso acesso,
                                      boolean frotaInteira, Janela j) {
        Indicador cobertura = null;
        long abaixoMeta = 0, pendencias = 0;
        if (acesso.checklist()) {
            cobertura = ind(atual.coberturaChecklist(fichas, diasUteis),
                    anterior.coberturaChecklist(fichas, diasUteis(j.de().minusDays(ChronoUnit.DAYS.between(j.de(), j.ate()) + 1), j.de().minusDays(1))));
            abaixoMeta = fichas.values().stream().filter(f -> "ATIVO".equals(f.situacao()))
                    .filter(f -> {
                        var c = coberturaDoVeiculo(f.idVeiculo(), atual, diasUteis);
                        return c != null && c.compareTo(META_CHECKLIST) < 0;
                    }).count();
            pendencias = repositorio.pendenciasChecklistAbertas(ids).stream()
                    .mapToLong(RelatorioGerencialFrotaRepository.Contagem::total).sum();
        }

        List<Documento> documentos = List.of();
        long docVencidos = 0, docAVencer = 0;
        if (acesso.documento()) {
            documentos = repositorio.documentosVencendo(ids, hoje.plusDays(DIAS_A_VENCER)).stream()
                    .map(d -> new Documento(d.id(), d.idVeiculo(), placa(fichas, d.idVeiculo()), d.tipo(), d.descricao(),
                            d.vencimento(), d.vencimento().isBefore(hoje)))
                    .toList();
            docVencidos = documentos.stream().filter(Documento::vencido).count();
            docAVencer = documentos.size() - docVencidos;
        }

        List<Cnh> cnh = List.of();
        long cnhVencidas = 0, cnhAVencer = 0;
        if (acesso.condutor()) {
            Set<UUID> doRecorte = frotaInteira ? null : repositorio.vinculosAtuais(ids).stream()
                    .map(RelatorioGerencialFrotaRepository.VinculoAtual::idColaborador).collect(Collectors.toSet());
            var vencendo = repositorio.cnhVencendo(hoje.plusDays(DIAS_A_VENCER)).stream()
                    .filter(c -> doRecorte == null || doRecorte.contains(c.idColaborador())).toList();
            var nomes = nomes(vencendo.stream().map(RelatorioGerencialFrotaRepository.CnhVencendo::idColaborador).toList());
            cnh = vencendo.stream().map(c -> new Cnh(c.idCondutor(), c.idColaborador(),
                    nomes.getOrDefault(c.idColaborador(), "Condutor"), c.categoria(), c.validade(), c.validade().isBefore(hoje))).toList();
            cnhVencidas = cnh.stream().filter(Cnh::vencida).count();
            cnhAVencer = cnh.size() - cnhVencidas;
        }

        List<VeiculoRef> semSeguro = null;
        List<Apolice> vencendoApolices = null;
        if (acesso.seguro()) {
            Set<UUID> cobertos = repositorio.coberturas(hoje, hoje).stream()
                    .map(RelatorioGerencialFrotaRepository.Cobertura::idVeiculo).collect(Collectors.toSet());
            semSeguro = fichas.values().stream().filter(f -> !"BAIXADO".equals(f.situacao()))
                    .filter(f -> !cobertos.contains(f.idVeiculo())).map(f -> ref(f, nomesBase)).toList();
            var vencendo = repositorio.apolicesVencendo(hoje, hoje.plusDays(DIAS_APOLICE_VENCENDO));
            Map<UUID, String> seguradoras = vencendo.isEmpty() ? Map.of() : financeiro.nomesFornecedores(vencendo.stream()
                    .map(RelatorioGerencialFrotaRepository.ApoliceVencendo::idSeguradora).filter(Objects::nonNull).toList());
            vencendoApolices = vencendo.stream().map(a -> new Apolice(a.id(), a.numero(),
                    seguradoras.get(a.idSeguradora()), a.fim(), a.veiculos())).toList();
        }

        Sinistros sinistros = null;
        if (acesso.sinistro()) {
            var lista = atual.sinistros();
            sinistros = new Sinistros(
                    ind(BigDecimal.valueOf(lista.size()), BigDecimal.valueOf(anterior.sinistros().size())),
                    lista.stream().filter(s -> Boolean.TRUE.equals(s.culpaCondutor())).count(),
                    dinheiro(lista.stream().map(RelatorioGerencialFrotaRepository.SinistroLinha::franquia)
                            .filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add)),
                    contar(lista.stream().map(RelatorioGerencialFrotaRepository.SinistroLinha::tipo).toList()),
                    lista.stream().limit(100).map(s -> new Sinistro(s.id(), s.numero(), s.idVeiculo(), placa(fichas, s.idVeiculo()),
                            s.tipo(), s.situacao(), s.culpaCondutor(), s.franquia(), s.ocorridoEm())).toList());
        }

        Eventos eventos = null;
        if (acesso.telemetria()) {
            long total = atual.eventosTotal();
            long totalAnterior = anterior.eventosTotal();
            Map<String, Long> porTipo = new TreeMap<>();
            atual.eventos().forEach(e -> porTipo.merge(e.tipo(), e.total(), Long::sum));
            eventos = new Eventos(ind(BigDecimal.valueOf(total), BigDecimal.valueOf(totalAnterior)),
                    ind(por100Km(total, atual.kmTotal()), por100Km(totalAnterior, anterior.kmTotal())),
                    porTipo.entrySet().stream().map(e -> new Contagem(e.getKey(), rotulo(e.getKey()), e.getValue()))
                            .sorted(Comparator.comparingLong(Contagem::total).reversed()).toList());
        }

        List<Condutor> condutores = acesso.condutor() && (acesso.telemetria() || acesso.sinistro())
                ? rankingCondutores(atual) : null;

        Acidentes acidentes = acidentes(ids, fichas, j);

        return new Conformidade(cobertura, abaixoMeta, pendencias, docVencidos, docAVencer, documentos, cnhVencidas,
                cnhAVencer, cnh, semSeguro, vencendoApolices, sinistros, eventos, condutores, acidentes);
    }

    private List<Condutor> rankingCondutores(Calculo c) {
        Map<String, long[]> porPessoa = new HashMap<>();
        Map<String, String> nomeExterno = new HashMap<>();
        for (var e : c.eventos()) {
            String chave = e.idColaborador() != null ? e.idColaborador().toString()
                    : e.motorista() == null || e.motorista().isBlank() ? null : "nome:" + e.motorista().trim().toUpperCase(Locale.ROOT);
            if (chave == null) continue;
            porPessoa.computeIfAbsent(chave, k -> new long[3])[0] += e.total();
            if (e.idColaborador() == null) nomeExterno.put(chave, e.motorista().trim());
        }
        for (var s : c.sinistros()) {
            // No sinistro, o condutor é o colaborador que dirigia.
            UUID colab = s.idCondutor();
            if (colab == null) continue;
            var v = porPessoa.computeIfAbsent(colab.toString(), k -> new long[3]);
            v[1]++;
            if (Boolean.TRUE.equals(s.culpaCondutor())) v[2]++;
        }
        var ids = porPessoa.keySet().stream().filter(k -> !k.startsWith("nome:")).map(UUID::fromString).toList();
        var nomes = nomes(ids);
        return porPessoa.entrySet().stream().map(e -> {
            boolean externo = e.getKey().startsWith("nome:");
            UUID id = externo ? null : UUID.fromString(e.getKey());
            String nome = externo ? nomeExterno.get(e.getKey()) : nomes.getOrDefault(id, "Condutor");
            return new Condutor(id, nome, e.getValue()[0], e.getValue()[1], e.getValue()[2]);
        }).sorted(Comparator.comparingLong((Condutor x) -> x.sinistrosComCulpa() * 10 + x.sinistros() * 5 + x.eventos()).reversed())
                .limit(30).toList();
    }

    private Acidentes acidentes(Set<UUID> ids, Map<UUID, Ficha> fichas, Janela j) {
        var lista = sst.listarEventosComVeiculo(j.inicio(), j.fim()).stream().filter(e -> ids.contains(e.idVeiculo()))
                .map(e -> new Acidente(e.idEvento(), e.idVeiculo(), placa(fichas, e.idVeiculo()), e.tipo(), e.rotuloTipo(),
                        e.ocorridoEm(), e.diasPerdidos()))
                .toList();
        Map<String, long[]> porTipo = new LinkedHashMap<>();
        Map<String, String> rotulos = new HashMap<>();
        lista.forEach(a -> {
            porTipo.computeIfAbsent(a.tipo(), k -> new long[1])[0]++;
            rotulos.put(a.tipo(), a.rotulo());
        });
        return new Acidentes(lista.size(), lista.stream().mapToLong(Acidente::diasPerdidos).sum(),
                porTipo.entrySet().stream().map(e -> new Contagem(e.getKey(), rotulos.get(e.getKey()), e.getValue()[0])).toList(),
                lista);
    }

    // ── Por veículo ────────────────────────────────────────────────────────────────

    private List<VeiculoLinha> linhasPorVeiculo(Map<UUID, Ficha> fichas, Calculo c, Calculo anterior, Map<UUID, String> nomesBase,
                                                Map<UUID, Processo> processos,
                                                Map<UUID, PreventivaUseCases.PendenciaPreventiva> preventivas,
                                                int diasUteis, Acesso acesso) {
        Map<UUID, Long> pendencias = acesso.checklist()
                ? repositorio.pendenciasChecklistAbertas(fichas.keySet()).stream()
                .collect(Collectors.toMap(p -> UUID.fromString(p.chave()), RelatorioGerencialFrotaRepository.Contagem::total))
                : Map.of();
        Map<UUID, long[]> osPorVeiculo = new HashMap<>();
        c.os().forEach(o -> osPorVeiculo.computeIfAbsent(o.idVeiculo(), k -> new long[2])["PREVENTIVA".equals(o.tipoManutencao()) ? 1 : 0]++);
        Map<UUID, Long> eventos = new HashMap<>();
        c.eventos().forEach(e -> eventos.merge(e.idVeiculo(), e.total(), Long::sum));
        Map<UUID, Long> sinistros = new HashMap<>();
        c.sinistros().forEach(s -> sinistros.merge(s.idVeiculo(), 1L, Long::sum));

        List<VeiculoLinha> linhas = new ArrayList<>();
        for (Ficha f : fichas.values()) {
            UUID id = f.idVeiculo();
            var partes = c.custoVeiculo().getOrDefault(id, new EnumMap<>(Parte.class));
            BigDecimal total = c.custoDe(id);
            long km = c.km().getOrDefault(id, 0L);
            var prod = c.producao().get(id);
            var os = osPorVeiculo.getOrDefault(id, new long[2]);
            double parado = c.horasParado().getOrDefault(id, 0.0);
            boolean operando = !"BAIXADO".equals(f.situacao());
            var tel = c.telemetria().get(id);
            var checklist = c.checklists().get(id);
            BigDecimal faturado = prod == null ? BigDecimal.ZERO : prod.valorFaturado();
            linhas.add(new VeiculoLinha(id, f.placa(), f.idBase() == null ? null : nomesBase.get(f.idBase()), f.tipo(),
                    f.regime(), f.situacao(), processos.containsKey(id) ? processos.get(id).nome() : null,
                    acesso.os() ? dinheiro(partes.get(Parte.MANUTENCAO)) : null,
                    acesso.abastecimento() ? dinheiro(partes.get(Parte.COMBUSTIVEL)) : null,
                    acesso.despesa() ? dinheiro(partes.get(Parte.DESPESAS)) : null,
                    acesso.seguro() ? dinheiro(partes.get(Parte.SEGURO)) : null,
                    dinheiro(partes.get(Parte.LOCACAO)),
                    acesso.sinistro() ? dinheiro(partes.get(Parte.FRANQUIAS)) : null,
                    dinheiro(total), km, km > 0 ? dividir(total, BigDecimal.valueOf(km), 2) : null,
                    acesso.abastecimento() ? c.litros().getOrDefault(id, BigDecimal.ZERO) : null,
                    acesso.abastecimento() ? kmPorLitro(id, c) : null, f.consumoReferenciaKmL(),
                    os[0] + os[1], os[0], os[1],
                    acesso.os() ? BigDecimal.valueOf(parado).setScale(1, RoundingMode.HALF_UP) : null,
                    acesso.os() && operando && c.horasJanela() > 0
                            ? BigDecimal.valueOf(Math.max(0, 1 - parado / c.horasJanela())).setScale(4, RoundingMode.HALF_UP) : null,
                    preventivas.containsKey(id) ? preventivas.get(id).vencidas() : 0,
                    prod == null ? 0 : prod.turnos(), prod == null ? 0 : prod.notasConcluidas(), dinheiro(faturado),
                    faturado.signum() > 0 ? dividir(total, faturado, 4) : null,
                    acesso.checklist() ? (checklist == null ? 0L : checklist.diasUteisComChecklist()) : null,
                    acesso.checklist() && "ATIVO".equals(f.situacao()) ? coberturaDoVeiculo(id, c, diasUteis) : null,
                    acesso.checklist() ? pendencias.getOrDefault(id, 0L) : null,
                    acesso.telemetria() ? eventos.getOrDefault(id, 0L) : null,
                    acesso.sinistro() ? sinistros.getOrDefault(id, 0L) : null,
                    tel == null ? null : BigDecimal.valueOf(tel.minutosLigadoParado()).divide(BigDecimal.valueOf(60), 1, RoundingMode.HALF_UP),
                    tel == null ? null : BigDecimal.valueOf(tel.kmForaExpediente()).setScale(1, RoundingMode.HALF_UP),
                    f.idBase(), f.idTipo(), processos.containsKey(id) ? processos.get(id).id() : null,
                    dinheiro(anterior.custoDe(id)), anterior.km().getOrDefault(id, 0L)));
        }
        linhas.sort(Comparator.comparing(VeiculoLinha::total).reversed().thenComparing(VeiculoLinha::placa));
        return linhas;
    }

    private static BigDecimal coberturaDoVeiculo(UUID id, Calculo c, int diasUteis) {
        if (diasUteis <= 0) return null;
        var checklist = c.checklists().get(id);
        long dias = checklist == null ? 0 : checklist.diasUteisComChecklist();
        return dividir(BigDecimal.valueOf(Math.min(dias, diasUteis)), BigDecimal.valueOf(diasUteis), 4);
    }

    // ── Auxiliares ─────────────────────────────────────────────────────────────────

    /** Dias de segunda a sexta em {@code [de, ate]}. */
    static int diasUteis(LocalDate de, LocalDate ate) {
        int dias = 0;
        for (LocalDate d = de; !d.isAfter(ate); d = d.plusDays(1)) {
            if (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY) dias++;
        }
        return dias;
    }

    static Double horasDeReparo(OsConcluida o) {
        var inicio = o.veiculoParado() && o.paradoDesde() != null ? o.paradoDesde() : o.inicioReal();
        var fim = o.veiculoParado() && o.liberadoEm() != null ? o.liberadoEm() : o.fimReal();
        if (inicio == null || fim == null || fim.isBefore(inicio)) return null;
        return Duration.between(inicio, fim).toMinutes() / 60.0;
    }

    private static BigDecimal custoVeiculoMes(BigDecimal custo, int veiculos, int dias) {
        if (veiculos <= 0 || dias <= 0) return null;
        return dividir(custo, BigDecimal.valueOf(veiculos).multiply(BigDecimal.valueOf(dias)).divide(DIAS_MES, 6, RoundingMode.HALF_UP), 2);
    }

    private static BigDecimal por100Km(long eventos, long km) {
        return km <= 0 ? null : dividir(BigDecimal.valueOf(eventos * 100), BigDecimal.valueOf(km), 2);
    }

    Map<UUID, String> nomes(Collection<UUID> ids) {
        if (ids.isEmpty()) return Map.of();
        return colaboradores.buscarResumosPorIds(new HashSet<>(ids)).values().stream()
                .collect(Collectors.toMap(ResumoColaborador::id, ResumoColaborador::nomeCompleto, (a, b) -> a));
    }

    private static List<Contagem> contar(List<String> chaves) {
        return chaves.stream().filter(Objects::nonNull).collect(Collectors.groupingBy(k -> k, Collectors.counting()))
                .entrySet().stream().map(e -> new Contagem(e.getKey(), rotulo(e.getKey()), e.getValue()))
                .sorted(Comparator.comparingLong(Contagem::total).reversed()).toList();
    }

    private static String rotulo(String chave) {
        return ROTULOS.getOrDefault(chave, chave);
    }

    private static VeiculoRef ref(Ficha f, Map<UUID, String> nomesBase) {
        return new VeiculoRef(f.idVeiculo(), f.placa(), f.idBase() == null ? null : nomesBase.get(f.idBase()), f.tipo(), f.situacao());
    }

    private static String placa(Map<UUID, Ficha> fichas, UUID id) {
        var f = fichas.get(id);
        return f == null ? null : f.placa();
    }

    private static Indicador ind(BigDecimal atual, BigDecimal anterior) {
        return new Indicador(atual, anterior);
    }

    private static BigDecimal dinheiro(BigDecimal v) {
        return (v == null ? BigDecimal.ZERO : v).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal dividir(BigDecimal a, BigDecimal b, int escala) {
        return b == null || b.signum() == 0 ? null : a.divide(b, escala, RoundingMode.HALF_UP);
    }

    private static Set<UUID> conjunto(List<UUID> lista) {
        return lista == null || lista.isEmpty() ? null : Set.copyOf(lista.stream().filter(Objects::nonNull).toList());
    }

    private static Set<String> maiusculas(List<String> lista) {
        return lista == null || lista.isEmpty() ? null
                : lista.stream().filter(Objects::nonNull).map(s -> s.toUpperCase(Locale.ROOT)).collect(Collectors.toSet());
    }

    /** O que a pessoa pode ler. A locação vem com a leitura do veículo. */
    record Acesso(boolean os, boolean abastecimento, boolean despesa, boolean seguro, boolean sinistro, boolean checklist,
                  boolean documento, boolean condutor, boolean telemetria) {

        static Acesso doUsuario() {
            return new Acesso(SecurityUtils.possuiAutoridade("frota:os:read"),
                    SecurityUtils.possuiAutoridade("frota:abastecimento:read"),
                    SecurityUtils.possuiAutoridade("frota:despesa:read"),
                    SecurityUtils.possuiAutoridade("frota:seguro:read"),
                    SecurityUtils.possuiAutoridade("frota:sinistro:read"),
                    SecurityUtils.possuiAutoridade("frota:checklist:read"),
                    SecurityUtils.possuiAutoridade("frota:documento:read"),
                    SecurityUtils.possuiAutoridade("frota:condutor:read"),
                    SecurityUtils.possuiAutoridade("frota:telemetria:read"));
        }

        boolean ve(Parte p) {
            return switch (p) {
                case MANUTENCAO -> os;
                case COMBUSTIVEL -> abastecimento;
                case DESPESAS -> despesa;
                case SEGURO -> seguro;
                case LOCACAO -> true;
                case FRANQUIAS -> sinistro;
            };
        }

        List<String> omitidas() {
            return java.util.Arrays.stream(Parte.values()).filter(p -> !ve(p)).map(p -> p.rotulo).toList();
        }
    }
}
