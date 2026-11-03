package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.ModeloChecklistFilter;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistRequest;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistResponse;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistResumoResponse;
import com.nexo.app.modules.frota.application.dto.ModelosVeiculoChecklistResponse;
import com.nexo.app.modules.frota.application.usecases.ModeloChecklistUseCases;
import com.nexo.app.modules.frota.doc.ModeloChecklistFrotaControllerDoc;
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
@RequestMapping("/v1/frota/checklist/modelos")
@RequiredArgsConstructor
public class ModeloChecklistFrotaController implements ModeloChecklistFrotaControllerDoc {

    private static final String LEITURA = "hasAnyAuthority('frota:checklist:read', 'frota:checklist:configurar')";
    private static final String CONFIGURAR = "hasAuthority('frota:checklist:configurar')";

    private final ModeloChecklistUseCases useCases;

    @Override
    @GetMapping
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<ModeloChecklistResumoResponse>> listar(@ParameterObject ModeloChecklistFilter filtro,
                                                                            @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(filtro, pageable));
    }

    @Override
    @GetMapping("/{id}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<ModeloChecklistResponse> buscarPorId(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.buscarPorId(id));
    }

    @Override
    @PostMapping
    @PreAuthorize(CONFIGURAR)
    public ResponseEntity<ModeloChecklistResponse> criar(@Valid @RequestBody ModeloChecklistRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.criar(request));
    }

    @Override
    @PutMapping("/{id}")
    @PreAuthorize(CONFIGURAR)
    public ResponseEntity<ModeloChecklistResponse> atualizar(@PathVariable UUID id,
                                                             @Valid @RequestBody ModeloChecklistRequest request) {
        return ResponseEntity.ok(useCases.atualizar(id, request));
    }

    @Override
    @DeleteMapping("/{id}")
    @PreAuthorize(CONFIGURAR)
    public ResponseEntity<Void> desativar(@PathVariable UUID id) {
        useCases.desativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PutMapping("/{id}/ativar")
    @PreAuthorize(CONFIGURAR)
    public ResponseEntity<Void> ativar(@PathVariable UUID id) {
        useCases.ativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @GetMapping("/veiculo/{idVeiculo}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<ModelosVeiculoChecklistResponse> modelosDoVeiculo(@PathVariable UUID idVeiculo) {
        return ResponseEntity.ok(useCases.modelosDoVeiculo(idVeiculo));
    }
}
