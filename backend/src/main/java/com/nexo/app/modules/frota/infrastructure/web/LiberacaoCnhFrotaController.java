package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.AptidaoConducaoResponse;
import com.nexo.app.modules.frota.application.dto.LiberacaoCnhRequest;
import com.nexo.app.modules.frota.application.dto.LiberacaoCnhResponse;
import com.nexo.app.modules.frota.application.usecases.LiberacaoCnhUseCases;
import com.nexo.app.modules.frota.doc.LiberacaoCnhFrotaControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class LiberacaoCnhFrotaController implements LiberacaoCnhFrotaControllerDoc {

    private static final String LEITURA = "hasAnyAuthority('frota:condutor:read', 'frota:checklist:read')";

    private final LiberacaoCnhUseCases useCases;

    @Override
    @GetMapping("/v1/frota/condutores/{idColaborador}/aptidao")
    @PreAuthorize(LEITURA)
    public ResponseEntity<AptidaoConducaoResponse> aptidao(@PathVariable UUID idColaborador,
                                                           @RequestParam UUID idVeiculo,
                                                           @RequestParam(required = false)
                                                           @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dia) {
        return ResponseEntity.ok(useCases.aptidao(idColaborador, idVeiculo, dia));
    }

    @Override
    @PostMapping("/v1/frota/liberacoes-cnh")
    @PreAuthorize("hasAuthority('frota:condutor:write')")
    public ResponseEntity<LiberacaoCnhResponse> liberar(@Valid @RequestBody LiberacaoCnhRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.liberar(request));
    }

    @Override
    @GetMapping("/v1/frota/liberacoes-cnh")
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<LiberacaoCnhResponse>> listar(@ParameterObject Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(pageable));
    }
}
