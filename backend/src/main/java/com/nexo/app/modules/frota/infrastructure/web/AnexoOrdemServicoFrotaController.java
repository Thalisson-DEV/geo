package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.AnexoOrdemServicoResponse;
import com.nexo.app.modules.frota.application.usecases.AnexoOrdemServicoUseCases;
import com.nexo.app.modules.frota.doc.AnexoOrdemServicoFrotaControllerDoc;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/ordens-servico/{id}/anexos")
@RequiredArgsConstructor
public class AnexoOrdemServicoFrotaController implements AnexoOrdemServicoFrotaControllerDoc {

    private static final String LEITURA = "hasAuthority('frota:os:read')";
    private static final String ESCRITA = "hasAnyAuthority('frota:os:write', 'frota:os:executar')";

    private final AnexoOrdemServicoUseCases anexos;

    @Override
    @GetMapping
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<AnexoOrdemServicoResponse>> listar(@PathVariable UUID id) {
        return ResponseEntity.ok(anexos.listar(id));
    }

    @Override
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize(ESCRITA)
    public ResponseEntity<List<AnexoOrdemServicoResponse>> anexar(@PathVariable UUID id,
                                                                  @RequestPart(value = "descricao", required = false) String descricao,
                                                                  @RequestPart("arquivo") MultipartFile arquivo) {
        return ResponseEntity.ok(anexos.anexar(id, descricao, arquivo));
    }

    @Override
    @GetMapping("/{idAnexo}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<Resource> baixar(@PathVariable UUID id, @PathVariable UUID idAnexo) {
        return ApoliceFrotaController.arquivo(anexos.baixar(id, idAnexo));
    }

    @Override
    @DeleteMapping("/{idAnexo}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<List<AnexoOrdemServicoResponse>> remover(@PathVariable UUID id, @PathVariable UUID idAnexo) {
        return ResponseEntity.ok(anexos.remover(id, idAnexo));
    }
}
