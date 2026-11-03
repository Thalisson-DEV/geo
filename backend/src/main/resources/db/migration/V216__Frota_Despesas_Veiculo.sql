-- Despesas por veículo (change modulo-gestao-frota-despesas-veiculo): lavagens, estacionamento,
-- pedágio, mensalidades, taxas e outras, lançadas na web ou importadas do modelo C.E.S.
-- Aditiva. Tipos e subtipos padrão já cadastrados; despesas começam vazias.
-- Rollback: DROP das tabelas frota_despesa_anexos, frota_despesas, frota_subtipos_despesa e
-- frota_tipos_despesa (nesta ordem) e DELETE das permissões 'frota:despesa:%'.

-- ── Tipos e subtipos (catálogo editável) ─────────────────────────────────────────
CREATE TABLE frota_tipos_despesa (
    id UUID PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    -- Tipos semeados têm código (a importação e a migração do EXP usam); os criados na tela, não.
    codigo VARCHAR(30),
    ordem INTEGER NOT NULL DEFAULT 0,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uk_frota_tipos_despesa_nome ON frota_tipos_despesa (UPPER(nome));
CREATE UNIQUE INDEX uk_frota_tipos_despesa_codigo ON frota_tipos_despesa (codigo) WHERE codigo IS NOT NULL;

CREATE TABLE frota_subtipos_despesa (
    id UUID PRIMARY KEY,
    id_tipo UUID NOT NULL REFERENCES frota_tipos_despesa(id),
    nome VARCHAR(80) NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 0,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uk_frota_subtipos_despesa_nome ON frota_subtipos_despesa (id_tipo, UPPER(nome));

-- ── Despesas ──────────────────────────────────────────────────────────────────────
CREATE TABLE frota_despesas (
    id UUID PRIMARY KEY,
    id_veiculo UUID NOT NULL REFERENCES veiculos(id),
    data DATE NOT NULL,
    id_tipo UUID NOT NULL REFERENCES frota_tipos_despesa(id),
    id_subtipo UUID REFERENCES frota_subtipos_despesa(id),
    descricao VARCHAR(500),
    valor NUMERIC(14, 2) NOT NULL CHECK (valor > 0),
    -- Base do veículo na data (sugerida, editável) e o setor/centro de custo do financeiro (processo de negócio).
    id_base_operacional UUID REFERENCES bases_operacionais(id),
    id_processo UUID,
    -- Fornecedor do financeiro (sem FK: outro módulo) ou nome digitado.
    id_fornecedor UUID,
    fornecedor_nome VARCHAR(150),
    documento_tipo VARCHAR(10),
    documento_numero VARCHAR(60),
    medicao NUMERIC(12, 1) CHECK (medicao IS NULL OR medicao >= 0),
    -- A_PAGAR vai ao financeiro; CARTAO, REEMBOLSO e JA_PAGO são só registro.
    forma_pagamento VARCHAR(20) NOT NULL DEFAULT 'A_PAGAR',
    -- Solicitação de pagamento aberta pela despesa (sem FK: outro módulo).
    id_solicitacao_financeira UUID,
    numero_solicitacao_financeira BIGINT,
    situacao_pagamento VARCHAR(20),
    motivo_reprovacao_pagamento VARCHAR(500),
    origem VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    sistema_origem VARCHAR(20),
    id_externo VARCHAR(80),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_despesa_documento CHECK (documento_tipo IS NULL OR documento_tipo IN ('NFE', 'NFSE', 'CUPOM', 'RECIBO', 'OUTRO')),
    CONSTRAINT ck_frota_despesa_documento_numero CHECK ((documento_tipo IS NULL) = (documento_numero IS NULL)),
    CONSTRAINT ck_frota_despesa_pagamento CHECK (forma_pagamento IN ('A_PAGAR', 'CARTAO', 'REEMBOLSO', 'JA_PAGO')),
    CONSTRAINT ck_frota_despesa_situacao_pagamento CHECK (situacao_pagamento IS NULL OR situacao_pagamento IN ('SOLICITADO', 'APROVADO', 'REPROVADO')),
    CONSTRAINT ck_frota_despesa_solicitacao CHECK ((id_solicitacao_financeira IS NULL) = (situacao_pagamento IS NULL)),
    CONSTRAINT ck_frota_despesa_origem CHECK (origem IN ('MANUAL', 'IMPORTACAO')),
    CONSTRAINT ck_frota_despesa_externo CHECK ((sistema_origem IS NULL) = (id_externo IS NULL))
);
CREATE INDEX idx_frota_despesas_veiculo_data ON frota_despesas (id_veiculo, data DESC) WHERE ativo;
CREATE INDEX idx_frota_despesas_data ON frota_despesas (data DESC) WHERE ativo;
CREATE INDEX idx_frota_despesas_tipo ON frota_despesas (id_tipo) WHERE ativo;
CREATE UNIQUE INDEX uk_frota_despesas_solicitacao ON frota_despesas (id_solicitacao_financeira) WHERE id_solicitacao_financeira IS NOT NULL;
-- Reimportar a mesma planilha atualiza em vez de duplicar.
CREATE UNIQUE INDEX uk_frota_despesas_externo ON frota_despesas (sistema_origem, id_externo) WHERE id_externo IS NOT NULL;

CREATE TABLE frota_despesa_anexos (
    id UUID PRIMARY KEY,
    id_despesa UUID NOT NULL REFERENCES frota_despesas(id),
    arquivo_chave VARCHAR(500) NOT NULL,
    arquivo_nome VARCHAR(255) NOT NULL,
    arquivo_content_type VARCHAR(120),
    arquivo_tamanho_bytes BIGINT,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_frota_despesa_anexos_despesa ON frota_despesa_anexos (id_despesa) WHERE ativo;

-- ── Tipos e subtipos padrão (os mesmos do EXP) ────────────────────────────────────
INSERT INTO frota_tipos_despesa (id, nome, codigo, ordem, versao, data_criacao, usuario_criacao, ativo)
VALUES (gen_random_uuid(), 'Lavagem', 'LAVAGEM', 1, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE),
       (gen_random_uuid(), 'Estacionamento', 'ESTACIONAMENTO', 2, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE),
       (gen_random_uuid(), 'Pedágio', 'PEDAGIO', 3, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE),
       (gen_random_uuid(), 'Mensalidade', 'MENSALIDADE', 4, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE),
       (gen_random_uuid(), 'Taxa e licenciamento', 'TAXA', 5, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE),
       (gen_random_uuid(), 'Outras', 'OUTRAS', 6, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);

INSERT INTO frota_subtipos_despesa (id, id_tipo, nome, ordem, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), t.id, s.nome, s.ordem, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE
FROM frota_tipos_despesa t
JOIN (VALUES ('LAVAGEM', 'Completa', 1), ('LAVAGEM', 'Completa com motor', 2), ('LAVAGEM', 'Completa com cera', 3),
             ('LAVAGEM', 'Interna', 4), ('LAVAGEM', 'Externa', 5), ('LAVAGEM', 'A seco', 6),
             ('MENSALIDADE', 'Rastreador', 1), ('MENSALIDADE', 'TAG de pedágio', 2)) AS s(codigo, nome, ordem)
  ON s.codigo = t.codigo;

-- ── Permissões ────────────────────────────────────────────────────────────────────
INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
SELECT gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, nome
FROM (VALUES ('frota:despesa:read'), ('frota:despesa:write')) AS p(nome)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE perfil.nome IN ('ADMINISTRADOR', 'GESTOR_FROTA', 'OPERACAO_FROTA') AND permissao.nome LIKE 'frota:despesa:%'
ON CONFLICT DO NOTHING;

