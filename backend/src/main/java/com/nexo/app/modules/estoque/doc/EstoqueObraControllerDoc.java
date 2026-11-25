package com.nexo.app.modules.estoque.doc;

import com.nexo.app.modules.estoque.application.dto.EstoqueObraRequests;
import com.nexo.app.modules.estoque.application.dto.EstoqueObraResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Tag(name = "Estoque por obra", description = "Material de cada obra em caminhões e canteiros, devolução de sobra, canteiros e remanejamento")
@SecurityRequirement(name = "bearerAuth")
public interface EstoqueObraControllerDoc {

    @Operation(summary = "Baixar apontamentos antigos de material", description = "Baixa do caminhão os apontamentos de "
            + "material feitos antes do estoque por obra. Idempotente.")
    ResponseEntity<Map<String, Integer>> reprocessarApontamentos();

    @Operation(summary = "Material da obra", description = "Por material: previsto, entregue, aplicado, com equipes e "
            + "canteiros (e onde), devolvido, retirado, de/para outras obras; e o rastro entre obras.")
    ResponseEntity<EstoqueObraResponses.MaterialDaObra> materialDaObra(UUID idObra);

    @Operation(summary = "Saldo de um caminhão ou canteiro separado por obra")
    ResponseEntity<EstoqueObraResponses.SaldoPorObra> saldoPorObra(UUID idEstoque);

    @Operation(summary = "Caminhão da equipe separado por obra")
    ResponseEntity<EstoqueObraResponses.SaldoPorObra> caminhaoDaEquipe(UUID idEquipe);

    @Operation(summary = "Devolver sobra ao almoxarifado", description = "Material de uma obra que sobrou no caminhão ou no "
            + "canteiro volta livre ao almoxarifado; o movimento guarda a obra.")
    ResponseEntity<Map<String, UUID>> devolverSobra(EstoqueObraRequests.DevolverSobra request);

    @Operation(summary = "Remanejar material entre obras", description = "Muda a obra do material no mesmo local, com motivo.")
    ResponseEntity<Map<String, UUID>> remanejar(EstoqueObraRequests.Remanejar request);

    @Operation(summary = "Listar canteiros")
    ResponseEntity<List<EstoqueObraResponses.Canteiro>> listarCanteiros(boolean incluirInativos);

    @Operation(summary = "Cadastrar canteiro")
    ResponseEntity<EstoqueObraResponses.Canteiro> criarCanteiro(EstoqueObraRequests.Canteiro request);

    @Operation(summary = "Editar canteiro")
    ResponseEntity<EstoqueObraResponses.Canteiro> editarCanteiro(UUID id, EstoqueObraRequests.Canteiro request);

    @Operation(summary = "Desativar canteiro vazio")
    ResponseEntity<Void> desativarCanteiro(UUID id);

    @Operation(summary = "Deixar ou pegar material no canteiro", description = "A equipe deixa material no canteiro ou pega "
            + "dele; a obra de cada material vai junto.")
    ResponseEntity<Map<String, UUID>> movimentarCanteiro(UUID id, EstoqueObraRequests.MovimentarCanteiro request);
}
