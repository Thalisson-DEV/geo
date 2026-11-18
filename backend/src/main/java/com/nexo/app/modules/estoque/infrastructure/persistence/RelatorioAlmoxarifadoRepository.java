package com.nexo.app.modules.estoque.infrastructure.persistence;

import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque;
import com.nexo.app.modules.estoque.infrastructure.persistence.projections.MovimentacaoRelatorioProjection;
import com.nexo.app.modules.estoque.infrastructure.persistence.projections.SaldoRelatorioProjection;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * Consultas dos relatórios gerenciais do almoxarifado. O estoque da oficina da frota fica de fora: ele
 * tem relatório próprio.
 */
@org.springframework.stereotype.Repository
public interface RelatorioAlmoxarifadoRepository extends Repository<MovimentacaoEstoque, UUID> {

    /**
     * Movimentações ativas entre {@code inicio} (inclusive) e {@code fim} (exclusive), das mais recentes para
     * as mais antigas. A base é a do almoxarifado físico envolvido; sem ele, a da origem ou do destino. A
     * equipe e a obra vêm da movimentação ou, na falta, do estoque de campo ou de obra envolvido.
     */
    @Query(value = """
        SELECT
            m.id AS id,
            m.id_referencia_operacao AS idOperacao,
            CAST(EXTRACT(EPOCH FROM m.data_hora) * 1000 AS BIGINT) AS dataHora,
            m.tipo_movimentacao AS tipo,
            m.condicao AS condicao,
            m.motivo AS motivo,
            m.observacao AS observacao,
            m.quantidade AS quantidade,
            mat.id AS idMaterial,
            mat.cod_material AS codigo,
            mat.descricao AS descricao,
            mat.unidade_medida AS unidade,
            m.num_serie AS numSerie,
            eo.id AS idOrigem,
            eo.nome_identificador AS origem,
            tor.nome AS tipoOrigem,
            ed.id AS idDestino,
            ed.nome_identificador AS destino,
            tde.nome AS tipoDestino,
            COALESCE(CASE WHEN tor.nome = 'FISICO' THEN eo.id_base_operacional END,
                     CASE WHEN tde.nome = 'FISICO' THEN ed.id_base_operacional END,
                     eo.id_base_operacional, ed.id_base_operacional) AS idBase,
            COALESCE(m.id_equipe, eo.id_equipe, ed.id_equipe) AS idEquipe,
            COALESCE(m.id_obra, eo.id_obra, ed.id_obra) AS idObra,
            m.id_solicitacao AS idSolicitacao,
            s.contexto AS contexto,
            m.tipo_tecnico AS tipoTecnico,
            m.id_usuario_operador AS idOperador
        FROM movimentacoes_estoque m
        JOIN materiais mat ON mat.id = m.id_material
        LEFT JOIN estoques eo ON eo.id = m.id_estoque_origem
        LEFT JOIN tipos_estoque tor ON tor.id = eo.id_tipo_estoque
        LEFT JOIN estoques ed ON ed.id = m.id_estoque_destino
        LEFT JOIN tipos_estoque tde ON tde.id = ed.id_tipo_estoque
        LEFT JOIN solicitacoes_material s ON s.id = m.id_solicitacao
        WHERE m.ativo = TRUE
          AND m.data_hora >= CAST(:inicio AS TIMESTAMPTZ)
          AND m.data_hora < CAST(:fim AS TIMESTAMPTZ)
          AND COALESCE(tor.nome, '') <> 'FROTA'
          AND COALESCE(tde.nome, '') <> 'FROTA'
        ORDER BY m.data_hora DESC
        LIMIT :limite
        """, nativeQuery = true)
    List<MovimentacaoRelatorioProjection> listarMovimentacoes(@Param("inicio") String inicio, @Param("fim") String fim,
                                                              @Param("limite") int limite);

    /**
     * Saldos positivos por estoque, material e condição, com as séries em estoque (e quantas reservadas) e a
     * última entrada e saída do material naquele estoque.
     */
    @Query(value = """
        WITH entradas AS (
            SELECT id_estoque_destino AS id_estoque, id_material, MAX(data_hora) AS em
            FROM movimentacoes_estoque WHERE ativo = TRUE AND id_estoque_destino IS NOT NULL
            GROUP BY 1, 2
        ), saidas AS (
            SELECT id_estoque_origem AS id_estoque, id_material, MAX(data_hora) AS em
            FROM movimentacoes_estoque WHERE ativo = TRUE AND id_estoque_origem IS NOT NULL
            GROUP BY 1, 2
        ), series AS (
            SELECT ss.id_estoque, ss.id_material, ss.condicao, COUNT(*) AS total, COUNT(r.id) AS reservadas
            FROM saldos_seriais ss
            LEFT JOIN reservas_serie_solicitacao r ON r.id_saldo_serie = ss.id AND r.ativo = TRUE
            WHERE ss.ativo = TRUE
            GROUP BY 1, 2, 3
        )
        SELECT
            e.id AS idEstoque,
            e.nome_identificador AS estoque,
            t.nome AS tipoEstoque,
            e.id_base_operacional AS idBase,
            e.id_equipe AS idEquipe,
            e.id_obra AS idObra,
            mat.id AS idMaterial,
            mat.cod_material AS codigo,
            mat.descricao AS descricao,
            mat.unidade_medida AS unidade,
            mat.detalha_serie AS detalhaSerie,
            sa.condicao AS condicao,
            sa.quantidade AS quantidade,
            COALESCE(se.total, 0) AS series,
            COALESCE(se.reservadas, 0) AS seriesReservadas,
            CAST(EXTRACT(EPOCH FROM en.em) * 1000 AS BIGINT) AS ultimaEntrada,
            CAST(EXTRACT(EPOCH FROM sd.em) * 1000 AS BIGINT) AS ultimaSaida,
            CAST(EXTRACT(EPOCH FROM sa.data_criacao) * 1000 AS BIGINT) AS desde
        FROM saldos sa
        JOIN estoques e ON e.id = sa.id_estoque AND e.ativo = TRUE
        JOIN tipos_estoque t ON t.id = e.id_tipo_estoque
        JOIN materiais mat ON mat.id = sa.id_material
        LEFT JOIN series se ON se.id_estoque = sa.id_estoque AND se.id_material = sa.id_material AND se.condicao = sa.condicao
        LEFT JOIN entradas en ON en.id_estoque = sa.id_estoque AND en.id_material = sa.id_material
        LEFT JOIN saidas sd ON sd.id_estoque = sa.id_estoque AND sd.id_material = sa.id_material
        WHERE sa.ativo = TRUE
          AND sa.quantidade > 0
          AND t.nome <> 'FROTA'
        ORDER BY e.nome_identificador, mat.cod_material
        LIMIT :limite
        """, nativeQuery = true)
    List<SaldoRelatorioProjection> listarSaldos(@Param("limite") int limite);
}
