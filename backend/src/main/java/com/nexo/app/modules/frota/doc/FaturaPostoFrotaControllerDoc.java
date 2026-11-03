package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.ConferenciaFaturaResponse;
import com.nexo.app.modules.frota.application.dto.ConferirFaturaRequest;
import com.nexo.app.modules.frota.application.dto.FaturaPostoRequest;
import com.nexo.app.modules.frota.application.dto.FaturaPostoResponse;
import com.nexo.app.modules.frota.application.dto.PreenchimentoFinanceiroResponse;
import com.nexo.app.modules.frota.domain.FaturaPosto;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

@Tag(name = "Frota — Faturas do posto", description = "Lançamento, conferência e envio ao financeiro")
public interface FaturaPostoFrotaControllerDoc {

    @Operation(summary = "Listar faturas")
    ResponseEntity<PageResponse<FaturaPostoResponse>> listar(UUID idPosto, FaturaPosto.Situacao situacao, Pageable pageable);

    @Operation(summary = "Lançar fatura")
    ResponseEntity<FaturaPostoResponse> criar(FaturaPostoRequest request);

    @Operation(summary = "Corrigir fatura", description = "Volta para conferência; não muda depois de enviada ao financeiro.")
    ResponseEntity<FaturaPostoResponse> atualizar(UUID id, FaturaPostoRequest request);

    @Operation(summary = "Conferência", description = "Abastecimentos realizados no posto no período, livres ou já nesta fatura.")
    ResponseEntity<ConferenciaFaturaResponse> conferencia(UUID id);

    @Operation(summary = "Conferir", description = "Liga os abastecimentos escolhidos à fatura; cada um fica em uma fatura só.")
    ResponseEntity<FaturaPostoResponse> conferir(UUID id, ConferirFaturaRequest request);

    @Operation(summary = "Preenchimento do pagamento",
            description = "Valores para o formulário de pagamento do financeiro; a solicitação criada com origem FROTA_FATURA_POSTO "
                    + "marca a fatura como enviada.")
    ResponseEntity<PreenchimentoFinanceiroResponse> preenchimentoFinanceiro(UUID id);
}
