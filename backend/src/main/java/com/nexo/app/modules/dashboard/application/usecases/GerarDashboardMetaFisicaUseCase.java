package com.nexo.app.modules.dashboard.application.usecases;

import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaFilter;
import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaResponse;
import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaResponse.Base;
import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaResponse.Dia;
import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaResponse.Equipe;
import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaResponse.Historico;
import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaResponse.Meta;
import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaResponse.Producao;
import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaResponse.TipoServico;
import com.nexo.app.modules.dashboard.domain.CalendarioOperacional;
import com.nexo.app.modules.execucao.ExecucaoComercialApi;
import com.nexo.app.modules.execucao.MetaFisicaApi;
import com.nexo.app.modules.execucao.MetaFisicaApi.MetaFisicaPublica;
import com.nexo.app.modules.execucao.TipoServicoApi;
import com.nexo.app.modules.execucao.application.dto.LancamentoResumido;
import com.nexo.app.modules.execucao.application.dto.TipoServicoResponse;
import com.nexo.app.modules.rh.BaseOperacionalApi;
import com.nexo.app.modules.rh.BaseOperacionalResponse;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.EquipeResponse;
import com.nexo.app.shared.application.SelecaoMultipla;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Monta o painel da meta física da Concessionária: a meta do mês de cada base por tipo de
 * serviço e as notas concluídas que contam para ela.
 *
 * <p>A nota cujos serviços são todos improdutivos (serviço não efetuado) não conta;
 * as demais contam uma vez, pelo tipo de serviço informado no lançamento, para a base
 * da equipe que a lançou — a mesma regra de base e de status (nota concluída) dos
 * demais dashboards de execução. O histórico traz os cinco meses anteriores para
 * comparar o atingimento mês a mês.</p>
 */
@Service
public class GerarDashboardMetaFisicaUseCase {

    static final int MESES_HISTORICO = 6;

    private final MetaFisicaApi metaFisicaApi;
    private final EquipeApi equipeApi;
    private final BaseOperacionalApi baseOperacionalApi;
    private final TipoServicoApi tipoServicoApi;
    private final ExecucaoComercialApi execucaoApi;
    private final Clock clock;

    @Autowired
    public GerarDashboardMetaFisicaUseCase(MetaFisicaApi metaFisicaApi, EquipeApi equipeApi,
                                           BaseOperacionalApi baseOperacionalApi, TipoServicoApi tipoServicoApi,
                                           ExecucaoComercialApi execucaoApi) {
        this(metaFisicaApi, equipeApi, baseOperacionalApi, tipoServicoApi, execucaoApi,
                Clock.system(CalendarioOperacional.FUSO));
    }

    GerarDashboardMetaFisicaUseCase(MetaFisicaApi metaFisicaApi, EquipeApi equipeApi,
                                    BaseOperacionalApi baseOperacionalApi, TipoServicoApi tipoServicoApi,
                                    ExecucaoComercialApi execucaoApi, Clock clock) {
        this.metaFisicaApi = metaFisicaApi;
        this.equipeApi = equipeApi;
        this.baseOperacionalApi = baseOperacionalApi;
        this.tipoServicoApi = tipoServicoApi;
        this.execucaoApi = execucaoApi;
        this.clock = clock;
    }

    private record Celula(YearMonth mes, UUID idBase, UUID idTipo) {
    }

    private record ChaveProducao(LocalDate data, UUID idBase, UUID idTipo, UUID idEquipe) {
    }

    @Transactional(readOnly = true)
    public DashboardMetaFisicaResponse executar(DashboardMetaFisicaFilter filter) {
        LocalDate hoje = LocalDate.now(clock);
        YearMonth mes = filter.competencia() != null ? filter.competencia() : YearMonth.from(hoje);
        YearMonth primeiroMes = mes.minusMonths(MESES_HISTORICO - 1L);
        LocalDate inicio = mes.atDay(1);
        LocalDate fim = mes.atEndOfMonth();

        // Metas do período (mês e histórico), já no recorte de base e tipo.
        Map<Celula, Integer> metaPorCelula = new HashMap<>();
        Map<Celula, UUID> idMetaPorCelula = new HashMap<>();
        for (MetaFisicaPublica meta : metaFisicaApi.listarAtivas(primeiroMes, mes)) {
            if (!SelecaoMultipla.contem(filter.idBaseOperacional(), meta.idBaseOperacional())) {
                continue;
            }
            for (MetaFisicaApi.ServicoPublico servico : meta.servicos()) {
                if (!SelecaoMultipla.contem(filter.idTipoServico(), servico.idTipoServico())) {
                    continue;
                }
                Celula celula = new Celula(meta.competencia(), meta.idBaseOperacional(), servico.idTipoServico());
                metaPorCelula.merge(celula, servico.quantidade(), Integer::sum);
                idMetaPorCelula.put(celula, meta.id());
            }
        }

        // Pares base × tipo que o painel acompanha (os que tiveram meta em algum mês do período).
        Set<UUID> idsBases = new LinkedHashSet<>();
        Set<UUID> idsTipos = new LinkedHashSet<>();
        Set<List<UUID>> pares = new LinkedHashSet<>();
        metaPorCelula.keySet().forEach(c -> {
            idsBases.add(c.idBase());
            idsTipos.add(c.idTipo());
            pares.add(List.of(c.idBase(), c.idTipo()));
        });

        List<EquipeResponse> equipes = idsBases.isEmpty() ? List.of() : equipeApi.listarEquipesAtivas().stream()
                .filter(e -> e.baseOperacional() != null && idsBases.contains(e.baseOperacional().id()))
                .sorted(Comparator.comparing(EquipeResponse::codigo, Comparator.nullsLast(String::compareToIgnoreCase)))
                .toList();
        Map<UUID, UUID> basePorEquipe = equipes.stream()
                .collect(Collectors.toMap(EquipeResponse::id, e -> e.baseOperacional().id()));

        List<LancamentoResumido> lancamentos = basePorEquipe.isEmpty() ? List.of()
                : execucaoApi.listarLancamentosResumidos(
                        CalendarioOperacional.inicioDoDia(primeiroMes.atDay(1)),
                        CalendarioOperacional.inicioDoDia(fim.plusDays(1)),
                        basePorEquipe.keySet());

        // Nota só com serviços improdutivos (serviço não efetuado) não conta para a meta.
        Set<UUID> improdutivas = basePorEquipe.isEmpty() ? Set.of()
                : execucaoApi.listarIdsSoImprodutivas(
                        CalendarioOperacional.inicioDoDia(primeiroMes.atDay(1)),
                        CalendarioOperacional.inicioDoDia(fim.plusDays(1)),
                        basePorEquipe.keySet());

        Map<ChaveProducao, Integer> producaoDoMes = new HashMap<>();
        Map<Celula, Integer> realizadoPorCelula = new HashMap<>();
        for (LancamentoResumido lancamento : lancamentos) {
            UUID idTipo = lancamento.idTipoServico();
            UUID idBase = basePorEquipe.get(lancamento.idEquipe());
            if (idTipo == null || idBase == null || !pares.contains(List.of(idBase, idTipo))
                    || improdutivas.contains(lancamento.idExecucao())) {
                continue;
            }
            LocalDate dia = CalendarioOperacional.diaDe(lancamento.dataLancamento());
            YearMonth mesDaNota = YearMonth.from(dia);
            realizadoPorCelula.merge(new Celula(mesDaNota, idBase, idTipo), 1, Integer::sum);
            if (mesDaNota.equals(mes)) {
                producaoDoMes.merge(new ChaveProducao(dia, idBase, idTipo, lancamento.idEquipe()), 1, Integer::sum);
            }
        }

        Map<UUID, BaseOperacionalResponse> bases = idsBases.isEmpty() ? Map.of()
                : baseOperacionalApi.buscarPorIdsResponse(idsBases);
        Map<UUID, TipoServicoResponse> tipos = tipoServicoApi.listarTodos().stream()
                .filter(t -> idsTipos.contains(t.id()))
                .collect(Collectors.toMap(TipoServicoResponse::id, Function.identity(), (a, b) -> a));

        LocalDate ontem = hoje.minusDays(1);
        int diasUteisEncerrados = CalendarioOperacional.diasUteis(inicio, ontem.isBefore(fim) ? ontem : fim);
        int diasUteisRestantes = CalendarioOperacional.diasUteis(hoje.isAfter(inicio) ? hoje : inicio, fim);

        List<Dia> calendario = new ArrayList<>();
        for (LocalDate dia = inicio; !dia.isAfter(fim); dia = dia.plusDays(1)) {
            calendario.add(new Dia(dia, CalendarioOperacional.diaUtil(dia)));
        }

        List<Meta> metas = metaPorCelula.entrySet().stream()
                .filter(e -> e.getKey().mes().equals(mes))
                .map(e -> new Meta(idMetaPorCelula.get(e.getKey()), e.getKey().idBase(), e.getKey().idTipo(), e.getValue()))
                .sorted(Comparator.comparing((Meta m) -> nomeBase(bases, m.idBaseOperacional()))
                        .thenComparing(Meta::quantidade, Comparator.reverseOrder()))
                .toList();

        List<Producao> producao = producaoDoMes.entrySet().stream()
                .map(e -> new Producao(e.getKey().data(), e.getKey().idBase(), e.getKey().idTipo(),
                        e.getKey().idEquipe(), e.getValue()))
                .sorted(Comparator.comparing(Producao::data))
                .toList();

        List<Historico> historico = new ArrayList<>();
        for (YearMonth m = primeiroMes; !m.isAfter(mes); m = m.plusMonths(1)) {
            for (List<UUID> par : pares) {
                Celula celula = new Celula(m, par.get(0), par.get(1));
                Integer meta = metaPorCelula.get(celula);
                int realizado = realizadoPorCelula.getOrDefault(celula, 0);
                if (meta != null || realizado > 0) {
                    historico.add(new Historico(m, par.get(0), par.get(1), meta, realizado));
                }
            }
        }

        return new DashboardMetaFisicaResponse(
                mes,
                inicio,
                fim,
                hoje,
                OffsetDateTime.now(clock),
                CalendarioOperacional.diasUteis(mes),
                diasUteisEncerrados,
                diasUteisRestantes,
                calendario,
                idsBases.stream()
                        .map(id -> new Base(id, nomeBase(bases, id)))
                        .sorted(Comparator.comparing(Base::nome, String.CASE_INSENSITIVE_ORDER))
                        .toList(),
                idsTipos.stream()
                        .map(id -> {
                            TipoServicoResponse t = tipos.get(id);
                            return new TipoServico(id, t != null ? t.codigo() : null,
                                    t != null ? t.descricao() : "Tipo removido");
                        })
                        .sorted(Comparator.comparing(TipoServico::descricao, String.CASE_INSENSITIVE_ORDER))
                        .toList(),
                metas,
                equipes.stream().map(e -> new Equipe(e.id(), e.codigo(), e.baseOperacional().id())).toList(),
                producao,
                historico);
    }

    private static String nomeBase(Map<UUID, BaseOperacionalResponse> bases, UUID id) {
        BaseOperacionalResponse base = bases.get(id);
        return base != null ? base.nome() : "Base removida";
    }
}
