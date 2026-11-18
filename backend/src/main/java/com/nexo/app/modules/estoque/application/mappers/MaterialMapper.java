package com.nexo.app.modules.estoque.application.mappers;

import com.nexo.app.modules.estoque.MaterialResponse;
import com.nexo.app.modules.estoque.UnidadeEquivalenteResponse;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.rh.ProcessoNegocioApi;
import com.nexo.app.modules.rh.ProcessoNegocioResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.MathContext;
import java.util.List;

@Component
@RequiredArgsConstructor
public class MaterialMapper {

    private final AvaliacaoMaterialMapper avaliacaoMapper;
    private final CentroInvestimentoMapper centroInvestimentoMapper;
    private final ProcessoNegocioApi processoApi;

    public MaterialResponse toResponse(Material entity) {
        if (entity == null) {
            return null;
        }
        ProcessoNegocioResponse processo = processoApi.buscarPorIdResponse(entity.getIdProcesso())
                .orElse(null);
        return toResponse(entity, processo);
    }

    public MaterialResponse toResponse(Material entity, ProcessoNegocioResponse processo) {
        if (entity == null) {
            return null;
        }
        return new MaterialResponse(
                entity.getId(),
                entity.getCodigo(),
                entity.getDescricao(),
                entity.getUnidadeMedida(),
                entity.getSuprMatrFlag(),
                processo,
                avaliacaoMapper.toResponse(entity.getAvaliacaoTecnica()),
                centroInvestimentoMapper.toResponse(entity.getCentroInvestimento()),
                entity.isDetalhaSerie(),
                entity.isAtivo(),
                equivalencias(entity)
        );
    }

    private static List<UnidadeEquivalenteResponse> equivalencias(Material entity) {
        return entity.getEquivalencias().stream()
                .map(e -> new UnidadeEquivalenteResponse(
                        e.getUnidade(), e.getQuantidadeUnidade(), e.getQuantidadeBase(),
                        e.getQuantidadeBase().divide(e.getQuantidadeUnidade(), MathContext.DECIMAL64).stripTrailingZeros()))
                .toList();
    }
}
