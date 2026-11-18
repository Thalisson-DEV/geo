package com.nexo.app.modules.estoque;

import com.nexo.app.modules.rh.ProcessoNegocioResponse;

import java.util.List;
import java.util.UUID;

public record MaterialResponse(
    UUID id,
    String codigo,
    String descricao,
    String unidadeMedida,
    String suprMatrFlag,
    ProcessoNegocioResponse processo,
    AvaliacaoMaterialResponse avaliacaoTecnica,
    CentroInvestimentoResponse centroInvestimento,
    boolean detalhaSerie,
    boolean ativo,
    /** Outras unidades em que a quantidade pode ser informada; o saldo segue em unidadeMedida. */
    List<UnidadeEquivalenteResponse> equivalencias
) {
    /** Contrato anterior, sem as unidades equivalentes. */
    public MaterialResponse(UUID id, String codigo, String descricao, String unidadeMedida, String suprMatrFlag,
                            ProcessoNegocioResponse processo, AvaliacaoMaterialResponse avaliacaoTecnica,
                            CentroInvestimentoResponse centroInvestimento, boolean detalhaSerie, boolean ativo) {
        this(id, codigo, descricao, unidadeMedida, suprMatrFlag, processo, avaliacaoTecnica, centroInvestimento,
                detalhaSerie, ativo, List.of());
    }
}
