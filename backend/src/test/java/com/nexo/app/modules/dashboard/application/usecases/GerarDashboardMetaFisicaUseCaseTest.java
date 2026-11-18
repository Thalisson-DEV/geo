package com.nexo.app.modules.dashboard.application.usecases;

import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaFilter;
import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaResponse;
import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaResponse.Historico;
import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaResponse.Meta;
import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaResponse.Producao;
import com.nexo.app.modules.dashboard.domain.CalendarioOperacional;
import com.nexo.app.modules.execucao.ExecucaoComercialApi;
import com.nexo.app.modules.execucao.MetaFisicaApi;
import com.nexo.app.modules.execucao.MetaFisicaApi.MetaFisicaPublica;
import com.nexo.app.modules.execucao.MetaFisicaApi.ServicoPublico;
import com.nexo.app.modules.execucao.TipoServicoApi;
import com.nexo.app.modules.execucao.application.dto.LancamentoResumido;
import com.nexo.app.modules.execucao.application.dto.TipoServicoResponse;
import com.nexo.app.modules.rh.BaseOperacionalApi;
import com.nexo.app.modules.rh.BaseOperacionalResponse;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.EquipeResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GerarDashboardMetaFisicaUseCaseTest {

    // Sexta-feira, 13/11/2026, 15h em São Paulo.
    private static final OffsetDateTime AGORA = OffsetDateTime.parse("2026-11-13T15:00:00-03:00");
    private static final YearMonth NOVEMBRO = YearMonth.of(2026, 11);

    private final MetaFisicaApi metaFisicaApi = mock(MetaFisicaApi.class);
    private final EquipeApi equipeApi = mock(EquipeApi.class);
    private final BaseOperacionalApi baseApi = mock(BaseOperacionalApi.class);
    private final TipoServicoApi tipoServicoApi = mock(TipoServicoApi.class);
    private final ExecucaoComercialApi execucaoApi = mock(ExecucaoComercialApi.class);
    private GerarDashboardMetaFisicaUseCase useCase;

    private final BaseOperacionalResponse remanso = base("REMANSO");
    private final BaseOperacionalResponse bonfim = base("BONFIM");
    private final BaseOperacionalResponse semMeta = base("SALVADOR");
    private final TipoServicoResponse corte = tipo("CS", "CORTE");
    private final TipoServicoResponse enlace = tipo("CM", "ENLACE");
    private final TipoServicoResponse ligacao = tipo("CL", "LIGAÇÃO NOVA");
    private final UUID eqRemanso = UUID.randomUUID();
    private final UUID eqBonfim = UUID.randomUUID();
    private final UUID eqSalvador = UUID.randomUUID();
    private final List<LancamentoResumido> lancamentos = new ArrayList<>();

    @BeforeEach
    void setUp() {
        useCase = new GerarDashboardMetaFisicaUseCase(metaFisicaApi, equipeApi, baseApi, tipoServicoApi, execucaoApi,
                Clock.fixed(AGORA.toInstant(), CalendarioOperacional.FUSO));
        UUID metaRemanso = UUID.randomUUID();
        when(metaFisicaApi.listarAtivas(YearMonth.of(2026, 6), NOVEMBRO)).thenReturn(List.of(
                new MetaFisicaPublica(metaRemanso, remanso.id(), NOVEMBRO, List.of(
                        new ServicoPublico(corte.id(), 528), new ServicoPublico(enlace.id(), 69))),
                new MetaFisicaPublica(UUID.randomUUID(), bonfim.id(), NOVEMBRO, List.of(
                        new ServicoPublico(corte.id(), 595))),
                new MetaFisicaPublica(UUID.randomUUID(), remanso.id(), YearMonth.of(2026, 10), List.of(
                        new ServicoPublico(corte.id(), 500)))));
        when(equipeApi.listarEquipesAtivas()).thenReturn(List.of(
                equipe(eqRemanso, "USR-R01", remanso), equipe(eqBonfim, "USR-B01", bonfim),
                equipe(eqSalvador, "USR-S01", semMeta)));
        when(baseApi.buscarPorIdsResponse(anyCollection())).thenReturn(Map.of(
                remanso.id(), remanso, bonfim.id(), bonfim));
        when(tipoServicoApi.listarTodos()).thenReturn(List.of(corte, enlace, ligacao));
        when(execucaoApi.listarLancamentosResumidos(
                eq(OffsetDateTime.parse("2026-06-01T00:00:00-03:00")),
                eq(OffsetDateTime.parse("2026-12-01T00:00:00-03:00")), anyCollection()))
                .thenReturn(lancamentos);

        lancar(eqRemanso, "2026-11-03T09:00:00-03:00", corte);
        lancar(eqRemanso, "2026-11-03T10:00:00-03:00", corte);
        lancar(eqRemanso, "2026-11-03T23:30:00-03:00", enlace);
        lancar(eqRemanso, "2026-11-04T10:00:00-03:00", ligacao);   // tipo sem meta na base: fora
        lancar(eqRemanso, "2026-11-05T10:00:00-03:00", null);      // nota sem tipo: fora
        lancar(eqBonfim, "2026-11-12T10:00:00-03:00", enlace);     // Bonfim não tem meta de enlace: fora
        lancar(eqBonfim, "2026-11-12T11:00:00-03:00", corte);
        lancar(eqRemanso, "2026-10-20T10:00:00-03:00", corte);     // histórico de outubro
    }

    @Test
    @DisplayName("Mês corrente: metas por base e tipo, dias úteis e notas que contam para a meta, uma por nota")
    void mesCorrente() {
        DashboardMetaFisicaResponse r = useCase.executar(new DashboardMetaFisicaFilter(null, null, null));

        assertThat(r.competencia()).isEqualTo(NOVEMBRO);
        assertThat(r.hoje()).isEqualTo(LocalDate.of(2026, 11, 13));
        assertThat(r.diasUteis()).isEqualTo(19);
        assertThat(r.diasUteisEncerrados()).isEqualTo(8);   // 3 a 6 e 9 a 12
        assertThat(r.diasUteisRestantes()).isEqualTo(11);   // hoje e os 10 seguintes
        assertThat(r.calendario()).hasSize(30);
        assertThat(r.bases()).extracting(DashboardMetaFisicaResponse.Base::nome).containsExactly("BONFIM", "REMANSO");
        assertThat(r.metas()).extracting(Meta::idBaseOperacional, Meta::idTipoServico, Meta::quantidade)
                .containsExactly(tuple(bonfim.id(), corte.id(), 595),
                        tuple(remanso.id(), corte.id(), 528), tuple(remanso.id(), enlace.id(), 69));
        assertThat(r.equipes()).extracting(DashboardMetaFisicaResponse.Equipe::codigo)
                .containsExactly("USR-B01", "USR-R01");
        assertThat(r.producao()).extracting(Producao::data, Producao::idBaseOperacional, Producao::idTipoServico,
                        Producao::notas)
                .containsExactlyInAnyOrder(
                        tuple(LocalDate.of(2026, 11, 3), remanso.id(), corte.id(), 2),
                        tuple(LocalDate.of(2026, 11, 3), remanso.id(), enlace.id(), 1),
                        tuple(LocalDate.of(2026, 11, 12), bonfim.id(), corte.id(), 1));
    }

    @Test
    @DisplayName("Histórico: meta e realizado de cada mês do período nos pares base × tipo acompanhados")
    void historico() {
        DashboardMetaFisicaResponse r = useCase.executar(new DashboardMetaFisicaFilter(NOVEMBRO, null, null));

        assertThat(r.historico()).extracting(Historico::competencia, Historico::idBaseOperacional,
                        Historico::idTipoServico, Historico::meta, Historico::realizado)
                .containsExactlyInAnyOrder(
                        tuple(YearMonth.of(2026, 10), remanso.id(), corte.id(), 500, 1),
                        tuple(NOVEMBRO, remanso.id(), corte.id(), 528, 2),
                        tuple(NOVEMBRO, remanso.id(), enlace.id(), 69, 1),
                        tuple(NOVEMBRO, bonfim.id(), corte.id(), 595, 1));
    }

    @Test
    @DisplayName("Nota só com serviços improdutivos (serviço não efetuado) não conta para a meta")
    void improdutivas() {
        UUID improdutiva = lancamentos.getFirst().idExecucao(); // um dos dois cortes de Remanso em 03/11
        when(execucaoApi.listarIdsSoImprodutivas(any(), any(), anyCollection())).thenReturn(Set.of(improdutiva));

        DashboardMetaFisicaResponse r = useCase.executar(
                new DashboardMetaFisicaFilter(NOVEMBRO, List.of(remanso.id()), List.of(corte.id())));

        assertThat(r.producao()).extracting(Producao::notas).containsExactly(1);
        assertThat(r.historico()).filteredOn(h -> h.competencia().equals(NOVEMBRO))
                .extracting(Historico::realizado).containsExactly(1);
    }

    @Test
    @DisplayName("Recorte por base e tipo restringe metas, equipes e notas")
    void recorte() {
        DashboardMetaFisicaResponse r = useCase.executar(
                new DashboardMetaFisicaFilter(NOVEMBRO, List.of(remanso.id()), List.of(corte.id())));

        assertThat(r.metas()).extracting(Meta::quantidade).containsExactly(528);
        assertThat(r.tipos()).extracting(DashboardMetaFisicaResponse.TipoServico::descricao).containsExactly("CORTE");
        assertThat(r.equipes()).extracting(DashboardMetaFisicaResponse.Equipe::codigo).containsExactly("USR-R01");
        assertThat(r.producao()).extracting(Producao::notas).containsExactly(2);
    }

    private void lancar(UUID equipe, String quando, TipoServicoResponse tipo) {
        lancamentos.add(new LancamentoResumido(UUID.randomUUID(), equipe, UUID.randomUUID(),
                tipo != null ? tipo.id() : null, OffsetDateTime.parse(quando), BigDecimal.TEN));
    }

    private static BaseOperacionalResponse base(String nome) {
        return new BaseOperacionalResponse(UUID.randomUUID(), nome, "BA", null, null, null, null, null, true);
    }

    private static TipoServicoResponse tipo(String codigo, String descricao) {
        return new TipoServicoResponse(UUID.randomUUID(), codigo, descricao, true, null, null);
    }

    private static EquipeResponse equipe(UUID id, String codigo, BaseOperacionalResponse base) {
        return new EquipeResponse(id, codigo, null, null, null, null, null, base, null, true, List.of(), null);
    }
}
