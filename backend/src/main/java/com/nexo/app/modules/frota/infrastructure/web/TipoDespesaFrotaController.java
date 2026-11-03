package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.TipoDespesaRequest;
import com.nexo.app.modules.frota.application.dto.TipoDespesaResponse;
import com.nexo.app.modules.frota.application.usecases.TipoDespesaUseCases;
import com.nexo.app.modules.frota.doc.TipoDespesaFrotaControllerDoc;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/despesas/tipos")
@RequiredArgsConstructor
public class TipoDespesaFrotaController implements TipoDespesaFrotaControllerDoc {

    private final TipoDespesaUseCases useCases;

    @Override
    @GetMapping
    @PreAuthorize("hasAuthority('frota:despesa:read')")
    public ResponseEntity<List<TipoDespesaResponse>> listar(@RequestParam(defaultValue = "true") boolean apenasAtivos) {
        return ResponseEntity.ok(useCases.listar(apenasAtivos));
    }

    @Override
    @PostMapping
    @PreAuthorize("hasAuthority('frota:despesa:write')")
    public ResponseEntity<TipoDespesaResponse> criar(@Valid @RequestBody TipoDespesaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.criar(request));
    }

    @Override
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('frota:despesa:write')")
    public ResponseEntity<TipoDespesaResponse> atualizar(@PathVariable UUID id, @Valid @RequestBody TipoDespesaRequest request) {
        return ResponseEntity.ok(useCases.atualizar(id, request));
    }

    @Override
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('frota:despesa:write')")
    public ResponseEntity<Void> desativar(@PathVariable UUID id) {
        useCases.desativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PutMapping("/{id}/ativar")
    @PreAuthorize("hasAuthority('frota:despesa:write')")
    public ResponseEntity<Void> ativar(@PathVariable UUID id) {
        useCases.ativar(id);
        return ResponseEntity.noContent().build();
    }
}
