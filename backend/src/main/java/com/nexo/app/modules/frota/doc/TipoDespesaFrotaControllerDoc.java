package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.TipoDespesaRequest;
import com.nexo.app.modules.frota.application.dto.TipoDespesaResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Tipos de despesa", description = "Catálogo de tipos e subtipos das despesas por veículo")
public interface TipoDespesaFrotaControllerDoc {

    @Operation(summary = "Listar tipos", description = "Com os subtipos ativos; apenasAtivos=false traz também os desativados.")
    ResponseEntity<List<TipoDespesaResponse>> listar(boolean apenasAtivos);

    @Operation(summary = "Criar tipo")
    ResponseEntity<TipoDespesaResponse> criar(TipoDespesaRequest request);

    @Operation(summary = "Editar tipo", description = "Os subtipos que continuam mantêm o id; os que saem são desativados.")
    ResponseEntity<TipoDespesaResponse> atualizar(UUID id, TipoDespesaRequest request);

    @Operation(summary = "Desativar tipo")
    ResponseEntity<Void> desativar(UUID id);

    @Operation(summary = "Reativar tipo")
    ResponseEntity<Void> ativar(UUID id);
}
