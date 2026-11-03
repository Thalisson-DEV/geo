package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.AjustesOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.MecanicoParaTodosRequest;
import com.nexo.app.modules.frota.application.dto.OrdemServicoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.PecaOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.ServicoOrdemServicoRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

@Tag(name = "Frota — Execução da OS", description = "Mão de obra com mecânico e peças com origem, lançadas na OS aberta")
public interface ExecucaoOrdemServicoFrotaControllerDoc {

    @Operation(summary = "Lançar serviço (mão de obra)",
            description = "Oficina interna exige mecânico colaborador; externa aceita só nome livre. Só OS aberta.")
    @ApiResponse(responseCode = "200", description = "Ficha da OS atualizada")
    @ApiResponse(responseCode = "422", description = "OS concluída/cancelada ou mecânico incoerente com a oficina")
    ResponseEntity<OrdemServicoDetalheResponse> lancarServico(UUID id, ServicoOrdemServicoRequest request);

    @Operation(summary = "Alterar serviço")
    ResponseEntity<OrdemServicoDetalheResponse> alterarServico(UUID id, UUID idServico, ServicoOrdemServicoRequest request);

    @Operation(summary = "Excluir serviço")
    ResponseEntity<OrdemServicoDetalheResponse> excluirServico(UUID id, UUID idServico);

    @Operation(summary = "Mesmo mecânico para todos os serviços")
    ResponseEntity<OrdemServicoDetalheResponse> definirMecanicoParaTodos(UUID id, MecanicoParaTodosRequest request);

    @Operation(summary = "Desconto e acréscimo",
            description = "Sobre a soma dos serviços e das peças. O desconto não pode passar dessa soma.")
    ResponseEntity<OrdemServicoDetalheResponse> definirAjustes(UUID id, AjustesOrdemServicoRequest request);

    @Operation(summary = "Lançar peça ou consumível",
            description = "Origem estoque só registra de onde veio; não dá baixa no estoque nesta fase.")
    ResponseEntity<OrdemServicoDetalheResponse> lancarPeca(UUID id, PecaOrdemServicoRequest request);

    @Operation(summary = "Alterar peça")
    ResponseEntity<OrdemServicoDetalheResponse> alterarPeca(UUID id, UUID idPeca, PecaOrdemServicoRequest request);

    @Operation(summary = "Excluir peça")
    ResponseEntity<OrdemServicoDetalheResponse> excluirPeca(UUID id, UUID idPeca);
}
