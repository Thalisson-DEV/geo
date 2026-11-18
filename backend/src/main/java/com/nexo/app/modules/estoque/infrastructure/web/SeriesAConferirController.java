package com.nexo.app.modules.estoque.infrastructure.web;

import com.nexo.app.modules.estoque.application.dto.ConciliarSerieAplicadaRequest;
import com.nexo.app.modules.estoque.application.dto.SeriesAConferirResponse;
import com.nexo.app.modules.estoque.application.usecases.SeriesAConferirUseCases;
import com.nexo.app.modules.estoque.doc.SeriesAConferirControllerDoc;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/v1/saldos/estoques/{idEstoque}/series-a-conferir")
@RequiredArgsConstructor
public class SeriesAConferirController implements SeriesAConferirControllerDoc {

    private final SeriesAConferirUseCases useCases;

    @Override
    @GetMapping
    @PreAuthorize("hasAuthority('estoque:saldo:read')")
    public ResponseEntity<SeriesAConferirResponse> listar(@PathVariable UUID idEstoque) {
        return ResponseEntity.ok(useCases.listar(idEstoque));
    }

    @Override
    @PostMapping("/conciliacoes")
    @PreAuthorize("hasAuthority('estoque:movimentacao:write')")
    public ResponseEntity<SeriesAConferirResponse> conciliar(@PathVariable UUID idEstoque,
                                                             @Valid @RequestBody ConciliarSerieAplicadaRequest request) {
        return ResponseEntity.ok(useCases.conciliar(idEstoque, request, SecurityUtils.getUsuarioLogadoId()));
    }
}
