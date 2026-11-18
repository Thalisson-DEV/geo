package com.nexo.app.modules.estoque.doc;

import com.nexo.app.modules.estoque.application.dto.ConciliarSerieAplicadaRequest;
import com.nexo.app.modules.estoque.application.dto.SeriesAConferirResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

@Tag(name = "Saldos", description = "Conferência de séries aplicadas fora do saldo da equipe")
@SecurityRequirement(name = "bearerAuth")
public interface SeriesAConferirControllerDoc {

    @Operation(summary = "Séries a conferir no estoque da equipe",
               description = "Materiais seriados com mais séries no caminhão do que saldo, com as séries que a " +
                             "equipe aplicou sem que tivessem entrado no estoque dela e uma sugestão da série " +
                             "do caminhão mais parecida.")
    ResponseEntity<SeriesAConferirResponse> listar(UUID idEstoque);

    @Operation(summary = "Conciliar uma série aplicada fora do saldo",
               description = "Informe a série do caminhão que era a aplicada (ela sai da equipe; a quantidade não muda) " +
                             "ou deixe vazio quando nenhuma corresponde. Devolve a lista atualizada.")
    ResponseEntity<SeriesAConferirResponse> conciliar(UUID idEstoque, ConciliarSerieAplicadaRequest request);
}
