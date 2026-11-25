package com.nexo.app.modules.estoque.infrastructure.web;

import com.nexo.app.modules.estoque.application.dto.EstoqueObraRequests;
import com.nexo.app.modules.estoque.application.dto.EstoqueObraResponses;
import com.nexo.app.modules.estoque.application.usecases.CanteiroUseCases;
import com.nexo.app.modules.estoque.application.usecases.EstoqueObraUseCases;
import com.nexo.app.modules.estoque.doc.EstoqueObraControllerDoc;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/estoque-obra")
@RequiredArgsConstructor
public class EstoqueObraController implements EstoqueObraControllerDoc {

    private final EstoqueObraUseCases useCases;
    private final CanteiroUseCases canteiros;
    private final com.nexo.app.modules.estoque.application.usecases.AplicacaoMaterialObraUseCases aplicacoes;

    @Override
    @PostMapping("/apontamentos/reprocessar")
    @PreAuthorize("hasAuthority('estoque:estoque:write')")
    public ResponseEntity<Map<String, Integer>> reprocessarApontamentos() {
        return ResponseEntity.ok(Map.of("baixados", aplicacoes.reprocessarPendentes()));
    }

    @Override
    @GetMapping("/obras/{idObra}")
    @PreAuthorize("hasAuthority('estoque:saldo:read')")
    public ResponseEntity<EstoqueObraResponses.MaterialDaObra> materialDaObra(@PathVariable UUID idObra) {
        return ResponseEntity.ok(useCases.materialDaObra(idObra));
    }

    @Override
    @GetMapping("/estoques/{idEstoque}")
    @PreAuthorize("hasAnyAuthority('estoque:saldo:read', 'estoque:canteiro:read')")
    public ResponseEntity<EstoqueObraResponses.SaldoPorObra> saldoPorObra(@PathVariable UUID idEstoque) {
        return ResponseEntity.ok(useCases.saldoPorObra(idEstoque));
    }

    @Override
    @GetMapping("/equipes/{idEquipe}/caminhao")
    @PreAuthorize("hasAnyAuthority('estoque:saldo:read', 'estoque:canteiro:read')")
    public ResponseEntity<EstoqueObraResponses.SaldoPorObra> caminhaoDaEquipe(@PathVariable UUID idEquipe) {
        return ResponseEntity.ok(useCases.caminhaoDaEquipe(idEquipe));
    }

    @Override
    @PostMapping("/devolucoes-sobra")
    @PreAuthorize("hasAuthority('estoque:movimentacao:write')")
    public ResponseEntity<Map<String, UUID>> devolverSobra(@Valid @RequestBody EstoqueObraRequests.DevolverSobra request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", useCases.devolverSobra(request)));
    }

    @Override
    @PostMapping("/remanejamentos")
    @PreAuthorize("hasAuthority('estoque:movimentacao:write')")
    public ResponseEntity<Map<String, UUID>> remanejar(@Valid @RequestBody EstoqueObraRequests.Remanejar request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", useCases.remanejar(request)));
    }

    @Override
    @GetMapping("/canteiros")
    @PreAuthorize("hasAnyAuthority('estoque:saldo:read', 'estoque:canteiro:read')")
    public ResponseEntity<List<EstoqueObraResponses.Canteiro>> listarCanteiros(
            @RequestParam(defaultValue = "false") boolean incluirInativos) {
        return ResponseEntity.ok(canteiros.listar(incluirInativos));
    }

    @Override
    @PostMapping("/canteiros")
    @PreAuthorize("hasAuthority('estoque:estoque:write')")
    public ResponseEntity<EstoqueObraResponses.Canteiro> criarCanteiro(@Valid @RequestBody EstoqueObraRequests.Canteiro request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(canteiros.criar(request));
    }

    @Override
    @PutMapping("/canteiros/{id}")
    @PreAuthorize("hasAuthority('estoque:estoque:write')")
    public ResponseEntity<EstoqueObraResponses.Canteiro> editarCanteiro(
            @PathVariable UUID id, @Valid @RequestBody EstoqueObraRequests.Canteiro request) {
        return ResponseEntity.ok(canteiros.editar(id, request));
    }

    @Override
    @DeleteMapping("/canteiros/{id}")
    @PreAuthorize("hasAuthority('estoque:estoque:write')")
    public ResponseEntity<Void> desativarCanteiro(@PathVariable UUID id) {
        canteiros.desativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PostMapping("/canteiros/{id}/movimentos")
    @PreAuthorize("hasAnyAuthority('estoque:canteiro:write', 'estoque:movimentacao:write')")
    public ResponseEntity<Map<String, UUID>> movimentarCanteiro(
            @PathVariable UUID id, @Valid @RequestBody EstoqueObraRequests.MovimentarCanteiro request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", useCases.movimentarCanteiro(id, request)));
    }
}
