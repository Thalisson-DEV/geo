package com.nexo.app.modules.obras.infrastructure.web;

import com.nexo.app.modules.obras.application.dto.AlterarItemOrcamentoObraRequest;
import com.nexo.app.modules.obras.application.dto.GerarOrcamentoObraRequest;
import com.nexo.app.modules.obras.application.dto.ItemOrcamentoObraRequest;
import com.nexo.app.modules.obras.application.dto.OrcamentoObraResponse;
import com.nexo.app.modules.obras.application.usecases.OrcamentoObraUseCases;
import com.nexo.app.modules.obras.doc.OrcamentoObraControllerDoc;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
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
@RequestMapping("/v1/obras/{id}/orcamento")
@RequiredArgsConstructor
public class OrcamentoObraController implements OrcamentoObraControllerDoc {

    private final OrcamentoObraUseCases useCases;

    @Override
    @GetMapping
    @PreAuthorize("hasAuthority('obras:obra:read')")
    public ResponseEntity<OrcamentoObraResponse> buscar(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.buscar(id));
    }

    @Override
    @GetMapping("/revisoes")
    @PreAuthorize("hasAuthority('obras:obra:read')")
    public ResponseEntity<List<OrcamentoObraResponse.Revisao>> listarRevisoes(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.listarRevisoes(id));
    }

    @Override
    @PostMapping("/itens")
    @PreAuthorize("hasAuthority('obras:obra:write')")
    public ResponseEntity<OrcamentoObraResponse> adicionarItem(@PathVariable UUID id,
                                                               @Valid @RequestBody ItemOrcamentoObraRequest request) {
        return ResponseEntity.ok(useCases.adicionarItem(id, request));
    }

    @Override
    @PutMapping("/itens/{idItem}")
    @PreAuthorize("hasAuthority('obras:obra:write')")
    public ResponseEntity<OrcamentoObraResponse> alterarItem(@PathVariable UUID id, @PathVariable UUID idItem,
                                                             @Valid @RequestBody AlterarItemOrcamentoObraRequest request) {
        return ResponseEntity.ok(useCases.alterarItem(id, idItem, request));
    }

    @Override
    @DeleteMapping("/itens/{idItem}")
    @PreAuthorize("hasAuthority('obras:obra:write')")
    public ResponseEntity<OrcamentoObraResponse> removerItem(@PathVariable UUID id, @PathVariable UUID idItem) {
        return ResponseEntity.ok(useCases.removerItem(id, idItem));
    }

    @Override
    @PostMapping("/gerar-do-planejamento")
    @PreAuthorize("hasAuthority('obras:obra:write')")
    public ResponseEntity<OrcamentoObraResponse> gerarDoPlanejamento(@PathVariable UUID id,
                                                                     @Valid @RequestBody(required = false) GerarOrcamentoObraRequest request) {
        return ResponseEntity.ok(useCases.gerarDoPlanejamento(id, request));
    }
}
