-- V247: séries aplicadas em campo que não estavam no estoque da equipe.
--
-- A aplicação em campo nunca é recusada: se a série não está no caminhão, a quantidade
-- baixa e a série fica onde estava. Isso deixa a equipe com mais números de série do que
-- saldo de duas formas:
--
-- 1) A série foi aplicada antes de ser entregue à equipe. Quando a entrega chega, a série
--    entra no caminhão já aplicada. Daqui em diante o sistema baixa a série na chegada; esta
--    migração corrige as que já chegaram assim.
-- 2) A série aplicada nunca entrou na equipe (digitação errada, carga inicial incompleta).
--    O almoxarifado concilia pela tela do saldo da equipe: diz qual série do caminhão era a
--    aplicada (ela sai da equipe) ou que nenhuma corresponde. Cada decisão fica registrada.


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1) Conciliações feitas pelo almoxarifado
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE conciliacoes_series_aplicadas (
    id UUID PRIMARY KEY,
    id_estoque UUID NOT NULL REFERENCES estoques (id),
    id_material UUID NOT NULL REFERENCES materiais (id),
    id_movimentacao_aplicacao UUID NOT NULL REFERENCES movimentacoes_estoque (id),
    num_serie_aplicada VARCHAR(100) NOT NULL,
    -- Série do caminhão que era a aplicada; nula quando nenhuma corresponde.
    num_serie_baixada VARCHAR(100),
    id_usuario UUID NOT NULL,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);

-- Uma decisão vigente por aplicação.
CREATE UNIQUE INDEX uq_conciliacao_serie_aplicacao
    ON conciliacoes_series_aplicadas (id_movimentacao_aplicacao)
    WHERE ativo;

CREATE INDEX idx_conciliacao_serie_estoque_material
    ON conciliacoes_series_aplicadas (id_estoque, id_material, num_serie_aplicada);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2) Séries que chegaram à equipe depois de aplicadas por ela
-- ═══════════════════════════════════════════════════════════════════════════════
-- A série está ativa (NOVO) num estoque de equipe e a equipe a aplicou mais vezes do que
-- ela tinha entrado no caminhão até a última chegada: a última chegada é de uma série já
-- aplicada. A quantidade já está certa (a aplicação baixou, a entrega somou); só a série sai.

CREATE TEMPORARY TABLE tmp_series_ja_aplicadas ON COMMIT DROP AS
SELECT ss.id
FROM saldos_seriais ss
JOIN estoques e ON e.id = ss.id_estoque AND e.id_equipe IS NOT NULL
WHERE ss.ativo
  AND ss.condicao = 'NOVO'
  AND (SELECT count(*) FROM movimentacoes_estoque a
       WHERE a.tipo_movimentacao = 'APLICACAO' AND a.ativo
         AND a.id_estoque_origem = ss.id_estoque AND a.id_material = ss.id_material
         AND a.num_serie = ss.num_serie)
      >
      (SELECT count(*) FROM movimentacoes_estoque i
       WHERE i.ativo
         AND i.id_estoque_destino = ss.id_estoque AND i.id_material = ss.id_material
         AND i.num_serie = ss.num_serie
         AND i.data_hora < (SELECT max(u.data_hora) FROM movimentacoes_estoque u
                            WHERE u.ativo
                              AND u.id_estoque_destino = ss.id_estoque AND u.id_material = ss.id_material
                              AND u.num_serie = ss.num_serie));

UPDATE reservas_serie_solicitacao
SET ativo = FALSE,
    data_desativacao = CURRENT_TIMESTAMP,
    data_ultima_alteracao = CURRENT_TIMESTAMP,
    usuario_ultima_alteracao = 'sistema'
WHERE ativo AND id_saldo_serie IN (SELECT id FROM tmp_series_ja_aplicadas);

UPDATE saldos_seriais
SET ativo = FALSE,
    data_desativacao = CURRENT_TIMESTAMP,
    data_ultima_alteracao = CURRENT_TIMESTAMP,
    usuario_ultima_alteracao = 'sistema'
WHERE id IN (SELECT id FROM tmp_series_ja_aplicadas);
