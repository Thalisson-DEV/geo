package com.nexo.app.modules.estoque.infrastructure.persistence.projections;

import java.math.BigDecimal;
import java.util.UUID;

/** Saldo positivo de um material num estoque, com as séries e a última entrada e saída; instantes em epoch (ms). */
public interface SaldoRelatorioProjection {
    UUID getIdEstoque();
    String getEstoque();
    String getTipoEstoque();
    UUID getIdBase();
    UUID getIdEquipe();
    UUID getIdObra();
    UUID getIdMaterial();
    String getCodigo();
    String getDescricao();
    String getUnidade();
    Boolean getDetalhaSerie();
    String getCondicao();
    BigDecimal getQuantidade();
    Long getSeries();
    Long getSeriesReservadas();
    Long getUltimaEntrada();
    Long getUltimaSaida();
    Long getDesde();
}
