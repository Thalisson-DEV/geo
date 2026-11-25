-- =====================================================================
-- V271: Estoque por obra e canteiros (change estoque-por-obra).
--
-- * Alocação por obra ao lado do saldo: quanto do saldo de cada local
--   (caminhão, canteiro) é de cada obra. O que não está alocado é livre.
-- * Movimentos ganham a obra de origem (empréstimo/remanejamento entre obras).
-- * Canteiro: novo tipo de estoque, com referência e coordenadas.
-- * Backfill: o líquido das entregas técnicas de cada caminhão vira alocação
--   da obra, limitado ao saldo físico atual.
-- =====================================================================

CREATE TABLE IF NOT EXISTS alocacoes_obra_estoque (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_estoque               UUID NOT NULL REFERENCES estoques (id),
    id_material              UUID NOT NULL REFERENCES materiais (id),
    condicao                 VARCHAR(20) NOT NULL DEFAULT 'NOVO',
    id_obra                  UUID NOT NULL,
    quantidade               NUMERIC(12, 3) NOT NULL DEFAULT 0,
    versao                   BIGINT DEFAULT 0,
    ativo                    BOOLEAN NOT NULL DEFAULT TRUE,
    data_criacao             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao    TIMESTAMPTZ,
    data_desativacao         TIMESTAMPTZ,
    usuario_criacao          VARCHAR(100),
    usuario_ultima_alteracao VARCHAR(100),
    CONSTRAINT ck_alocacoes_obra_quantidade CHECK (quantidade >= 0),
    CONSTRAINT uk_alocacoes_obra_chave UNIQUE (id_estoque, id_material, condicao, id_obra)
);
CREATE INDEX IF NOT EXISTS idx_alocacoes_obra_obra ON alocacoes_obra_estoque (id_obra) WHERE quantidade > 0;
CREATE INDEX IF NOT EXISTS idx_alocacoes_obra_estoque ON alocacoes_obra_estoque (id_estoque) WHERE quantidade > 0;

ALTER TABLE movimentacoes_estoque ADD COLUMN IF NOT EXISTS id_obra_origem UUID;
CREATE INDEX IF NOT EXISTS idx_movimentacoes_estoque_obra_origem ON movimentacoes_estoque (id_obra_origem)
    WHERE id_obra_origem IS NOT NULL;

ALTER TABLE estoques
    ADD COLUMN IF NOT EXISTS referencia VARCHAR(300),
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6);

INSERT INTO tipos_estoque (id, nome, versao, data_criacao, usuario_criacao, ativo)
VALUES (gen_random_uuid(), 'CANTEIRO', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE)
ON CONFLICT (nome) DO NOTHING;

-- Permissões: deixar/pegar material no canteiro (equipe) e consultar canteiros.
INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
VALUES
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'estoque:canteiro:read'),
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'estoque:canteiro:write')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT p.id, perm.id
FROM perfis_acesso p
CROSS JOIN permissoes perm
WHERE p.nome IN ('ADMINISTRADOR', 'BACKOFFICE_ALMOXARIFADO', 'BACKOFFICE_TECNICO', 'COORDENADOR_TECNICO', 'EQUIPE_OBRAS')
  AND perm.nome IN ('estoque:canteiro:read', 'estoque:canteiro:write')
ON CONFLICT DO NOTHING;

-- Backfill das alocações dos caminhões --------------------------------------
WITH liquido AS (
    SELECT e.id AS id_estoque, m.id_material, m.condicao, m.id_obra,
           SUM(CASE WHEN m.id_estoque_destino = e.id THEN m.quantidade ELSE -m.quantidade END) AS quantidade
    FROM movimentacoes_estoque m
    JOIN estoques e ON e.id IN (m.id_estoque_origem, m.id_estoque_destino)
    JOIN tipos_estoque t ON t.id = e.id_tipo_estoque AND t.nome = 'CAMPO'
    WHERE m.ativo
      AND m.id_obra IS NOT NULL
      AND m.id_solicitacao IS NOT NULL
      AND m.tipo_movimentacao IN ('ENTREGA', 'ESTORNO', 'DEVOLUCAO')
    GROUP BY 1, 2, 3, 4
),
limitado AS (
    SELECT l.id_estoque, l.id_material, l.condicao, l.id_obra,
           LEAST(l.quantidade, GREATEST(COALESCE(s.quantidade, 0), 0)) AS quantidade
    FROM liquido l
    LEFT JOIN saldos s ON s.id_estoque = l.id_estoque AND s.id_material = l.id_material AND s.condicao = l.condicao
    WHERE l.quantidade > 0
)
INSERT INTO alocacoes_obra_estoque (id_estoque, id_material, condicao, id_obra, quantidade, usuario_criacao)
SELECT id_estoque, id_material, condicao, id_obra, quantidade, 'SISTEMA'
FROM limitado
WHERE quantidade > 0
ON CONFLICT (id_estoque, id_material, condicao, id_obra) DO NOTHING;
