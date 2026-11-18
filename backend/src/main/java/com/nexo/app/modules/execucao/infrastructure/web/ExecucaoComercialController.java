package com.nexo.app.modules.execucao.infrastructure.web;

import com.nexo.app.modules.execucao.application.dto.*;
import com.nexo.app.modules.execucao.application.usecases.ExecucaoComercialUseCases;
import com.nexo.app.modules.execucao.application.usecases.ExportarExecucoesUseCase;
import com.nexo.app.modules.execucao.doc.ExecucaoComercialControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/execucoes-comerciais")
@RequiredArgsConstructor
public class ExecucaoComercialController implements ExecucaoComercialControllerDoc {

    private final ExecucaoComercialUseCases useCases;
    private final ExportarExecucoesUseCase exportacao;

    @Override
    @PostMapping
    @PreAuthorize("hasAuthority('execucao:comercial:write')")
    public ResponseEntity<ExecucaoComercialResponse> registrar(@Valid @RequestBody RegistrarExecucaoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(useCases.registrar(request, SecurityUtils.getUsuarioLogadoId()));
    }

    @Override
    @PatchMapping("/{id}/numero-oficial")
    @PreAuthorize("hasAuthority('execucao:comercial:write')")
    public ResponseEntity<ExecucaoComercialResponse> informarNumeroOficial(@PathVariable UUID id,
                                                                           @Valid @RequestBody InformarNumeroOficialRequest request) {
        return ResponseEntity.ok(useCases.informarNumeroOficial(id, request, SecurityUtils.getUsuarioLogadoId()));
    }

    @Override
    @PutMapping("/{id}/lancamentos")
    @PreAuthorize("hasAuthority('execucao:comercial:write')")
    public ResponseEntity<ExecucaoComercialResponse> alterar(@PathVariable UUID id,
                                                             @Valid @RequestBody AlterarExecucaoRequest request) {
        return ResponseEntity.ok(useCases.alterar(id, request, SecurityUtils.getUsuarioLogadoId()));
    }

    @Override
    @GetMapping("/{id}/historico")
    @PreAuthorize("hasAuthority('execucao:comercial:read')")
    public ResponseEntity<List<EventoHistoricoNotaResponse>> historico(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.historico(id));
    }

    @Override
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('execucao:comercial:read')")
    public ResponseEntity<ExecucaoComercialResponse> buscarPorId(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.buscarPorId(id));
    }

    @Override
    @GetMapping
    @PreAuthorize("hasAuthority('execucao:comercial:read')")
    public ResponseEntity<PageResponse<ExecucaoComercialResponse>> listar(@ParameterObject ExecucaoFilter filter, @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(filter, pageable));
    }

    @Override
    @GetMapping("/exportar/resumo")
    @PreAuthorize("hasAuthority('execucao:comercial:read')")
    public ResponseEntity<StreamingResponseBody> exportarResumo(@ParameterObject ExecucaoFilter filter) {
        return csv("notas_resumo.csv", writer -> exportacao.exportarResumo(filter, writer));
    }

    @Override
    @GetMapping("/exportar/detalhado")
    @PreAuthorize("hasAuthority('execucao:comercial:read')")
    public ResponseEntity<StreamingResponseBody> exportarDetalhado(@ParameterObject ExecucaoFilter filter) {
        return csv("notas_detalhado.csv", writer -> exportacao.exportarDetalhado(filter, writer));
    }

    static ResponseEntity<StreamingResponseBody> csv(String nomeArquivo, EscritorCsv escritor) {
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
    interface EscritorCsv {
        void escrever(Writer writer) throws IOException;
    }

    @Override
    @GetMapping("/minha-equipe")
    @PreAuthorize("hasAuthority('execucao:comercial:read')")
    public ResponseEntity<PageResponse<ExecucaoComercialResponse>> listarPorMinhaEquipe(@ParameterObject ExecucaoFilter filter, @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(useCases.listarPorUsuarioLogado(filter, pageable, SecurityUtils.getUsuarioLogadoId()));
    }
}
