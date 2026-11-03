package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.AbrirOsPendenciasRequest;
import com.nexo.app.modules.frota.application.dto.JustificativaRequest;
import com.nexo.app.modules.frota.application.dto.OrdemServicoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.PendenciaChecklistFilter;
import com.nexo.app.modules.frota.application.dto.PendenciaChecklistResponse;
import com.nexo.app.modules.frota.application.dto.ResolverPendenciasRequest;
import com.nexo.app.modules.frota.application.usecases.PendenciaChecklistUseCases;
import com.nexo.app.modules.frota.doc.PendenciaChecklistFrotaControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** Decidir uma pendência mexe em OS, por isso exige {@code frota:os:write}. */
@RestController
@RequestMapping("/v1/frota/checklist/pendencias")
@RequiredArgsConstructor
public class PendenciaChecklistFrotaController implements PendenciaChecklistFrotaControllerDoc {

    private final PendenciaChecklistUseCases useCases;

    @Override
    @GetMapping
    @PreAuthorize("hasAuthority('frota:checklist:read')")
    public ResponseEntity<PageResponse<PendenciaChecklistResponse>> listar(
            @ParameterObject PendenciaChecklistFilter filtro,
            @ParameterObject @PageableDefault(size = 20, sort = "dataCriacao", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(filtro, pageable));
    }

    @Override
    @PostMapping("/ordem-servico")
    @PreAuthorize("hasAuthority('frota:os:write')")
    public ResponseEntity<OrdemServicoDetalheResponse> abrirOs(@Valid @RequestBody AbrirOsPendenciasRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.abrirOs(request));
    }

    @Override
    @PostMapping("/resolucao")
    @PreAuthorize("hasAuthority('frota:os:write')")
    public ResponseEntity<OrdemServicoDetalheResponse> resolverNaHora(@Valid @RequestBody ResolverPendenciasRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.resolverNaHora(request));
    }

    @Override
    @PostMapping("/{id}/descarte")
    @PreAuthorize("hasAuthority('frota:os:write')")
    public ResponseEntity<PendenciaChecklistResponse> descartar(@PathVariable UUID id,
                                                               @Valid @RequestBody JustificativaRequest request) {
        return ResponseEntity.ok(useCases.descartar(id, request));
    }
}
