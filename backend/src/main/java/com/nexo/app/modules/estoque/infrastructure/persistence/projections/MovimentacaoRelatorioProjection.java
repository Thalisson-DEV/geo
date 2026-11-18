package com.nexo.app.modules.estoque.infrastructure.persistence.projections;

import java.math.BigDecimal;
import java.util.UUID;

/** Uma movimentação de estoque para os relatórios do almoxarifado; instantes em epoch (ms). */
public interface MovimentacaoRelatorioProjection {
    UUID getId();
    UUID getIdOperacao();
    Long getDataHora();
    String getTipo();
    String getCondicao();
    String getMotivo();
    String getObservacao();
    BigDecimal getQuantidade();
    UUID getIdMaterial();
    String getCodigo();
    String getDescricao();
    String getUnidade();
    String getNumSerie();
    UUID getIdOrigem();
    String getOrigem();
    String getTipoOrigem();
    UUID getIdDestino();
    String getDestino();
    String getTipoDestino();
    UUID getIdBase();
    UUID getIdEquipe();
    UUID getIdObra();
    UUID getIdSolicitacao();
    String getContexto();
    String getTipoTecnico();
    UUID getIdOperador();
}
