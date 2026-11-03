package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.AbastecimentoResumoResponse;
import com.nexo.app.modules.frota.application.dto.AprovacaoAbastecimentoAppResponse;
import com.nexo.app.modules.frota.application.dto.AprovarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.JustificativaRequest;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimento;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Aprovação de abastecimento no app", description = "Fila e decisão do gestor pelo celular")
public interface AprovacaoAbastecimentoAppFrotaControllerDoc {

    @Operation(summary = "Fila para aprovar", description = "Aguardando aprovação nas placas da sua carteira, do mais antigo.")
    ResponseEntity<List<AbastecimentoResumoResponse>> fila();

    @Operation(summary = "Pedidos da carteira", description = "Todos os pedidos das placas da sua carteira, de qualquer"
            + " situação, para acompanhar a aprovação, a liberação e o abastecimento. Filtra por situação, placa e período.")
    ResponseEntity<PageResponse<AbastecimentoResumoResponse>> carteira(List<SituacaoAbastecimento> situacao, String busca,
                                                                    LocalDate de, LocalDate ate, Pageable pageable);

    @Operation(summary = "Pedido para decidir", description = "Pedido completo, alertas e a última análise do Assistente.")
    ResponseEntity<AprovacaoAbastecimentoAppResponse> detalhar(UUID id);

    @Operation(summary = "Aprovar com quantidades", description = "Quantidade de cada item; zero tira o item. Vale até o fim do dia.")
    ResponseEntity<AprovacaoAbastecimentoAppResponse> aprovar(UUID id, AprovarAbastecimentoRequest request);

    @Operation(summary = "Reprovar", description = "Com motivo; a equipe pode pedir de novo.")
    ResponseEntity<AprovacaoAbastecimentoAppResponse> reprovar(UUID id, JustificativaRequest request);

    @Operation(summary = "Foto do pedido", description = "Painel ou cupom, para quem tem a placa na carteira.")
    ResponseEntity<Resource> foto(UUID id, UUID idFoto);
}
