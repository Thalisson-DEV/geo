-- =====================================================================
-- V274: Balcão do almoxarifado (change rotina-material-equipe).
--
-- * Matrícula do colaborador: identifica quem retira ou devolve material.
-- * Parâmetros do estoque (linha única): separação obrigatória, entrega
--   acima do pedido, devolução acima do caminhão e o que o balcão exige
--   (assinatura, matrícula, foto).
-- * Atendimentos do balcão: cada retirada ou devolução de uma equipe,
--   com quem retirou, assinatura, foto e os itens (para o termo).
-- =====================================================================

ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS matricula VARCHAR(30);
CREATE UNIQUE INDEX IF NOT EXISTS uk_colaboradores_matricula_ativa
    ON colaboradores (matricula) WHERE matricula IS NOT NULL AND ativo = TRUE;

CREATE TABLE IF NOT EXISTS estoque_parametros (
    id                         UUID PRIMARY KEY,
    separacao_obrigatoria      BOOLEAN NOT NULL DEFAULT FALSE,
    entrega_acima_pedido       BOOLEAN NOT NULL DEFAULT TRUE,
    devolucao_acima_caminhao   BOOLEAN NOT NULL DEFAULT FALSE,
    exige_assinatura           BOOLEAN NOT NULL DEFAULT TRUE,
    exige_matricula            BOOLEAN NOT NULL DEFAULT TRUE,
    exige_foto                 BOOLEAN NOT NULL DEFAULT TRUE,
    versao                     BIGINT DEFAULT 0,
    ativo                      BOOLEAN NOT NULL DEFAULT TRUE,
    data_criacao               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao      TIMESTAMPTZ,
    data_desativacao           TIMESTAMPTZ,
    usuario_criacao            VARCHAR(100),
    usuario_ultima_alteracao   VARCHAR(100)
);

INSERT INTO estoque_parametros (id, usuario_criacao)
VALUES ('00000000-0000-0000-0000-00000000e001', 'SISTEMA')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS atendimentos_balcao (
    id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo                       VARCHAR(20) NOT NULL,
    id_equipe                  UUID NOT NULL,
    id_almoxarifado            UUID NOT NULL REFERENCES estoques (id),
    id_colaborador             UUID,
    nome_colaborador           VARCHAR(200),
    matricula                  VARCHAR(30),
    assinatura                 VARCHAR(400),
    foto                       VARCHAR(400),
    observacao                 VARCHAR(500),
    itens                      JSONB NOT NULL DEFAULT '[]'::jsonb,
    id_referencia              UUID,
    realizado_em               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_usuario_operador        UUID,
    versao                     BIGINT DEFAULT 0,
    ativo                      BOOLEAN NOT NULL DEFAULT TRUE,
    data_criacao               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao      TIMESTAMPTZ,
    data_desativacao           TIMESTAMPTZ,
    usuario_criacao            VARCHAR(100),
    usuario_ultima_alteracao   VARCHAR(100),
    CONSTRAINT ck_atendimentos_balcao_tipo CHECK (tipo IN ('RETIRADA', 'DEVOLUCAO'))
);
CREATE INDEX IF NOT EXISTS idx_atendimentos_balcao_almox_data ON atendimentos_balcao (id_almoxarifado, realizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_atendimentos_balcao_equipe_data ON atendimentos_balcao (id_equipe, realizado_em DESC);

INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
VALUES
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'estoque:balcao:operate'),
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'estoque:parametros:write')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT p.id, perm.id
FROM perfis_acesso p
CROSS JOIN permissoes perm
WHERE p.nome IN ('ADMINISTRADOR', 'BACKOFFICE_ALMOXARIFADO')
  AND perm.nome IN ('estoque:balcao:operate', 'estoque:parametros:write')
ON CONFLICT DO NOTHING;
