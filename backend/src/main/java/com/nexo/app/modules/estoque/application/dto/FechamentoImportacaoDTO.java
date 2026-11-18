package com.nexo.app.modules.estoque.application.dto;

import com.nexo.app.shared.application.dto.ImportacaoStatus;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

/** Linha da planilha de fechamento: o servidor resolve obra, almoxarifado e material pelo texto a cada validação. */
@Schema(description = "Linha da importação de solicitações de encerramento")
public record FechamentoImportacaoDTO(
        @Schema(description = "Linha no arquivo original", example = "2") Integer linha,
        @Schema(description = "Número da obra", example = "OBRA-1001") String numeroObra,
        @Schema(description = "Título da obra, preenchido na validação") String tituloObra,
        @Schema(description = "Almoxarifado de atendimento", example = "ALMOX CENTRAL") String almoxarifado,
        @Schema(description = "221, 921, 222 ou 922", example = "221") String tipo,
        @Schema(description = "Código do material", example = "MAT-001") String codigoMaterial,
        @Schema(description = "Descrição do material, preenchida na validação") String nomeMaterial,
        @Schema(description = "Quantidade, até 3 casas decimais", example = "10.500") BigDecimal quantidade,
        @Schema(description = "Número da reserva SAP (opcional)") String numeroReserva,
        @Schema(description = "Data da reserva, AAAA-MM-DD ou DD/MM/AAAA (opcional)") String dataReserva,
        @Schema(description = "Observação da solicitação (opcional)") String observacao,
        @Schema(description = "Situação da linha") ImportacaoStatus status,
        @Schema(description = "Primeiro campo com erro") String campoErro,
        @Schema(description = "Erro ou aviso da linha") String mensagemErro
) {
    public FechamentoImportacaoDTO validado(
            String titulo, String material, String data, ImportacaoStatus novoStatus, String campo, String mensagem) {
        return new FechamentoImportacaoDTO(linha, numeroObra, titulo, almoxarifado, tipo, codigoMaterial, material,
                quantidade, numeroReserva, data, observacao, novoStatus, campo, mensagem);
    }

    public FechamentoImportacaoDTO comResultado(ImportacaoStatus novoStatus, String campo, String mensagem) {
        return validado(tituloObra, nomeMaterial, dataReserva, novoStatus, campo, mensagem);
    }
}
