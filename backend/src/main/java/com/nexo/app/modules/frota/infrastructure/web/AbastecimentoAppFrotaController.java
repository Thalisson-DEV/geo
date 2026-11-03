package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.AbastecimentoAppResponse;
import com.nexo.app.modules.frota.application.dto.CancelarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.CatalogoAbastecimentoAppResponse;
import com.nexo.app.modules.frota.application.dto.RealizarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.SolicitarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.usecases.AbastecimentoAppUseCases;
import com.nexo.app.modules.frota.doc.AbastecimentoAppFrotaControllerDoc;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/** Qualquer usuário do app (campo ou administrativo) pede e registra abastecimento, como no checklist. */
@RestController
@RequestMapping("/v1/frota/app/abastecimento")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class AbastecimentoAppFrotaController implements AbastecimentoAppFrotaControllerDoc {

    private final AbastecimentoAppUseCases useCases;

    @Override
    @GetMapping("/catalogo")
    public ResponseEntity<CatalogoAbastecimentoAppResponse> catalogo() {
        return ResponseEntity.ok(useCases.catalogo());
    }

    @Override
    @GetMapping("/solicitacoes")
    public ResponseEntity<List<AbastecimentoAppResponse>> meus() {
        return ResponseEntity.ok(useCases.meus());
    }

    @Override
    @PostMapping("/solicitacoes")
    public ResponseEntity<AbastecimentoAppResponse> solicitar(@Valid @RequestBody SolicitarAbastecimentoRequest request) {
        return ResponseEntity.ok(useCases.solicitar(request));
    }

    @Override
    @PostMapping(value = "/solicitacoes/{idAparelho}/fotos/{idFoto}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<AbastecimentoAppResponse> enviarFoto(@PathVariable UUID idAparelho, @PathVariable UUID idFoto,
                                                               @RequestPart("arquivo") MultipartFile arquivo) {
        return ResponseEntity.ok(useCases.enviarFoto(idAparelho, idFoto, arquivo));
    }

    @Override
    @GetMapping("/solicitacoes/{idAparelho}/fotos/{idFoto}")
    public ResponseEntity<Resource> foto(@PathVariable UUID idAparelho, @PathVariable UUID idFoto) {
        var arquivo = useCases.baixarFoto(idAparelho, idFoto);
        String disposition = ContentDisposition.inline().filename(arquivo.nome(), StandardCharsets.UTF_8).build().toString();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(arquivo.contentType()))
                .contentLength(arquivo.tamanhoBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=3600")
                .body(new InputStreamResource(arquivo.conteudo()));
    }

    @Override
    @PostMapping("/solicitacoes/{idAparelho}/cancelamento")
    public ResponseEntity<AbastecimentoAppResponse> cancelar(@PathVariable UUID idAparelho,
                                                             @Valid @RequestBody(required = false) CancelarAbastecimentoRequest request) {
        return ResponseEntity.ok(useCases.cancelar(idAparelho, request == null ? null : request.motivo()));
    }

    @Override
    @PostMapping("/solicitacoes/{idAparelho}/realizado")
    public ResponseEntity<AbastecimentoAppResponse> realizar(@PathVariable UUID idAparelho,
                                                             @Valid @RequestBody RealizarAbastecimentoRequest request) {
        return ResponseEntity.ok(useCases.realizar(idAparelho, request));
    }
}
