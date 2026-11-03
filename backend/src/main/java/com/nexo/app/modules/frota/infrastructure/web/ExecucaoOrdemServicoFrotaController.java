package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.AjustesOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.MecanicoParaTodosRequest;
import com.nexo.app.modules.frota.application.dto.OrdemServicoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.PecaOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.ServicoOrdemServicoRequest;
import com.nexo.app.modules.frota.application.usecases.ExecucaoOrdemServicoUseCases;
import com.nexo.app.modules.frota.doc.ExecucaoOrdemServicoFrotaControllerDoc;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/ordens-servico/{id}")
@RequiredArgsConstructor
public class ExecucaoOrdemServicoFrotaController implements ExecucaoOrdemServicoFrotaControllerDoc {

    /** A operação e a oficina lançam a execução. */
    private static final String EXECUCAO = "hasAnyAuthority('frota:os:write', 'frota:os:executar')";

    private final ExecucaoOrdemServicoUseCases execucao;

    @Override
    @PostMapping("/servicos")
    @PreAuthorize(EXECUCAO)
    public ResponseEntity<OrdemServicoDetalheResponse> lancarServico(@PathVariable UUID id,
                                                                     @Valid @RequestBody ServicoOrdemServicoRequest request) {
        return ResponseEntity.ok(execucao.lancarServico(id, request));
    }

    @Override
    @PutMapping("/servicos/{idServico}")
    @PreAuthorize(EXECUCAO)
    public ResponseEntity<OrdemServicoDetalheResponse> alterarServico(@PathVariable UUID id, @PathVariable UUID idServico,
                                                                      @Valid @RequestBody ServicoOrdemServicoRequest request) {
        return ResponseEntity.ok(execucao.alterarServico(id, idServico, request));
    }

    @Override
    @DeleteMapping("/servicos/{idServico}")
    @PreAuthorize(EXECUCAO)
    public ResponseEntity<OrdemServicoDetalheResponse> excluirServico(@PathVariable UUID id, @PathVariable UUID idServico) {
        return ResponseEntity.ok(execucao.excluirServico(id, idServico));
    }

    @Override
    @PostMapping("/servicos/mecanico")
    @PreAuthorize(EXECUCAO)
    public ResponseEntity<OrdemServicoDetalheResponse> definirMecanicoParaTodos(@PathVariable UUID id,
                                                                                @Valid @RequestBody MecanicoParaTodosRequest request) {
        return ResponseEntity.ok(execucao.definirMecanicoParaTodos(id, request));
    }

    @Override
    @PutMapping("/ajustes")
    @PreAuthorize(EXECUCAO)
    public ResponseEntity<OrdemServicoDetalheResponse> definirAjustes(@PathVariable UUID id,
                                                                      @Valid @RequestBody AjustesOrdemServicoRequest request) {
        return ResponseEntity.ok(execucao.definirAjustes(id, request));
    }

    @Override
    @PostMapping("/pecas")
    @PreAuthorize(EXECUCAO)
    public ResponseEntity<OrdemServicoDetalheResponse> lancarPeca(@PathVariable UUID id,
                                                                  @Valid @RequestBody PecaOrdemServicoRequest request) {
        return ResponseEntity.ok(execucao.lancarPeca(id, request));
    }

    @Override
    @PutMapping("/pecas/{idPeca}")
    @PreAuthorize(EXECUCAO)
    public ResponseEntity<OrdemServicoDetalheResponse> alterarPeca(@PathVariable UUID id, @PathVariable UUID idPeca,
                                                                   @Valid @RequestBody PecaOrdemServicoRequest request) {
        return ResponseEntity.ok(execucao.alterarPeca(id, idPeca, request));
    }

    @Override
    @DeleteMapping("/pecas/{idPeca}")
    @PreAuthorize(EXECUCAO)
    public ResponseEntity<OrdemServicoDetalheResponse> excluirPeca(@PathVariable UUID id, @PathVariable UUID idPeca) {
        return ResponseEntity.ok(execucao.excluirPeca(id, idPeca));
    }
}
