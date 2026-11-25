package com.nexo.app.modules.obras.infrastructure.web;

import com.nexo.app.modules.obras.application.dto.ConclusaoObraResponse;
import com.nexo.app.modules.obras.application.dto.ResolverOcorrenciaRequest;
import com.nexo.app.modules.obras.application.usecases.ConclusaoObraUseCases;
import com.nexo.app.modules.obras.doc.ConclusaoObraControllerDoc;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/v1/obras/{idObra}/conclusao")
@RequiredArgsConstructor
public class ConclusaoObraController implements ConclusaoObraControllerDoc {

    private final ConclusaoObraUseCases useCases;

    @Override
    @GetMapping
    @PreAuthorize("hasAuthority('obras:obra:read')")
    public ResponseEntity<ConclusaoObraResponse> consultar(@PathVariable UUID idObra) {
        return ResponseEntity.ok(useCases.consultar(idObra));
    }

    @Override
    @PostMapping("/ocorrencias/{idOcorrencia}/resolver")
    @PreAuthorize("hasAuthority('obras:obra:write')")
    public ResponseEntity<ConclusaoObraResponse> resolver(@PathVariable UUID idObra, @PathVariable UUID idOcorrencia,
                                                          @Valid @RequestBody ResolverOcorrenciaRequest request) {
        return ResponseEntity.ok(useCases.resolverOcorrencia(idObra, idOcorrencia, request.resolucao()));
    }
}
