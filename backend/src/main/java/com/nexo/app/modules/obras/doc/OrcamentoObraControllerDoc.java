package com.nexo.app.modules.obras.doc;

import com.nexo.app.modules.obras.application.dto.AlterarItemOrcamentoObraRequest;
import com.nexo.app.modules.obras.application.dto.GerarOrcamentoObraRequest;
import com.nexo.app.modules.obras.application.dto.ItemOrcamentoObraRequest;
import com.nexo.app.modules.obras.application.dto.OrcamentoObraResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.UUID;

@Tag(name = "Obras - Orçamento", description = "Orçamento da obra (serviços e materiais) com revisões e comparação com planejado, executado e medido")
@SecurityRequirement(name = "bearerAuth")
public interface OrcamentoObraControllerDoc {

    @Operation(summary = "Orçamento da obra comparado com o planejado, o executado e o medido",
            description = "Uma linha por código, tipo e operação, com a situação (dentro, acima, fora do orçamento, não planejado).")
    ResponseEntity<OrcamentoObraResponse> buscar(UUID id);

    @Operation(summary = "Revisões do orçamento, da mais recente para a mais antiga")
    ResponseEntity<List<OrcamentoObraResponse.Revisao>> listarRevisoes(UUID id);

    @Operation(summary = "Lançar um serviço ou material no orçamento atual",
            description = "Sem valor unitário, o serviço usa o valor vigente do contrato da obra. Sem orçamento, abre a revisão 1.")
    ResponseEntity<OrcamentoObraResponse> adicionarItem(UUID id, ItemOrcamentoObraRequest request);

    @Operation(summary = "Alterar operação, quantidade ou valor unitário de um item do orçamento atual")
    ResponseEntity<OrcamentoObraResponse> alterarItem(UUID id, UUID idItem, AlterarItemOrcamentoObraRequest request);

    @Operation(summary = "Tirar um item do orçamento atual")
    ResponseEntity<OrcamentoObraResponse> removerItem(UUID id, UUID idItem);

    @Operation(summary = "Gerar uma revisão nova do orçamento a partir do planejamento dos pontos",
            description = "Serviços com o valor vigente do contrato; materiais só com a quantidade. A revisão anterior fica no histórico.")
    ResponseEntity<OrcamentoObraResponse> gerarDoPlanejamento(UUID id, GerarOrcamentoObraRequest request);
}
