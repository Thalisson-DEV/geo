package com.nexo.app.modules.obras.infrastructure.web;

import com.nexo.app.modules.obras.application.dto.TipoDeObraFilter;
import com.nexo.app.modules.obras.application.dto.TipoDeObraRequest;
import com.nexo.app.modules.obras.application.dto.TipoDeObraResponse;
import com.nexo.app.modules.obras.application.usecases.TipoDeObraUseCases;
import com.nexo.app.modules.obras.doc.TipoDeObraControllerDoc;
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
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/obras/tipos-obra")
@RequiredArgsConstructor
public class TipoDeObraController implements TipoDeObraControllerDoc {

    private final TipoDeObraUseCases useCases;

    @Override
    @PostMapping
    @PreAuthorize("hasAuthority('obras:cadastros:write')")
    public ResponseEntity<TipoDeObraResponse> criar(@Valid @RequestBody TipoDeObraRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.criar(request));
    }

    @Override
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('obras:cadastros:write')")
    public ResponseEntity<TipoDeObraResponse> atualizar(@PathVariable UUID id, @Valid @RequestBody TipoDeObraRequest request) {
        return ResponseEntity.ok(useCases.atualizar(id, request));
    }

    @Override
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('obras:cadastros:read') or hasAuthority('obras:obra:read')")
    public ResponseEntity<TipoDeObraResponse> buscarPorId(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.buscarPorId(id));
    }

    @Override
    @GetMapping
    @PreAuthorize("hasAuthority('obras:cadastros:read')")
    public ResponseEntity<PageResponse<TipoDeObraResponse>> listar(@ParameterObject TipoDeObraFilter filter,
                                                                   @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(filter, pageable));
    }

    @Override
    @GetMapping("/todos-ativos")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<TipoDeObraResponse>> listarTodosAtivos() {
        return ResponseEntity.ok(useCases.listarTodosAtivos());
    }

    @Override
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('obras:cadastros:write')")
    public ResponseEntity<Void> desativar(@PathVariable UUID id) {
        useCases.desativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PatchMapping("/{id}/reativar")
    @PreAuthorize("hasAuthority('obras:cadastros:write')")
    public ResponseEntity<Void> reativar(@PathVariable UUID id) {
        useCases.reativar(id);
        return ResponseEntity.noContent().build();
    }
}
