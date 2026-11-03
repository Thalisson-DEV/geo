package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.ChecklistDetalheResponse;
import com.nexo.app.modules.frota.application.dto.ChecklistFilter;
import com.nexo.app.modules.frota.application.dto.ChecklistResumoResponse;
import com.nexo.app.modules.frota.application.dto.VeiculoSemChecklistResponse;
import com.nexo.app.modules.frota.application.usecases.ChecklistConsultaUseCases;
import com.nexo.app.modules.frota.doc.ChecklistFrotaControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/checklists")
@RequiredArgsConstructor
@PreAuthorize("hasAuthority('frota:checklist:read')")
public class ChecklistFrotaController implements ChecklistFrotaControllerDoc {

    private final ChecklistConsultaUseCases useCases;

    @Override
    @GetMapping
    public ResponseEntity<PageResponse<ChecklistResumoResponse>> listar(
            @ParameterObject ChecklistFilter filtro,
            @ParameterObject @PageableDefault(size = 20, sort = "preenchidoEm", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(filtro, pageable));
    }

    @Override
    @GetMapping("/sem-checklist-hoje")
    public ResponseEntity<List<VeiculoSemChecklistResponse>> semChecklistHoje(@RequestParam(required = false) List<UUID> idsBase) {
        return ResponseEntity.ok(useCases.semChecklistHoje(idsBase));
    }

    @Override
    @GetMapping("/{id}")
    public ResponseEntity<ChecklistDetalheResponse> detalhar(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.detalhar(id));
    }

    @Override
    @GetMapping("/{id}/fotos/{idFoto}")
    public ResponseEntity<Resource> foto(@PathVariable UUID id, @PathVariable UUID idFoto) {
        var arquivo = useCases.baixarFoto(id, idFoto);
        String disposition = ContentDisposition.inline().filename(arquivo.nome(), StandardCharsets.UTF_8).build().toString();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(arquivo.contentType()))
                .contentLength(arquivo.tamanhoBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=3600")
                .body(new InputStreamResource(arquivo.conteudo()));
    }
}
