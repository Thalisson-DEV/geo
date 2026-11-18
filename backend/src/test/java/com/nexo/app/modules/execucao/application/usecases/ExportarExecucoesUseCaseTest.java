package com.nexo.app.modules.execucao.application.usecases;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.StringWriter;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import com.nexo.app.modules.contrato.AcaoResponse;
import com.nexo.app.modules.estoque.MaterialResponse;
import com.nexo.app.modules.execucao.application.dto.ExecucaoAcaoResponse;
import com.nexo.app.modules.execucao.application.dto.ExecucaoComercialResponse;
import com.nexo.app.modules.execucao.application.dto.ExecucaoFilter;
import com.nexo.app.modules.execucao.application.dto.ExecucaoMaterialResponse;
import com.nexo.app.modules.execucao.application.dto.TipoServicoResponse;
import com.nexo.app.modules.execucao.domain.OrigemMaterial;
import com.nexo.app.modules.execucao.domain.StatusExecucao;
import com.nexo.app.modules.execucao.domain.TipoNota;
import com.nexo.app.modules.rh.EquipeResponse;
import com.nexo.app.modules.rh.MunicipioResponse;
import com.nexo.app.shared.application.dto.OperacaoMaterial;

class ExportarExecucoesUseCaseTest {

    private static final ExecucaoFilter SEM_FILTRO = new ExecucaoFilter(null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null, null, null, null, null);

    private static ExecucaoComercialResponse nota(List<ExecucaoAcaoResponse> acoes, List<ExecucaoMaterialResponse> materiais) {
        var equipe = new EquipeResponse(UUID.randomUUID(), "EQ-01", null, null, null, null, null, null, null, true,
                List.of(), new BigDecimal("21000"));
        var tipo = new TipoServicoResponse(UUID.randomUUID(), "CS", "CORTE", true, null, null);
        var municipio = new MunicipioResponse(UUID.randomUUID(), "JUAZEIRO", null, true);
        return new ExecucaoComercialResponse(UUID.randomUUID(), "=123456", UUID.randomUUID(), tipo, equipe, municipio,
                new BigDecimal("-9.41"), new BigDecimal("-40.50"), OffsetDateTime.parse("2026-11-16T10:30:00-03:00"),
                StatusExecucao.CONCLUIDO, new BigDecimal("850.5"), null, null, acoes, materiais, TipoNota.AVULSA,
                "AV-EQ01-1", null, 2);
    }

    private static ExecucaoAcaoResponse servico(boolean improdutiva) {
        return new ExecucaoAcaoResponse(UUID.randomUUID(),
                new AcaoResponse(UUID.randomUUID(), "A1", "Religação", true, null, null, improdutiva));
    }

    private static ExecucaoMaterialResponse material(OperacaoMaterial operacao) {
        var cabo = new MaterialResponse(UUID.randomUUID(), "MAT-1", "CABO 16MM", "M", null, null, null, null, false,
                true, List.of());
        return new ExecucaoMaterialResponse(UUID.randomUUID(), cabo, new BigDecimal("2.500"), operacao, "SN1",
                OrigemMaterial.EQUIPE, null, null);
    }

    @Test
    void resumoTrazUmaLinhaPorNotaComContagensEProtegeFormula() {
        List<Object> l = ExportarExecucoesUseCase.linhaResumo(nota(List.of(servico(false), servico(true)),
                List.of(material(OperacaoMaterial.APLICADO), material(OperacaoMaterial.RETIRADO),
                        material(OperacaoMaterial.APLICADO))));

        assertThat(l).hasSize(ExportarExecucoesUseCase.CABECALHO_NOTA.size()
                + ExportarExecucoesUseCase.CABECALHO_RESUMO_EXTRA.size());
        assertThat(l.subList(0, 8)).containsExactly("'=123456", "Avulsa", "CS · CORTE", "EQ-01", "JUAZEIRO",
                "16/11/2026 10:30", "Concluído", "850,50");
        assertThat(l.subList(8, 13)).containsExactly(2, 2L, 1L, 2, "AV-EQ01-1");
        assertThat(l.get(14)).isEqualTo("-9,41");
    }

    @Test
    void detalhadoTrazUmaLinhaPorServicoEPorMaterial() {
        List<List<Object>> linhas = ExportarExecucoesUseCase.linhasDetalhadas(
                nota(List.of(servico(true)), List.of(material(OperacaoMaterial.RETIRADO))));

        int colunas = ExportarExecucoesUseCase.CABECALHO_NOTA.size()
                + ExportarExecucoesUseCase.CABECALHO_DETALHADO_EXTRA.size();
        assertThat(linhas).hasSize(2).allSatisfy(l -> assertThat(l).hasSize(colunas));
        assertThat(linhas.get(0).subList(8, 11)).containsExactly("Serviço", "A1", "Religação");
        assertThat(linhas.get(0).get(18)).isEqualTo("Sim");
        assertThat(linhas.get(1).subList(8, 16)).containsExactly("Material", "MAT-1", "CABO 16MM", "2,5", "M",
                "Retirado", "SN1", "Equipe");
    }

    @Test
    void notaSemItensSaiNumaLinhaSoNoDetalhado() {
        List<List<Object>> linhas = ExportarExecucoesUseCase.linhasDetalhadas(nota(List.of(), List.of()));

        assertThat(linhas).hasSize(1);
        assertThat(linhas.get(0)).hasSize(ExportarExecucoesUseCase.CABECALHO_NOTA.size()
                + ExportarExecucoesUseCase.CABECALHO_DETALHADO_EXTRA.size());
    }

    @Test
    void paraNoLimiteDeNotasMesmoComMaisPaginas() throws Exception {
        ExecucaoComercialUseCases execucoes = mock(ExecucaoComercialUseCases.class);
        List<ExecucaoComercialResponse> pagina = IntStream.range(0, ExportarExecucoesUseCase.TAMANHO_PAGINA)
                .mapToObj(i -> nota(List.of(), List.of())).toList();
        when(execucoes.listarParaExportacao(eq(SEM_FILTRO), any(Pageable.class))).thenReturn(pagina);

        StringWriter saida = new StringWriter();
        new ExportarExecucoesUseCase(execucoes).exportarResumo(SEM_FILTRO, saida);

        long linhas = saida.toString().lines().count() - 1;
        assertThat(linhas).isEqualTo(ExportarExecucoesUseCase.MAX_NOTAS);
        org.mockito.Mockito.verify(execucoes).listarParaExportacao(SEM_FILTRO, PageRequest.of(0,
                ExportarExecucoesUseCase.TAMANHO_PAGINA, Sort.by(Sort.Order.desc("dataLancamento"), Sort.Order.desc("id"))));
    }
}
