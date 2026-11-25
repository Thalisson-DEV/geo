package com.nexo.app.modules.sst.infrastructure.web;

import com.nexo.app.modules.sst.application.dto.ModeloAprRequest;
import com.nexo.app.modules.sst.application.dto.ModeloAprResponse;
import com.nexo.app.modules.sst.application.usecases.ModeloAprUseCases;
import com.nexo.app.modules.sst.doc.ModeloAprControllerDoc;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/sst/apr/modelo")
@RequiredArgsConstructor
public class ModeloAprController implements ModeloAprControllerDoc {

    private final ModeloAprUseCases useCases;

    @Override
    @GetMapping
    @PreAuthorize("hasAuthority('sst:formulario:read')")
    public ResponseEntity<ModeloAprResponse> obter() {
        return ResponseEntity.ok(useCases.obter());
    }

    @Override
    @PutMapping
    @PreAuthorize("hasAuthority('sst:formulario:write')")
    public ResponseEntity<ModeloAprResponse> salvar(@Valid @RequestBody ModeloAprRequest request) {
        return ResponseEntity.ok(useCases.salvar(request));
    }
}
