package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.ItemManutencaoFilter;
import com.nexo.app.modules.frota.application.dto.ItemManutencaoRequest;
import com.nexo.app.modules.frota.application.dto.ItemManutencaoResponse;
import com.nexo.app.modules.frota.application.usecases.ItemManutencaoUseCases;
import com.nexo.app.modules.frota.doc.ItemManutencaoFrotaControllerDoc;
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
@RequestMapping("/v1/frota/itens-manutencao")
@RequiredArgsConstructor
public class ItemManutencaoFrotaController implements ItemManutencaoFrotaControllerDoc {

    private static final String LEITURA = "hasAnyAuthority('frota:os:read', 'frota:configuracao:write')";
    private static final String ESCRITA = "hasAuthority('frota:configuracao:write')";

    private final ItemManutencaoUseCases itens;

    @Override
    @GetMapping
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<ItemManutencaoResponse>> listar(@ParameterObject ItemManutencaoFilter filtro,
                                                                      @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(itens.listar(filtro, pageable));
    }

    @Override
    @GetMapping("/{id}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<ItemManutencaoResponse> buscar(@PathVariable UUID id) {
        return ResponseEntity.ok(itens.buscarPorId(id));
    }

    @Override
    @PostMapping
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ItemManutencaoResponse> criar(@Valid @RequestBody ItemManutencaoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(itens.criar(request));
    }

    @Override
    @PutMapping("/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ItemManutencaoResponse> atualizar(@PathVariable UUID id,
                                                            @Valid @RequestBody ItemManutencaoRequest request) {
        return ResponseEntity.ok(itens.atualizar(id, request));
    }

    @Override
    @DeleteMapping("/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<Void> desativar(@PathVariable UUID id) {
        itens.desativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PutMapping("/{id}/ativar")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<Void> ativar(@PathVariable UUID id) {
        itens.ativar(id);
        return ResponseEntity.noContent().build();
    }
}
