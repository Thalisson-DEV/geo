package com.nexo.app.modules.obras.infrastructure.web;

import com.nexo.app.modules.obras.application.dto.RevisaoFotosDtos;
import com.nexo.app.modules.obras.application.usecases.RevisaoFotosUseCases;
import com.nexo.app.modules.obras.doc.RevisaoFotosControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/obras/evidencias")
@RequiredArgsConstructor
public class RevisaoFotosController implements RevisaoFotosControllerDoc {

    private static final String LER = "hasAuthority('obras:documentacao:read')";
    private static final String REVISAR = "hasAuthority('obras:documentacao:write')";

    private final RevisaoFotosUseCases useCases;

    @Override
    @GetMapping("/revisao")
    @PreAuthorize(LER)
    public ResponseEntity<PageResponse<RevisaoFotosDtos.FotoParaRevisao>> listar(@ParameterObject RevisaoFotosDtos.RevisaoFotoFilter filtro,
                                                                                @ParameterObject @PageableDefault(size = 24) Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(filtro, pageable));
    }

    @Override
    @PutMapping("/{id}/revisao")
    @PreAuthorize(REVISAR)
    public ResponseEntity<RevisaoFotosDtos.FotoParaRevisao> revisar(@PathVariable UUID id, @Valid @RequestBody RevisaoFotosDtos.Decisao decisao) {
        return ResponseEntity.ok(useCases.revisar(id, decisao));
    }

    @Override
    @GetMapping("/ranking")
    @PreAuthorize(LER)
    public ResponseEntity<List<RevisaoFotosDtos.LinhaRanking>> ranking(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate de,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate ate) {
        return ResponseEntity.ok(useCases.ranking(de, ate));
    }

    @Override
    @GetMapping("/inconformidades")
    @PreAuthorize(LER)
    public ResponseEntity<List<RevisaoFotosDtos.OpcaoInconformidade>> inconformidades() {
        return ResponseEntity.ok(useCases.inconformidades());
    }
}
