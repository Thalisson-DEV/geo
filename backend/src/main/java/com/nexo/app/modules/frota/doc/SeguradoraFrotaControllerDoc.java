package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.SeguradoraFrotaRequest;
import com.nexo.app.modules.frota.application.dto.SeguradoraFrotaResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Seguradoras", description = "Seguradoras e corretoras das apólices, ligadas aos fornecedores do financeiro")
public interface SeguradoraFrotaControllerDoc {

    @Operation(summary = "Listar seguradoras e corretoras", description = "Ativas primeiro, pelo nome, com as apólices em vigor de cada uma.")
    ResponseEntity<List<SeguradoraFrotaResponse>> listar();

    @Operation(summary = "Cadastrar seguradora ou corretora", description = "O fornecedor precisa existir no financeiro; um cadastro por fornecedor e papel.")
    ResponseEntity<SeguradoraFrotaResponse> criar(SeguradoraFrotaRequest request);

    @Operation(summary = "Alterar seguradora ou corretora")
    ResponseEntity<SeguradoraFrotaResponse> atualizar(UUID id, SeguradoraFrotaRequest request);

    @Operation(summary = "Desativar", description = "Sai das opções de novas apólices; as apólices que já a usam continuam com ela.")
    ResponseEntity<Void> desativar(UUID id);

    @Operation(summary = "Reativar")
    ResponseEntity<Void> ativar(UUID id);
}
