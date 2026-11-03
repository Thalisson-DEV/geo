package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.AbastecimentoAvulsoRequest;
import com.nexo.app.modules.frota.application.dto.AbastecimentoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.AprovarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.AbastecimentoFilter;
import com.nexo.app.modules.frota.application.dto.AbastecimentoResumoResponse;
import com.nexo.app.modules.frota.application.dto.CancelarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.JustificativaRequest;
import com.nexo.app.modules.frota.application.dto.LiberarAbastecimentoRequest;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

@Tag(name = "Frota — Abastecimentos", description = "Filas de aprovação e de liberação, detalhe e aviso ao posto")
public interface AbastecimentoFrotaControllerDoc {

    @Operation(summary = "Listar abastecimentos",
            description = "fila=APROVAR: aguardando aprovação nas placas da sua carteira; fila=LIBERAR: aprovados à espera da liberação.")
    ResponseEntity<PageResponse<AbastecimentoResumoResponse>> listar(AbastecimentoFilter filtro, Pageable pageable);

    @Operation(summary = "Detalhar abastecimento", description = "Itens, fotos, alertas, avisos ao posto e o que você pode fazer.")
    ResponseEntity<AbastecimentoDetalheResponse> detalhar(UUID id);

    @Operation(summary = "Aprovar", description = "Só quem tem a placa na carteira, com a quantidade de cada item (a equipe pede só"
            + " o produto e o destino). Zero tira o item. A aprovação vale até o fim do dia.")
    ResponseEntity<AbastecimentoDetalheResponse> aprovar(UUID id, AprovarAbastecimentoRequest request);

    @Operation(summary = "Lançar abastecimento avulso",
            description = "Feito na web por quem tem a placa na carteira, como a solicitação direta do comercial: já nasce aprovado"
                    + " e vai para a liberação. Sem foto do painel; KM opcional (com trava). A CNH bloqueia como no pedido do app.")
    ResponseEntity<AbastecimentoDetalheResponse> lancarAvulso(AbastecimentoAvulsoRequest request);

    @Operation(summary = "Reprovar", description = "Com motivo; a equipe pode pedir de novo.")
    ResponseEntity<AbastecimentoDetalheResponse> reprovar(UUID id, JustificativaRequest request);

    @Operation(summary = "Liberar", description = "Pode trocar o posto e ajustar quantidades. Gera a mensagem e o atalho do WhatsApp do posto.")
    ResponseEntity<AbastecimentoDetalheResponse> liberar(UUID id, LiberarAbastecimentoRequest request);

    @Operation(summary = "Cancelar", description = "Por quem libera. Depois da liberação exige motivo e gera o aviso de cancelamento ao posto.")
    ResponseEntity<AbastecimentoDetalheResponse> cancelar(UUID id, CancelarAbastecimentoRequest request);

    @Operation(summary = "Aviso ao posto aberto", description = "Registra que o atalho do WhatsApp foi usado.")
    ResponseEntity<AbastecimentoDetalheResponse> marcarAvisoAberto(UUID id, UUID idAviso);

    @Operation(summary = "Foto do abastecimento")
    ResponseEntity<Resource> foto(UUID id, UUID idFoto);
}
