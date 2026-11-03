package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.FinalidadeChecklist;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Checklist preenchido no app. O {@code idAparelho} é gerado no celular: reenviar o mesmo
 * checklist devolve o já gravado. As fotos vão depois, uma a uma, pelos ids informados aqui.
 */
public record RegistrarChecklistRequest(
        @NotNull(message = "Informe o identificador do checklist.") UUID idAparelho,
        @NotNull(message = "Informe o veículo.") UUID idVeiculo,
        @NotNull(message = "Informe o modelo do checklist.") UUID idModelo,
        @Size(max = 10) List<UUID> idsModelosAdicionais,
        /** Nula vale como uso. Recebimento e devolução vão sem condutor. */
        FinalidadeChecklist finalidade,
        UUID idCondutor,
        @NotNull(message = "Informe a data e hora do checklist.") OffsetDateTime preenchidoEm,
        @NotNull(message = "Informe a medição do painel.") @PositiveOrZero Long medicao,
        @Size(max = 2000) String comentario,
        Boolean assinado,
        @Size(max = 300) List<@Valid Resposta> respostas,
        @Size(max = 20) List<@Valid FotoRecebimento> fotosRecebimento
) {

    public record Resposta(
            @NotNull UUID idPergunta,
            Boolean conforme,
            UUID idAlternativa,
            @Size(max = 500) String texto,
            @Size(max = 1000) String comentario,
            @Size(max = 10) List<UUID> idsFotos
    ) {
    }

    public record FotoRecebimento(@NotNull UUID idFotoRecebimento, @NotNull UUID idFoto) {
    }
}
