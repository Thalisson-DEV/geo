package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.SituacaoVeiculoAppResponse;
import com.nexo.app.modules.frota.application.usecases.SituacaoVeiculoAppUseCases;
import com.nexo.app.modules.frota.doc.VeiculoAppFrotaControllerDoc;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** Qualquer usuário do app consulta a situação dos veículos, como já consulta o histórico de checklists deles. */
@RestController
@RequestMapping("/v1/frota/app/veiculos")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class VeiculoAppFrotaController implements VeiculoAppFrotaControllerDoc {

    private final SituacaoVeiculoAppUseCases useCases;

    @Override
    @GetMapping("/{idVeiculo}/situacao")
    public ResponseEntity<SituacaoVeiculoAppResponse> situacao(@PathVariable UUID idVeiculo) {
        return ResponseEntity.ok(useCases.situacao(idVeiculo));
    }
}
