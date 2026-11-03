package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.AptidaoConducaoResponse;
import com.nexo.app.modules.frota.application.dto.LiberacaoCnhRequest;
import com.nexo.app.modules.frota.application.dto.LiberacaoCnhResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.time.LocalDate;
import java.util.UUID;

@Tag(name = "Frota — Liberação de CNH", description = "Situação da CNH para conduzir e liberação do gestor para o dia")
public interface LiberacaoCnhFrotaControllerDoc {

    @Operation(summary = "Situação da CNH para conduzir o veículo",
            description = "Apto, sem CNH, vencida ou de categoria insuficiente, e a liberação do dia se houver. Dia vazio = hoje.")
    ResponseEntity<AptidaoConducaoResponse> aptidao(UUID idColaborador, UUID idVeiculo, LocalDate dia);

    @Operation(summary = "Liberar condutor", description = "Vale só para o condutor, o veículo e o dia, com a justificativa registrada.")
    ResponseEntity<LiberacaoCnhResponse> liberar(LiberacaoCnhRequest request);

    @Operation(summary = "Listar liberações", description = "Mais recentes primeiro.")
    ResponseEntity<PageResponse<LiberacaoCnhResponse>> listar(Pageable pageable);
}
