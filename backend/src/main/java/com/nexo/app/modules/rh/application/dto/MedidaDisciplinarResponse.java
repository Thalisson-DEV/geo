package com.nexo.app.modules.rh.application.dto;

import com.nexo.app.modules.rh.domain.OrigemMedidaDisciplinar;
import com.nexo.app.modules.rh.domain.SituacaoMedidaDisciplinar;
import com.nexo.app.modules.rh.domain.TipoEventoMedidaDisciplinar;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Schema(description = "Medida disciplinar. Na listagem, histórico e anexos vêm vazios.")
public record MedidaDisciplinarResponse(
        UUID id,
        UUID idColaborador,
        String colaboradorNome,
        String colaboradorFuncao,
        UUID idBaseOperacional,
        String baseNome,
        UUID idTipo,
        String tipoNome,
        int gravidade,
        boolean exigePeriodo,
        UUID idMotivo,
        String motivoNome,
        LocalDate dataFato,
        LocalDate dataAplicacao,
        String descricao,
        Integer diasSuspensao,
        LocalDate inicioSuspensao,
        LocalDate fimSuspensao,
        SituacaoMedidaDisciplinar situacao,
        String situacaoRotulo,
        String aplicadaPorNome,
        OffsetDateTime aplicadaEm,
        OrigemMedidaDisciplinar origem,
        String origemRotulo,
        UUID idOrigem,
        String idExterno,
        OffsetDateTime canceladaEm,
        String justificativaCancelamento,
        @Schema(description = "Dias entre o fato e a aplicação") long diasDesdeOFato,
        @Schema(description = "Passou do prazo de imediatidade dos parâmetros") boolean foraDaImediatidade,
        int quantidadeAnexos,
        List<Anexo> anexos,
        List<Evento> historico,
        OffsetDateTime dataCriacao
) {
    public record Anexo(UUID id, String nome, String contentType, Long tamanhoBytes, String sha256, OffsetDateTime enviadoEm) {
    }

    public record Evento(TipoEventoMedidaDisciplinar tipo, String tipoRotulo, String descricao, String usuarioNome,
                         OffsetDateTime ocorridoEm) {
    }
}
