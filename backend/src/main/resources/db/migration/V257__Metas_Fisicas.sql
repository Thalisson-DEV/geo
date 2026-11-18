-- =====================================================================
-- V257: Meta física da Concessionária
--
-- A contratante define, para cada base operacional e cada mês, quantas notas
-- de cada tipo de serviço (corte, enlace, baixa administrativa...) devem ser
-- executadas. Cada nota conta uma vez, não importa quantos serviços tenha.
--
-- * metas_fisicas: a meta de uma base num mês (competencia = dia 1º do mês).
--   Quando a Concessionária envia o total do mês e só o parcial por serviço até a data,
--   o total e a data do parcial ficam guardados e a meta mensal de cada serviço
--   é calculada na proporção do parcial.
-- * metas_fisicas_itens: a quantidade de notas por tipo de serviço.
-- * uma meta ativa por base e mês (validado no domínio e no índice parcial).
--
-- Base e tipo de serviço são referenciados sem FK, como nas demais metas.
-- =====================================================================

CREATE TABLE metas_fisicas (
    id UUID PRIMARY KEY,
    id_base_operacional UUID NOT NULL,
    competencia DATE NOT NULL,
    total_mes_concessionaria INTEGER,
    parcial_ate DATE,
    descricao VARCHAR(200),

    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,

    CONSTRAINT ck_meta_fisica_competencia_dia_1 CHECK (EXTRACT(DAY FROM competencia) = 1),
    CONSTRAINT ck_meta_fisica_total_positivo CHECK (total_mes_concessionaria IS NULL OR total_mes_concessionaria > 0)
);

CREATE UNIQUE INDEX uk_meta_fisica_base_competencia_ativa
    ON metas_fisicas(id_base_operacional, competencia)
    WHERE ativo = TRUE;

CREATE INDEX idx_metas_fisicas_competencia ON metas_fisicas(competencia);

CREATE TABLE metas_fisicas_itens (
    id UUID PRIMARY KEY,
    id_meta_fisica UUID NOT NULL REFERENCES metas_fisicas(id) ON DELETE CASCADE,
    id_tipo_servico UUID NOT NULL,
    quantidade INTEGER NOT NULL,
    parcial_concessionaria INTEGER,

    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,

    CONSTRAINT ck_meta_fisica_item_quantidade CHECK (quantidade >= 0),
    CONSTRAINT ck_meta_fisica_item_parcial CHECK (parcial_concessionaria IS NULL OR parcial_concessionaria >= 0),
    CONSTRAINT uk_meta_fisica_item_tipo UNIQUE (id_meta_fisica, id_tipo_servico)
);

-- Permissões: quem consulta as execuções comerciais acompanha a meta física;
-- quem cadastra metas de faturamento também cadastra a meta física.
INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
VALUES
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'execucao:meta-fisica:read'),
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'execucao:meta-fisica:write')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT pp.id_perfil, nova.id
FROM perfil_permissoes pp
JOIN permissoes atual ON atual.id = pp.id_permissao
JOIN permissoes nova ON nova.nome = 'execucao:meta-fisica:read'
WHERE atual.nome = 'execucao:comercial:read'
ON CONFLICT DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT pp.id_perfil, nova.id
FROM perfil_permissoes pp
JOIN permissoes atual ON atual.id = pp.id_permissao
JOIN permissoes nova ON nova.nome IN ('execucao:meta-fisica:read', 'execucao:meta-fisica:write')
WHERE atual.nome = 'rh:meta-faturamento:write'
ON CONFLICT DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE perfil.nome = 'ADMINISTRADOR'
  AND permissao.nome IN ('execucao:meta-fisica:read', 'execucao:meta-fisica:write')
ON CONFLICT DO NOTHING;
