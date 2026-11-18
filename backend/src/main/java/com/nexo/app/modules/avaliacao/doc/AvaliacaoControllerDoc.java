package com.nexo.app.modules.avaliacao.doc;

import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.CampanhaRequest;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.CampanhaResponse;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.ConviteResponse;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.Origem;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.RespostaItem;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.RespostaRequest;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.ResumoResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.UUID;

@Tag(name = "Avaliação do aplicativo", description = "Pesquisa temporária de satisfação no web e no app de campo")
@SecurityRequirement(name = "bearerAuth")
public interface AvaliacaoControllerDoc {

    @Operation(summary = "Convite da pesquisa aberta para o usuário logado",
            description = "204 quando não há pesquisa no ar. 'convidar' diz se o convite deve aparecer agora; "
                    + "a decisão vale para todos os aparelhos do usuário.")
    ResponseEntity<ConviteResponse> convite();

    @Operation(summary = "Enviar a avaliação",
            description = "Uma por usuário e pesquisa. Com 'anonima', o usuário não é gravado junto da resposta.")
    ResponseEntity<Void> responder(UUID campanhaId, RespostaRequest request);

    @Operation(summary = "Responder depois", description = "Esconde o convite por 3 dias, em todos os aparelhos.")
    ResponseEntity<Void> adiar(UUID campanhaId);

    @Operation(summary = "Não quero responder", description = "O convite não volta nesta pesquisa.")
    ResponseEntity<Void> recusar(UUID campanhaId);

    @Operation(summary = "Listar pesquisas de avaliação")
    ResponseEntity<List<CampanhaResponse>> listarCampanhas();

    @Operation(summary = "Abrir uma pesquisa de avaliação")
    ResponseEntity<CampanhaResponse> abrirCampanha(CampanhaRequest request);

    @Operation(summary = "Encerrar uma pesquisa de avaliação antes do fim previsto")
    ResponseEntity<CampanhaResponse> encerrarCampanha(UUID id);

    @Operation(summary = "Números da pesquisa", description = "Filtro opcional por origem (WEB ou CAMPO).")
    ResponseEntity<ResumoResponse> resumo(UUID id, Origem origem);

    @Operation(summary = "Respostas da pesquisa", description = "Autor nulo indica resposta anônima.")
    ResponseEntity<List<RespostaItem>> respostas(UUID id, Origem origem);
}
