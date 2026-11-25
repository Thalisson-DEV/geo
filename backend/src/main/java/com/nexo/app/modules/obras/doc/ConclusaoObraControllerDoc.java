package com.nexo.app.modules.obras.doc;

import com.nexo.app.modules.obras.application.dto.ConclusaoObraResponse;
import com.nexo.app.modules.obras.application.dto.ResolverOcorrenciaRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

@Tag(name = "Obras - Conclusão", description = "O que falta para a obra concluir e a decisão sobre as ocorrências que seguram a conclusão")
@SecurityRequirement(name = "bearerAuth")
public interface ConclusaoObraControllerDoc {

    @Operation(summary = "O que falta para concluir", description = "Serviços em aberto, fotos obrigatórias que faltam (modelo que trava) "
            + "e ocorrências de alteração de projeto ou obra já executada por terceiros ainda sem decisão.")
    ResponseEntity<ConclusaoObraResponse> consultar(UUID idObra);

    @Operation(summary = "Resolver ocorrência", description = "Registra o que o escritório decidiu; sem mais pendências, a obra conclui.")
    ResponseEntity<ConclusaoObraResponse> resolver(UUID idObra, UUID idOcorrencia, ResolverOcorrenciaRequest request);
}
