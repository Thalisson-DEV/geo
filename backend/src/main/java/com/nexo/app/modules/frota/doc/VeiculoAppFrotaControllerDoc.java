package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.SituacaoVeiculoAppResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

@Tag(name = "Frota — Veículo no app", description = "Consulta da situação do veículo pelo app de campo")
public interface VeiculoAppFrotaControllerDoc {

    @Operation(summary = "Situação do veículo",
            description = "Situação operacional, medição atual, OS abertas e as últimas concluídas, problemas de checklist "
                    + "ainda sem solução e documentos com vencimento.")
    ResponseEntity<SituacaoVeiculoAppResponse> situacao(UUID idVeiculo);

    @Operation(summary = "Arquivo de um documento do veículo",
            description = "CRLV, tacógrafo, laudo e demais documentos do veículo ou de um implemento acoplado a ele, "
                    + "para o app guardar e mostrar na fiscalização sem sinal.")
    ResponseEntity<org.springframework.core.io.Resource> arquivoDocumento(UUID idVeiculo, UUID idDocumento);
}
