package com.nexo.app.modules.obras.infrastructure.web;

import com.nexo.app.modules.obras.application.dto.BookObraResponses;
import com.nexo.app.modules.obras.application.usecases.BookObraUseCases;
import com.nexo.app.modules.obras.doc.BookObraControllerDoc;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/v1/obras")
@RequiredArgsConstructor
public class BookObraController implements BookObraControllerDoc {

    private static final String LER = "hasAuthority('obras:documentacao:read')";

    private final BookObraUseCases useCases;

    @Override
    @GetMapping("/{id}/documentacao/painel")
    @PreAuthorize(LER)
    public ResponseEntity<BookObraResponses.Painel> painel(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.painel(id));
    }

    @Override
    @GetMapping("/{id}/documentacao/comparativo")
    @PreAuthorize(LER)
    public ResponseEntity<BookObraResponses.Comparativo> comparativo(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.comparativo(id));
    }

    @Override
    @GetMapping("/book/consolidado")
    @PreAuthorize(LER)
    public ResponseEntity<BookObraResponses.Consolidado> consolidado() {
        return ResponseEntity.ok(useCases.consolidado());
    }
}
