package com.nexo.app.modules.obras.infrastructure.web;

import com.nexo.app.modules.obras.application.dto.CampoObrasRequests;
import com.nexo.app.modules.obras.application.dto.CampoObrasResponses;
import com.nexo.app.modules.obras.application.dto.DownloadAnexoObraDTO;
import com.nexo.app.modules.obras.application.usecases.AvisosCampoObras;
import com.nexo.app.modules.obras.application.usecases.CampoObrasUseCases;
import com.nexo.app.modules.obras.application.usecases.PacoteCampoObras;
import com.nexo.app.modules.obras.doc.CampoObrasControllerDoc;
import com.nexo.app.shared.domain.exception.ArmazenamentoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.InputStream;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/obras/campo")
@RequiredArgsConstructor
public class CampoObrasController implements CampoObrasControllerDoc {

    private static final String LER = "hasAnyAuthority('obras:campo:read', 'obras:turno:write')";
    private static final String GRAVAR = "hasAuthority('obras:turno:write')";
    private static final String APONTAR = "hasAuthority('obras:execucao:write')";

    private final PacoteCampoObras pacote;
    private final CampoObrasUseCases useCases;
    private final AvisosCampoObras avisos;

    @Override
    @GetMapping("/pacote")
    @PreAuthorize(LER)
    public ResponseEntity<CampoObrasResponses.Pacote> pacote(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime desde,
            @RequestParam(required = false) UUID idEquipe) {
        return ResponseEntity.ok(pacote.montar(SecurityUtils.getUsuarioLogadoId(), idEquipe, desde));
    }

    @Override
    @GetMapping("/obras/{idObra}/projeto")
    @PreAuthorize(LER)
    public ResponseEntity<StreamingResponseBody> projeto(@PathVariable UUID idObra) {
        DownloadAnexoObraDTO dto = pacote.baixarProjeto(SecurityUtils.getUsuarioLogadoId(), idObra);
        StreamingResponseBody corpo = saida -> {
            try (InputStream stream = dto.stream()) {
                stream.transferTo(saida);
            }
        };
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + dto.nomeArquivo() + "\"")
                .contentType(MediaType.parseMediaType(dto.contentType()))
                .contentLength(dto.tamanhoBytes())
                .body(corpo);
    }

    @Override
    @GetMapping("/obras/{idObra}/pendencias-foto")
    @PreAuthorize(LER)
    public ResponseEntity<List<CampoObrasResponses.PendenciaFoto>> pendenciasFoto(@PathVariable UUID idObra) {
        return ResponseEntity.ok(pacote.pendenciasFoto(idObra));
    }

    @Override
    @PostMapping("/aprs")
    @PreAuthorize(GRAVAR)
    public ResponseEntity<CampoObrasResponses.Resultado> registrarApr(@Valid @RequestBody CampoObrasRequests.Apr comando) {
        return ResponseEntity.ok(useCases.registrarApr(comando, SecurityUtils.getUsuarioLogadoId()));
    }

    @Override
    @PostMapping("/aprs/conclusoes")
    @PreAuthorize(GRAVAR)
    public ResponseEntity<CampoObrasResponses.Resultado> concluirApr(@Valid @RequestBody CampoObrasRequests.ConclusaoApr comando) {
        return ResponseEntity.ok(useCases.concluirApr(comando, SecurityUtils.getUsuarioLogadoId()));
    }

    @Override
    @PostMapping("/ocorrencias")
    @PreAuthorize(GRAVAR)
    public ResponseEntity<CampoObrasResponses.Resultado> registrarOcorrencia(@Valid @RequestBody CampoObrasRequests.Ocorrencia comando) {
        return ResponseEntity.ok(useCases.registrarOcorrencia(comando, SecurityUtils.getUsuarioLogadoId()));
    }

    @Override
    @PostMapping("/atividades")
    @PreAuthorize(GRAVAR)
    public ResponseEntity<CampoObrasResponses.Resultado> registrarAtividade(@Valid @RequestBody CampoObrasRequests.Atividade comando) {
        return ResponseEntity.ok(useCases.registrarAtividade(comando, SecurityUtils.getUsuarioLogadoId()));
    }

    @Override
    @PostMapping("/apontamentos")
    @PreAuthorize(APONTAR)
    public ResponseEntity<CampoObrasResponses.Resultado> apontar(@Valid @RequestBody CampoObrasRequests.Apontamento comando) {
        return ResponseEntity.ok(useCases.apontar(comando, SecurityUtils.getUsuarioLogadoId()));
    }

    @Override
    @PostMapping("/presencas")
    @PreAuthorize(GRAVAR)
    public ResponseEntity<CampoObrasResponses.Resultado> registrarPresenca(@Valid @RequestBody CampoObrasRequests.Presenca comando) {
        return ResponseEntity.ok(useCases.registrarPresenca(comando, SecurityUtils.getUsuarioLogadoId()));
    }

    @Override
    @PostMapping("/relatorios")
    @PreAuthorize(GRAVAR)
    public ResponseEntity<CampoObrasResponses.Resultado> salvarRelatorio(@Valid @RequestBody CampoObrasRequests.Relatorio comando) {
        return ResponseEntity.ok(useCases.salvarRelatorio(comando, SecurityUtils.getUsuarioLogadoId()));
    }

    @Override
    @PostMapping(value = "/evidencias", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize(GRAVAR)
    public ResponseEntity<CampoObrasResponses.Resultado> registrarEvidencia(
            @Valid @RequestPart("dados") CampoObrasRequests.Evidencia dados,
            @RequestPart("arquivo") MultipartFile arquivo) {
        if (arquivo == null || arquivo.isEmpty()) {
            throw new InvarianteVioladaException("A foto chegou vazia.");
        }
        byte[] conteudo;
        try {
            conteudo = arquivo.getBytes();
        } catch (IOException e) {
            throw new ArmazenamentoException("Falha ao ler a foto enviada.", e);
        }
        return ResponseEntity.ok(useCases.registrarEvidencia(dados, conteudo, arquivo.getOriginalFilename(),
                arquivo.getContentType(), SecurityUtils.getUsuarioLogadoId()));
    }

    @Override
    @GetMapping("/push/chave")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, String>> chavePush() {
        String chave = avisos.chavePublica();
        return ResponseEntity.ok(Map.of("chavePublica", chave != null ? chave : ""));
    }

    @Override
    @PostMapping("/push/assinaturas")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> assinarPush(@Valid @RequestBody CampoObrasRequests.AssinaturaPush pedido) {
        avisos.assinar(pedido, SecurityUtils.getUsuarioLogadoId());
        return ResponseEntity.noContent().build();
    }

    @Override
    @PostMapping("/push/assinaturas/cancelamento")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> cancelarPush(@Valid @RequestBody CampoObrasRequests.AssinaturaPush pedido) {
        avisos.cancelar(pedido.endpoint(), SecurityUtils.getUsuarioLogadoId());
        return ResponseEntity.noContent().build();
    }
}
