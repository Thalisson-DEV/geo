package com.nexo.app.modules.estoque.infrastructure.web;

import com.nexo.app.modules.estoque.application.dto.EstoqueRelatorioResponse;
import com.nexo.app.modules.estoque.application.dto.FechamentoRelatorioResponse;
import com.nexo.app.modules.estoque.application.dto.MovimentacoesRelatorioResponse;
import com.nexo.app.modules.estoque.application.usecases.RelatorioAlmoxarifadoUseCases;
import com.nexo.app.modules.estoque.doc.RelatorioAlmoxarifadoControllerDoc;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/v1/almoxarifado/relatorios")
@RequiredArgsConstructor
public class RelatorioAlmoxarifadoController implements RelatorioAlmoxarifadoControllerDoc {

    private final RelatorioAlmoxarifadoUseCases useCases;

    @Override
    @GetMapping("/movimentacoes")
    @PreAuthorize("hasAuthority('estoque:movimentacao:read')")
    public ResponseEntity<MovimentacoesRelatorioResponse> movimentacoes(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate de,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate ate) {
        return ResponseEntity.ok(useCases.movimentacoes(de, ate));
    }

    @Override
    @GetMapping("/estoque")
    @PreAuthorize("hasAuthority('estoque:saldo:read')")
    public ResponseEntity<EstoqueRelatorioResponse> estoque() {
        return ResponseEntity.ok(useCases.estoque());
    }

    @Override
    @GetMapping("/fechamento")
    @PreAuthorize("hasAuthority('obras:fechamento:read')")
    public ResponseEntity<FechamentoRelatorioResponse> fechamento(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate de,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate ate) {
        return ResponseEntity.ok(useCases.fechamento(de, ate));
    }
}
