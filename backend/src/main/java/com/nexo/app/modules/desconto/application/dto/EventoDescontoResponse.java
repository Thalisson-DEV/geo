package com.nexo.app.modules.desconto.application.dto;

import com.nexo.app.modules.desconto.domain.StatusDesconto;
import com.nexo.app.modules.desconto.domain.TipoEventoDesconto;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Schema(description = "Ponto da linha do tempo de um desconto")
public record EventoDescontoResponse(
        UUID id,
        TipoEventoDesconto tipo,
        @Schema(description = "Texto de exibição do tipo", example = "Decisão desfeita")
        String rotulo,
        StatusDesconto statusAnterior,
        StatusDesconto statusNovo,
        @Schema(description = "Nome de quem fez, já resolvido pelo colaborador vinculado")
        String usuario,
        BigDecimal valor,
        @Schema(description = "Motivo, descrição do item, nome do arquivo ou o que mudou")
        String texto,
        UUID idAnexo,
        OffsetDateTime ocorridoEm
) {}
