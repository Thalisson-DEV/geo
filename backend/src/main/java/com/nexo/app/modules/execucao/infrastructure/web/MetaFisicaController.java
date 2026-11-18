package com.nexo.app.modules.execucao.infrastructure.web;

import com.nexo.app.modules.execucao.application.dto.MetaFisicaFilter;
import com.nexo.app.modules.execucao.application.dto.MetaFisicaRequest;
import com.nexo.app.modules.execucao.application.dto.MetaFisicaResponse;
import com.nexo.app.modules.execucao.application.usecases.MetaFisicaUseCases;
import com.nexo.app.modules.execucao.doc.MetaFisicaControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/v1/metas-fisicas")
@RequiredArgsConstructor
public class MetaFisicaController implements MetaFisicaControllerDoc {

    private final MetaFisicaUseCases useCases;

    @Override
    @PostMapping
    @PreAuthorize("hasAuthority('execucao:meta-fisica:write')")
    public ResponseEntity<MetaFisicaResponse> criar(@Valid @RequestBody MetaFisicaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.criar(request));
    }

    @Override
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('execucao:meta-fisica:read')")
    public ResponseEntity<MetaFisicaResponse> buscarPorId(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.buscarPorId(id));
    }

    @Override
    @GetMapping
    @PreAuthorize("hasAuthority('execucao:meta-fisica:read')")
    public ResponseEntity<PageResponse<MetaFisicaResponse>> listar(
            @ParameterObject MetaFisicaFilter filter, @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(filter, pageable));
    }

    @Override
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('execucao:meta-fisica:write')")
    public ResponseEntity<MetaFisicaResponse> atualizar(@PathVariable UUID id,
                                                        @Valid @RequestBody MetaFisicaRequest request) {
        return ResponseEntity.ok(useCases.atualizar(id, request));
    }

    @Override
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('execucao:meta-fisica:write')")
    public ResponseEntity<Void> desativar(@PathVariable UUID id) {
        useCases.desativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PutMapping("/{id}/ativar")
    @PreAuthorize("hasAuthority('execucao:meta-fisica:write')")
    public ResponseEntity<Void> ativar(@PathVariable UUID id) {
        useCases.ativar(id);
        return ResponseEntity.noContent().build();
    }
}
