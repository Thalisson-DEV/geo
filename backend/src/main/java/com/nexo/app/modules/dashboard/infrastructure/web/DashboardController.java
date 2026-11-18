package com.nexo.app.modules.dashboard.infrastructure.web;

import com.nexo.app.modules.dashboard.application.dto.ConsultaTurnosFilter;
import com.nexo.app.modules.dashboard.application.dto.ContextoExecucaoResponse;
import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaFilter;
import com.nexo.app.modules.dashboard.application.dto.DashboardMetaFisicaResponse;
import com.nexo.app.modules.dashboard.application.dto.DashboardOperacionalFilter;
import com.nexo.app.modules.dashboard.application.dto.TurnoConsultaResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import org.springframework.data.domain.Pageable;
import com.nexo.app.modules.dashboard.application.dto.DashboardOperacionalResponse;
import com.nexo.app.modules.dashboard.application.dto.DashboardTurnosFilter;
import com.nexo.app.modules.dashboard.application.dto.DashboardTurnosResponse;
import com.nexo.app.modules.dashboard.application.dto.DetalhamentoTurnoResponse;
import com.nexo.app.modules.dashboard.application.dto.NotaDoRecorteResponse;
import com.nexo.app.modules.dashboard.application.dto.NotasDoRecorteFilter;
import com.nexo.app.modules.dashboard.application.usecases.DashboardUseCases;
import com.nexo.app.modules.dashboard.doc.DashboardControllerDoc;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import com.nexo.app.modules.dashboard.application.usecases.ExportarTurnosUseCase;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
@RequestMapping({"/v1/dashboards", "/api/v1/dashboards"})
@RequiredArgsConstructor
public class DashboardController implements DashboardControllerDoc {

    private final DashboardUseCases useCases;
    private final ExportarTurnosUseCase exportacaoTurnos;

    @Override
    @PreAuthorize("hasAuthority('obras:turno:read')")
    @GetMapping("/operacional")
    public ResponseEntity<DashboardOperacionalResponse> gerarDashboardOperacional(DashboardOperacionalFilter filter) {
        return ResponseEntity.ok(useCases.gerarDashboardOperacional(filter));
    }

    @Override
    @PreAuthorize("hasAuthority('execucao:meta-fisica:read')")
    @GetMapping("/meta-fisica")
    public ResponseEntity<DashboardMetaFisicaResponse> gerarDashboardMetaFisica(DashboardMetaFisicaFilter filter) {
        return ResponseEntity.ok(useCases.gerarDashboardMetaFisica(filter));
    }

    @Override
    @PreAuthorize("hasAuthority('execucao:comercial:read')")
    @GetMapping("/turnos")
    public ResponseEntity<DashboardTurnosResponse> gerarDashboardTurnos(DashboardTurnosFilter filter) {
        return ResponseEntity.ok(useCases.gerarDashboardTurnos(filter));
    }

    @Override
    @PreAuthorize("hasAuthority('execucao:comercial:read')")
    @GetMapping("/turnos/{idTurno}/detalhamento")
    public ResponseEntity<DetalhamentoTurnoResponse> detalharTurno(@PathVariable UUID idTurno) {
        return ResponseEntity.ok(useCases.detalharTurno(idTurno));
    }

    @Override
    @PreAuthorize("hasAuthority('execucao:comercial:read')")
    @GetMapping("/turnos/consulta")
    public ResponseEntity<PageResponse<TurnoConsultaResponse>> consultarTurnos(ConsultaTurnosFilter filter,
                                                                              Pageable pageable) {
        return ResponseEntity.ok(useCases.consultarTurnos(filter, pageable));
    }

    @Override
    @PreAuthorize("hasAuthority('execucao:comercial:read')")
    @GetMapping("/turnos/consulta/exportar/resumo")
    public ResponseEntity<StreamingResponseBody> exportarTurnosResumo(ConsultaTurnosFilter filter) {
        return csv("turnos_resumo.csv", writer -> exportacaoTurnos.exportarResumo(filter, writer));
    }

    @Override
    @PreAuthorize("hasAuthority('execucao:comercial:read')")
    @GetMapping("/turnos/consulta/exportar/detalhado")
    public ResponseEntity<StreamingResponseBody> exportarTurnosDetalhado(ConsultaTurnosFilter filter) {
        return csv("turnos_detalhado.csv", writer -> exportacaoTurnos.exportarDetalhado(filter, writer));
    }

    private static ResponseEntity<StreamingResponseBody> csv(String nomeArquivo, EscritorCsv escritor) {
        StreamingResponseBody body = saida -> {
            try (Writer writer = new OutputStreamWriter(saida, StandardCharsets.UTF_8)) {
                writer.write('﻿');
                escritor.escrever(writer);
            }
        };
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + nomeArquivo + "\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(body);
    }

    @FunctionalInterface
    private interface EscritorCsv {
        void escrever(Writer writer) throws IOException;
    }

    @Override
    @PreAuthorize("hasAuthority('execucao:comercial:read')")
    @GetMapping("/notas")
    public ResponseEntity<PageResponse<NotaDoRecorteResponse>> consultarNotas(NotasDoRecorteFilter filter,
                                                                             Pageable pageable) {
        return ResponseEntity.ok(useCases.consultarNotas(filter, pageable));
    }

    @Override
    @PreAuthorize("hasAuthority('execucao:comercial:read')")
    @GetMapping("/execucoes/{idExecucao}/contexto")
    public ResponseEntity<ContextoExecucaoResponse> contextualizarExecucao(@PathVariable UUID idExecucao) {
        return ResponseEntity.ok(useCases.contextualizarExecucao(idExecucao));
    }
}
