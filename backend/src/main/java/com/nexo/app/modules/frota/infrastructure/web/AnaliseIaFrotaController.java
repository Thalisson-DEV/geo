package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.AnaliseIaResponse;
import com.nexo.app.modules.frota.application.usecases.AnaliseIaFrotaUseCases;
import com.nexo.app.modules.frota.doc.AnaliseIaFrotaControllerDoc;
import com.nexo.app.modules.frota.domain.AlvoAnaliseIa;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/v1/frota")
@RequiredArgsConstructor
public class AnaliseIaFrotaController implements AnaliseIaFrotaControllerDoc {

    private final AnaliseIaFrotaUseCases useCases;

    @Override
    @GetMapping("/ordens-servico/{id}/analise-ia")
    @PreAuthorize("hasAuthority('frota:os:read')")
    public ResponseEntity<AnaliseIaResponse.Estado> estadoOrdemServico(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.estado(AlvoAnaliseIa.ORDEM_SERVICO, id));
    }

    @Override
    @PostMapping("/ordens-servico/{id}/analise-ia")
    @PreAuthorize("hasAuthority('frota:os:read')")
    public ResponseEntity<AnaliseIaResponse> analisarOrdemServico(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.analisar(AlvoAnaliseIa.ORDEM_SERVICO, id));
    }

    @Override
    @GetMapping("/checklists/{id}/analise-ia")
    @PreAuthorize("hasAuthority('frota:checklist:read')")
    public ResponseEntity<AnaliseIaResponse.Estado> estadoChecklist(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.estado(AlvoAnaliseIa.CHECKLIST, id));
    }

    @Override
    @PostMapping("/checklists/{id}/analise-ia")
    @PreAuthorize("hasAuthority('frota:checklist:read')")
    public ResponseEntity<AnaliseIaResponse> analisarChecklist(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.analisar(AlvoAnaliseIa.CHECKLIST, id));
    }

    @Override
    @GetMapping("/abastecimentos/{id}/analise-ia")
    @PreAuthorize("hasAuthority('frota:abastecimento:read')")
    public ResponseEntity<AnaliseIaResponse.Estado> estadoAbastecimento(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.estado(AlvoAnaliseIa.ABASTECIMENTO, id));
    }

    @Override
    @PostMapping("/abastecimentos/{id}/analise-ia")
    @PreAuthorize("hasAuthority('frota:abastecimento:read')")
    public ResponseEntity<AnaliseIaResponse> analisarAbastecimento(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.analisar(AlvoAnaliseIa.ABASTECIMENTO, id));
    }
}
