package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.AbastecimentoAppResponse;
import com.nexo.app.modules.frota.application.dto.CancelarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.CatalogoAbastecimentoAppResponse;
import com.nexo.app.modules.frota.application.dto.RealizarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.SolicitarAbastecimentoRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Abastecimento no app", description = "Pedido, fotos, cancelamento e realizado pelo app de campo")
public interface AbastecimentoAppFrotaControllerDoc {

    @Operation(summary = "Catálogo do abastecimento", description = "Postos, produtos e o combustível preferido de cada veículo.")
    ResponseEntity<CatalogoAbastecimentoAppResponse> catalogo();

    @Operation(summary = "Abastecimentos do usuário e da equipe", description = "Últimos 15 dias, do mais recente para o mais antigo.")
    ResponseEntity<List<AbastecimentoAppResponse>> meus();

    @Operation(summary = "Pedir abastecimento",
            description = "Exige checklist do dia, CNH em dia (ou liberação do gestor) e nenhum outro em andamento no veículo. "
                    + "Reenviar o mesmo id do aparelho devolve o pedido já gravado.")
    ResponseEntity<AbastecimentoAppResponse> solicitar(SolicitarAbastecimentoRequest request);

    @Operation(summary = "Enviar foto", description = "Foto esperada pelo pedido ou pelo realizado. Reenviar não duplica.")
    ResponseEntity<AbastecimentoAppResponse> enviarFoto(UUID idAparelho, UUID idFoto, MultipartFile arquivo);

    @Operation(summary = "Baixar foto", description = "Foto do pedido para o detalhe do app: quem pediu, a equipe ou quem libera.")
    ResponseEntity<Resource> foto(UUID idAparelho, UUID idFoto);

    @Operation(summary = "Cancelar", description = "Antes da liberação, quem pediu ou a equipe; depois, só quem libera, com motivo.")
    ResponseEntity<AbastecimentoAppResponse> cancelar(UUID idAparelho, CancelarAbastecimentoRequest request);

    @Operation(summary = "Registrar o realizado",
            description = "Itens entregues, KM ou horas e fotos do painel e do cupom. Grava a leitura com origem ABASTECIMENTO.")
    ResponseEntity<AbastecimentoAppResponse> realizar(UUID idAparelho, RealizarAbastecimentoRequest request);
}
