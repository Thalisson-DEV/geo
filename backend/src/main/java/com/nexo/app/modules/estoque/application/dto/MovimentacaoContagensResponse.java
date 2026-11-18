package com.nexo.app.modules.estoque.application.dto;

import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque.TipoMovimentacao;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.Map;

@Schema(description = "Quantidade de operações do recorte")
public record MovimentacaoContagensResponse(
    @Schema(description = "Operações do recorte; não é a soma dos tipos, porque uma nota pode aplicar e retirar")
    long total,
    Map<TipoMovimentacao, Long> porTipo
) {}
