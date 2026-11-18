package com.nexo.app.modules.dashboard.application.usecases;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.StringWriter;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import com.nexo.app.modules.dashboard.application.dto.ConsultaTurnosFilter;
import com.nexo.app.modules.dashboard.application.dto.TurnoConsultaResponse;
import com.nexo.app.modules.execucao.ExecucaoComercialApi;
import com.nexo.app.modules.execucao.application.dto.ExecucaoComercialResponse;
import com.nexo.app.modules.execucao.domain.StatusExecucao;
import com.nexo.app.modules.execucao.domain.StatusTurno;
import com.nexo.app.shared.application.dto.PageResponse;

class ExportarTurnosUseCaseTest {

    private static final ConsultaTurnosFilter SEM_FILTRO = new ConsultaTurnosFilter(null, null, null, null, null,
            null, null, null);

    private static TurnoConsultaResponse turno(UUID id, StatusTurno status, boolean automatico) {
        return new TurnoConsultaResponse(id, UUID.randomUUID(), "EQ-01", "JUAZEIRO", "CORTE", status,
                OffsetDateTime.parse("2026-11-16T07:00:00-03:00"),
                status == StatusTurno.FECHADO ? OffsetDateTime.parse("2026-11-16T16:05:00-03:00") : null,
                545, false, "Fulano", "ABC1D23", 3, 2, new BigDecimal("700"), new BigDecimal("350"),
                new BigDecimal("1000"), new BigDecimal("70.0"), null, null, automatico,
                automatico ? "Encerrado no horário de corte" : null);
    }

    private static ExecucaoComercialResponse nota(UUID idTurno, String numero) {
        return new ExecucaoComercialResponse(UUID.randomUUID(), numero, idTurno, null, null, null, null, null,
                OffsetDateTime.parse("2026-11-16T09:00:00-03:00"), StatusExecucao.CONCLUIDO, new BigDecimal("350"),
                null, null, List.of(), List.of(), null, null, null, 0);
    }

    @Test
    void resumoTrazProducaoMetaESituacaoDaLista() {
        List<Object> l = ExportarTurnosUseCase.linhaResumo(turno(UUID.randomUUID(), StatusTurno.FECHADO, true));

        assertThat(l).hasSize(ExportarTurnosUseCase.CABECALHO_TURNO.size()
                + ExportarTurnosUseCase.CABECALHO_RESUMO_EXTRA.size());
        assertThat(l.subList(0, 8)).containsExactly("EQ-01", "JUAZEIRO", "CORTE", "16/11/2026 07:00",
                "16/11/2026 16:05", "Encerrado pelo sistema", "Fulano", "ABC1D23");
        assertThat(l.subList(8, 15)).containsExactly("9:05", 3, 2L, "700,00", "350,00", "1000,00", "70,00");
    }

    @Test
    void detalhadoTrazUmaLinhaPorNotaETurnoSemNotaNumaLinhaSo() throws Exception {
        UUID comNotas = UUID.randomUUID();
        UUID semNotas = UUID.randomUUID();
        ConsultarTurnosUseCase consulta = mock(ConsultarTurnosUseCase.class);
        ExecucaoComercialApi execucoes = mock(ExecucaoComercialApi.class);
        when(consulta.executar(any(), any(Pageable.class))).thenReturn(PageResponse.fromPage(new PageImpl<>(List.of(
                turno(comNotas, StatusTurno.ABERTO, false), turno(semNotas, StatusTurno.FECHADO, false)))));
        when(execucoes.listarPorTurnos(anyCollection())).thenReturn(List.of(nota(comNotas, "111"), nota(comNotas, "222")));

        StringWriter saida = new StringWriter();
        new ExportarTurnosUseCase(consulta, execucoes).exportarDetalhado(SEM_FILTRO, saida);

        List<String> linhas = saida.toString().lines().toList();
        assertThat(linhas).hasSize(4);
        assertThat(linhas.get(1)).contains("Em turno").contains(";111;");
        assertThat(linhas.get(2)).contains(";222;");
        assertThat(linhas.get(3)).contains("Encerrado").endsWith(semNotas.toString());
    }
}
