package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.modules.obras.domain.ClasseTensao;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Kit com valor em R$ calculado na {@code dataReferenciaValor}. {@code valor} soma os serviços (quantidade × valor vigente
 * das ações); {@code valorMateriais} soma os materiais orçados no kit; {@code valorTotal} é o custo do kit (os dois).
 * {@code servicosSemValor} e {@code materiaisSemValor} contam os itens sem valor, que ficam fora das somas.
 */
public record KitConstrutivoResponse(
        UUID id,
        UUID idContrato,
        String numeroContrato,
        String codigo,
        String descricao,
        String grupo,
        Set<ClasseTensao> classesTensao,
        int quantidadeItens,
        int quantidadeServicos,
        int quantidadeMateriais,
        BigDecimal valor,
        int servicosSemValor,
        LocalDate dataReferenciaValor,
        List<ItemKitResponse> itens,
        boolean ativo,
        Long versao,
        OffsetDateTime dataCriacao,
        OffsetDateTime dataUltimaAlteracao,
        BigDecimal valorMateriais,
        int materiaisSemValor,
        BigDecimal valorTotal
) {
}
