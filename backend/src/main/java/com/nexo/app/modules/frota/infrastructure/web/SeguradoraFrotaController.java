package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.SeguradoraFrotaRequest;
import com.nexo.app.modules.frota.application.dto.SeguradoraFrotaResponse;
import com.nexo.app.modules.frota.application.usecases.SeguradoraFrotaUseCases;
import com.nexo.app.modules.frota.doc.SeguradoraFrotaControllerDoc;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
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

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/seguradoras")
@RequiredArgsConstructor
public class SeguradoraFrotaController implements SeguradoraFrotaControllerDoc {

    private static final String LEITURA = "hasAuthority('frota:seguro:read')";
    private static final String ESCRITA = "hasAuthority('frota:seguro:write')";

    private final SeguradoraFrotaUseCases useCases;

    @Override
    @GetMapping
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<SeguradoraFrotaResponse>> listar() {
        return ResponseEntity.ok(useCases.listar());
    }

    @Override
    @PostMapping
    @PreAuthorize(ESCRITA)
    public ResponseEntity<SeguradoraFrotaResponse> criar(@Valid @RequestBody SeguradoraFrotaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.criar(request));
    }

    @Override
    @PutMapping("/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<SeguradoraFrotaResponse> atualizar(@PathVariable UUID id, @Valid @RequestBody SeguradoraFrotaRequest request) {
        return ResponseEntity.ok(useCases.atualizar(id, request));
    }

    @Override
    @DeleteMapping("/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<Void> desativar(@PathVariable UUID id) {
        useCases.desativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PutMapping("/{id}/ativar")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<Void> ativar(@PathVariable UUID id) {
        useCases.ativar(id);
        return ResponseEntity.noContent().build();
    }
}
