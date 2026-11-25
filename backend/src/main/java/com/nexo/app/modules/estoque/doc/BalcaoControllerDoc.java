package com.nexo.app.modules.estoque.doc;

import com.nexo.app.modules.estoque.application.dto.BalcaoRequests;
import com.nexo.app.modules.estoque.application.dto.BalcaoResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Tag(name = "Balcão do almoxarifado", description = "Retirada e devolução diária das equipes, estoque das equipes e regras do almoxarifado")
@SecurityRequirement(name = "bearerAuth")
public interface BalcaoControllerDoc {

    @Operation(summary = "Fila do dia no balcão", description = "Equipes com retirada até a data neste almoxarifado (atrasadas "
            + "primeiro) e equipes que costumam devolver aqui, com o resumo do caminhão; e os atendimentos de hoje.")
    ResponseEntity<BalcaoResponses.Painel> painel(UUID idAlmoxarifado, LocalDate data);

    @Operation(summary = "Atender uma equipe", description = "O que a equipe tem a retirar (por obra) e o que está no caminhão "
            + "(por obra, livre por último), com as pessoas da equipe e as regras do balcão.")
    ResponseEntity<BalcaoResponses.Atendimento> atendimento(UUID idEquipe, UUID idAlmoxarifado, LocalDate data);

    @Operation(summary = "Registrar retirada", description = "Entrega de uma vez o material das solicitações informadas, com "
            + "matrícula, assinatura e foto de quem retira. Pode entregar acima do pedido (excedente registrado) quando as "
            + "regras permitem. Tudo ou nada.")
    ResponseEntity<BalcaoResponses.AtendimentoResumo> registrarRetirada(UUID idEquipe, BalcaoRequests.RegistrarRetirada request);

    @Operation(summary = "Registrar devolução", description = "Material que sobrou no caminhão (novo ou sucata, de qualquer obra) "
            + "volta ao almoxarifado ou é descartado. Tudo ou nada.")
    ResponseEntity<BalcaoResponses.AtendimentoResumo> registrarDevolucao(UUID idEquipe, BalcaoRequests.RegistrarDevolucao request);

    @Operation(summary = "Detalhe de um atendimento (termo)")
    ResponseEntity<BalcaoResponses.AtendimentoResumo> buscarAtendimento(UUID id);

    @Operation(summary = "Assinatura ou foto de um atendimento", description = "parte = assinatura | foto")
    ResponseEntity<Resource> comprovante(UUID id, String parte);

    @Operation(summary = "Estoque das equipes", description = "Cada equipe com o que tem no caminhão (obras, sucata, negativos) "
            + "e o que tem a retirar até a data.")
    ResponseEntity<List<BalcaoResponses.EquipeNoBalcao>> estoqueDasEquipes(LocalDate data);

    @Operation(summary = "Caminhão da equipe por obra")
    ResponseEntity<List<BalcaoResponses.GrupoCaminhao>> caminhaoPorObra(UUID idEquipe);

    @Operation(summary = "Inventário dos caminhões", description = "Tudo o que está nos caminhões das equipes, por equipe, obra e "
            + "material (saldo negativo vem com quantidade negativa).")
    ResponseEntity<List<BalcaoResponses.ItemNasEquipes>> itensDasEquipes();

    @Operation(summary = "Regras do almoxarifado")
    ResponseEntity<BalcaoResponses.Parametros> parametros();

    @Operation(summary = "Alterar regras do almoxarifado")
    ResponseEntity<BalcaoResponses.Parametros> atualizarParametros(BalcaoRequests.Parametros request);
}
