package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.RelatorioFrotaDetalheResponse;
import com.nexo.app.modules.frota.application.dto.RelatorioGerencialFrotaFilter;
import com.nexo.app.modules.frota.application.dto.RelatorioGerencialFrotaResponse;
import com.nexo.app.modules.frota.application.usecases.RelatorioFrotaDetalheUseCases;
import com.nexo.app.modules.frota.application.usecases.RelatorioGerencialFrotaUseCases;
import com.nexo.app.modules.frota.doc.RelatorioGerencialFrotaControllerDoc;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/frota/relatorios")
@RequiredArgsConstructor
public class RelatorioGerencialFrotaController implements RelatorioGerencialFrotaControllerDoc {

    private final RelatorioGerencialFrotaUseCases relatorios;
    private final RelatorioFrotaDetalheUseCases detalhes;

    @Override
    @GetMapping("/gerencial")
    @PreAuthorize("hasAuthority('frota:veiculo:read')")
    public ResponseEntity<RelatorioGerencialFrotaResponse> gerar(@ParameterObject RelatorioGerencialFrotaFilter filtro) {
        return ResponseEntity.ok(relatorios.gerar(filtro));
    }

    @Override
    @GetMapping("/detalhe/custos")
    @PreAuthorize("hasAuthority('frota:veiculo:read')")
    public ResponseEntity<RelatorioFrotaDetalheResponse.Custos> custos(@ParameterObject RelatorioGerencialFrotaFilter filtro) {
        return ResponseEntity.ok(detalhes.custos(filtro));
    }

    @Override
    @GetMapping("/detalhe/manutencao")
    @PreAuthorize("hasAuthority('frota:veiculo:read') and hasAuthority('frota:os:read')")
    public ResponseEntity<RelatorioFrotaDetalheResponse.Manutencao> manutencao(@ParameterObject RelatorioGerencialFrotaFilter filtro) {
        return ResponseEntity.ok(detalhes.manutencao(filtro));
    }

    @Override
    @GetMapping("/detalhe/combustivel")
    @PreAuthorize("hasAuthority('frota:veiculo:read') and hasAuthority('frota:abastecimento:read')")
    public ResponseEntity<RelatorioFrotaDetalheResponse.Combustivel> combustivel(@ParameterObject RelatorioGerencialFrotaFilter filtro) {
        return ResponseEntity.ok(detalhes.combustivel(filtro));
    }

    @Override
    @GetMapping("/detalhe/uso")
    @PreAuthorize("hasAuthority('frota:veiculo:read')")
    public ResponseEntity<RelatorioFrotaDetalheResponse.Uso> uso(@ParameterObject RelatorioGerencialFrotaFilter filtro) {
        return ResponseEntity.ok(detalhes.uso(filtro));
    }

    @Override
    @GetMapping("/detalhe/conformidade")
    @PreAuthorize("hasAuthority('frota:veiculo:read')")
    public ResponseEntity<RelatorioFrotaDetalheResponse.Conformidade> conformidade(@ParameterObject RelatorioGerencialFrotaFilter filtro,
                                                                                  @RequestParam(required = false) Integer horizonte) {
        return ResponseEntity.ok(detalhes.conformidade(filtro, horizonte));
    }
}
