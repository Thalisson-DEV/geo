package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.AnaliseIaResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

@Tag(name = "Frota — Análise da IA", description = "Parecer da IA e leitura das fotos nos relatórios de OS, checklist e abastecimento")
public interface AnaliseIaFrotaControllerDoc {

    @Operation(summary = "Última análise da OS", description = "Diz se a IA está ligada e devolve a análise mais recente, se houver.")
    ResponseEntity<AnaliseIaResponse.Estado> estadoOrdemServico(UUID id);

    @Operation(summary = "Analisar a OS", description = "Lê as fotos do checklist de origem e as notas fiscais em imagem. Só aponta.")
    ResponseEntity<AnaliseIaResponse> analisarOrdemServico(UUID id);

    @Operation(summary = "Última análise do checklist")
    ResponseEntity<AnaliseIaResponse.Estado> estadoChecklist(UUID id);

    @Operation(summary = "Analisar o checklist", description = "Confere as fotos dos itens Não OK e do recebimento. Só aponta.")
    ResponseEntity<AnaliseIaResponse> analisarChecklist(UUID id);

    @Operation(summary = "Última análise do abastecimento")
    ResponseEntity<AnaliseIaResponse.Estado> estadoAbastecimento(UUID id);

    @Operation(summary = "Analisar o abastecimento", description = "Lê painel e cupom e compara com o informado. Só aponta.")
    ResponseEntity<AnaliseIaResponse> analisarAbastecimento(UUID id);
}
