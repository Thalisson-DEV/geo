-- =====================================================================
-- V263: Contrato offline de Obras (app de campo).
--
-- * Registros de campo (APR, ocorrência, atividade, apontamento, evidência)
--   recebem o id gerado no aparelho (id_local) e o hash do conteúdo: o
--   reenvio igual devolve o registro; o mesmo id com outro conteúdo é
--   recusado. Guardam também a hora do aparelho, a hora de recebimento no
--   servidor e o GPS com a precisão.
-- * Chegada e saída da equipe na obra.
-- * Endereço/referência da obra; horário e manobra do desligamento.
-- * Assinaturas de Web Push por aparelho.
-- * Perfil EQUIPE_OBRAS com turno e execução de Obras.
-- =====================================================================

-- Registros de campo -----------------------------------------------------
ALTER TABLE turno_aprs
    ADD COLUMN IF NOT EXISTS id_local UUID,
    ADD COLUMN IF NOT EXISTS hash_campo VARCHAR(64),
    ADD COLUMN IF NOT EXISTS data_origem TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS recebido_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS latitude_campo NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS longitude_campo NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS precisao_metros NUMERIC(8, 1),
    ADD COLUMN IF NOT EXISTS id_local_conclusao UUID,
    ADD COLUMN IF NOT EXISTS assinaturas JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS uk_turno_aprs_id_local ON turno_aprs (id_local) WHERE id_local IS NOT NULL;

ALTER TABLE turno_ocorrencias
    ADD COLUMN IF NOT EXISTS id_local UUID,
    ADD COLUMN IF NOT EXISTS hash_campo VARCHAR(64),
    ADD COLUMN IF NOT EXISTS data_origem TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS recebido_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS latitude_campo NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS longitude_campo NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS precisao_metros NUMERIC(8, 1),
    ADD COLUMN IF NOT EXISTS id_programacao UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uk_turno_ocorrencias_id_local ON turno_ocorrencias (id_local) WHERE id_local IS NOT NULL;

ALTER TABLE turno_atividades
    ADD COLUMN IF NOT EXISTS id_local UUID,
    ADD COLUMN IF NOT EXISTS hash_campo VARCHAR(64),
    ADD COLUMN IF NOT EXISTS data_origem TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS recebido_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS latitude_campo NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS longitude_campo NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS precisao_metros NUMERIC(8, 1);
CREATE UNIQUE INDEX IF NOT EXISTS uk_turno_atividades_id_local ON turno_atividades (id_local) WHERE id_local IS NOT NULL;

-- Um comando do aparelho pode gerar vários apontamentos (um por item): a chave é o par.
ALTER TABLE apontamentos_execucao
    ADD COLUMN IF NOT EXISTS id_local UUID,
    ADD COLUMN IF NOT EXISTS hash_campo VARCHAR(64),
    ADD COLUMN IF NOT EXISTS data_origem TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS recebido_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS latitude_campo NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS longitude_campo NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS precisao_metros NUMERIC(8, 1),
    ADD COLUMN IF NOT EXISTS id_ponto UUID,
    ADD COLUMN IF NOT EXISTS ponto_inteiro BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS uk_apontamentos_id_local_item
    ON apontamentos_execucao (id_local, id_item_planejado) WHERE id_local IS NOT NULL;

ALTER TABLE evidencias_ponto_obra
    ADD COLUMN IF NOT EXISTS id_local UUID,
    ADD COLUMN IF NOT EXISTS hash_campo VARCHAR(64),
    ADD COLUMN IF NOT EXISTS recebido_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS precisao_metros NUMERIC(8, 1),
    ADD COLUMN IF NOT EXISTS id_vao UUID,
    ADD COLUMN IF NOT EXISTS id_programacao UUID,
    ADD COLUMN IF NOT EXISTS id_apontamento_local UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uk_evidencias_ponto_id_local ON evidencias_ponto_obra (id_local) WHERE id_local IS NOT NULL;

-- Chegada e saída da equipe na obra ---------------------------------------
CREATE TABLE IF NOT EXISTS obra_presencas (
    id                       UUID PRIMARY KEY,
    versao                   BIGINT,
    data_criacao             TIMESTAMPTZ NOT NULL,
    data_ultima_alteracao    TIMESTAMPTZ,
    usuario_criacao          VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo                    BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao         TIMESTAMPTZ,
    id_turno                 UUID NOT NULL,
    id_equipe                UUID NOT NULL,
    id_obra                  UUID NOT NULL REFERENCES obras (id),
    id_programacao           UUID,
    tipo                     VARCHAR(10) NOT NULL,
    id_local                 UUID NOT NULL,
    hash_campo               VARCHAR(64) NOT NULL,
    data_origem              TIMESTAMPTZ NOT NULL,
    recebido_em              TIMESTAMPTZ NOT NULL,
    latitude_campo           NUMERIC(9, 6),
    longitude_campo          NUMERIC(9, 6),
    precisao_metros          NUMERIC(8, 1),
    CONSTRAINT ck_obra_presencas_tipo CHECK (tipo IN ('CHEGADA', 'SAIDA'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_obra_presencas_id_local ON obra_presencas (id_local);
CREATE INDEX IF NOT EXISTS ix_obra_presencas_turno ON obra_presencas (id_turno, data_origem);
CREATE INDEX IF NOT EXISTS ix_obra_presencas_equipe ON obra_presencas (id_equipe, data_origem);

-- Cadastros para o campo --------------------------------------------------
ALTER TABLE obras
    ADD COLUMN IF NOT EXISTS endereco VARCHAR(500),
    ADD COLUMN IF NOT EXISTS referencia VARCHAR(500);

ALTER TABLE programacoes
    ADD COLUMN IF NOT EXISTS hora_desligamento_inicio TIME,
    ADD COLUMN IF NOT EXISTS hora_desligamento_fim TIME,
    ADD COLUMN IF NOT EXISTS numero_manobra VARCHAR(50);

-- Web Push ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assinaturas_push (
    id                       UUID PRIMARY KEY,
    versao                   BIGINT,
    data_criacao             TIMESTAMPTZ NOT NULL,
    data_ultima_alteracao    TIMESTAMPTZ,
    usuario_criacao          VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo                    BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao         TIMESTAMPTZ,
    id_usuario               UUID NOT NULL,
    id_equipe                UUID,
    endpoint                 VARCHAR(1000) NOT NULL,
    chave_p256dh             VARCHAR(200) NOT NULL,
    chave_auth               VARCHAR(100) NOT NULL,
    falhas                   INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_assinaturas_push_endpoint ON assinaturas_push (endpoint);
CREATE INDEX IF NOT EXISTS ix_assinaturas_push_usuario ON assinaturas_push (id_usuario) WHERE ativo;
CREATE INDEX IF NOT EXISTS ix_assinaturas_push_equipe ON assinaturas_push (id_equipe) WHERE ativo;

-- Perfil da equipe de Obras -----------------------------------------------
INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
VALUES
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'obras:turno:read'),
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'obras:turno:write'),
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'obras:execucao:write'),
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'obras:campo:read')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfis_acesso (id, nome, versao, data_criacao, usuario_criacao, ativo)
VALUES (gen_random_uuid(), 'EQUIPE_OBRAS', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT p.id, perm.id
FROM perfis_acesso p
CROSS JOIN permissoes perm
WHERE p.nome = 'EQUIPE_OBRAS'
  AND perm.nome IN ('obras:turno:read', 'obras:turno:write', 'obras:execucao:write', 'obras:campo:read')
ON CONFLICT DO NOTHING;

-- Quem acompanha as equipes lê o pacote de campo (visita prévia, As Built e book pelo app).
INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT p.id, perm.id
FROM perfis_acesso p
CROSS JOIN permissoes perm
WHERE p.nome IN ('ADMINISTRADOR', 'SUPERVISOR')
  AND perm.nome = 'obras:campo:read'
ON CONFLICT DO NOTHING;

-- Envio durável: tipos dos registros de campo de Obras -----------------------
ALTER TABLE operacoes_sincronizacao DROP CONSTRAINT IF EXISTS ck_operacao_tipo;
ALTER TABLE operacoes_sincronizacao ADD CONSTRAINT ck_operacao_tipo CHECK (tipo IN (
    'TURNO', 'EXECUCAO', 'SOLICITACAO', 'TRANSFERENCIA', 'INSPECAO', 'ANEXO',
    'OBRA_APR', 'OBRA_APR_CONCLUSAO', 'OBRA_OCORRENCIA', 'OBRA_ATIVIDADE', 'OBRA_APONTAMENTO', 'OBRA_PRESENCA',
    'OBRA_EVIDENCIA', 'OBRA_RELATORIO'));
