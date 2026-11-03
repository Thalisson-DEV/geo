package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.ConferenciaFaturaResponse;
import com.nexo.app.modules.frota.application.dto.ConferirFaturaRequest;
import com.nexo.app.modules.frota.application.dto.FaturaPostoRequest;
import com.nexo.app.modules.frota.application.dto.FaturaPostoResponse;
import com.nexo.app.modules.frota.application.dto.PreenchimentoFinanceiroResponse;
import com.nexo.app.modules.frota.application.usecases.FaturaPostoUseCases;
import com.nexo.app.modules.frota.doc.FaturaPostoFrotaControllerDoc;
import com.nexo.app.modules.frota.domain.FaturaPosto;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** Faturas ficam com quem libera abastecimentos (o administrativo). */
@RestController
@RequestMapping("/v1/frota/abastecimento/faturas")
@RequiredArgsConstructor
@PreAuthorize("hasAuthority('frota:abastecimento:liberar')")
public class FaturaPostoFrotaController implements FaturaPostoFrotaControllerDoc {

    private final FaturaPostoUseCases useCases;

    @Override
    @GetMapping
    public ResponseEntity<PageResponse<FaturaPostoResponse>> listar(@RequestParam(required = false) UUID idPosto,
                                                                  @RequestParam(required = false) FaturaPosto.Situacao situacao,
                                                                  @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(idPosto, situacao, pageable));
    }

    @Override
    @PostMapping
    public ResponseEntity<FaturaPostoResponse> criar(@Valid @RequestBody FaturaPostoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.criar(request));
    }

    @Override
    @PutMapping("/{id}")
    public ResponseEntity<FaturaPostoResponse> atualizar(@PathVariable UUID id, @Valid @RequestBody FaturaPostoRequest request) {
        return ResponseEntity.ok(useCases.atualizar(id, request));
    }

    @Override
    @GetMapping("/{id}/conferencia")
    public ResponseEntity<ConferenciaFaturaResponse> conferencia(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.conferencia(id));
    }

    @Override
    @PostMapping("/{id}/conferencia")
    public ResponseEntity<FaturaPostoResponse> conferir(@PathVariable UUID id, @Valid @RequestBody ConferirFaturaRequest request) {
        return ResponseEntity.ok(useCases.conferir(id, request.idsAbastecimento()));
    }

    @Override
    @GetMapping("/{id}/preenchimento-financeiro")
    public ResponseEntity<PreenchimentoFinanceiroResponse> preenchimentoFinanceiro(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.preenchimentoFinanceiro(id));
    }
}
