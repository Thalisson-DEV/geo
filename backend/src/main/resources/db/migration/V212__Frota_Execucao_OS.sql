-- V180: módulo de frota — execução completa da OS (openspec/changes/modulo-gestao-frota-execucao-os).
--
-- Aditiva. As OS existentes ficam veiculares, sem causa e com desconto e acréscimo zerados.
-- Rollback: DROP das tabelas frota_os_documentos_fiscais, frota_os_pecas e frota_os_servicos;
-- DROP das colunas veicular, descricao_equipamento, causa, desconto e acrescimo e dos CHECKs
-- novos de frota_ordens_servico; SET NOT NULL em id_veiculo e placa só se não houver OS sem veículo.

-- ── OS: sem veículo, causa e ajustes de valor ─────────────────────────────────────
ALTER TABLE frota_ordens_servico
    ADD COLUMN veicular BOOLEAN NOT NULL DEFAULT TRUE,
    -- Ferramental, oficina ou equipamento sem placa (OS não veicular).
    ADD COLUMN descricao_equipamento VARCHAR(150),
    ADD COLUMN causa VARCHAR(30),
    ADD COLUMN desconto NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
    ADD COLUMN acrescimo NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (acrescimo >= 0),
    ALTER COLUMN id_veiculo DROP NOT NULL,
    ALTER COLUMN placa DROP NOT NULL,
    ADD CONSTRAINT ck_frota_os_causa CHECK (causa IS NULL OR causa IN (
        'AVARIA', 'DESGASTE_NATURAL', 'USO_INDEVIDO', 'SERVICO_CORRETIVO', 'SERVICO_PREVENTIVO',
        'ESTOQUE', 'SUBSTITUICAO_PNEUS')),
    ADD CONSTRAINT ck_frota_os_veicular CHECK (
        (veicular AND id_veiculo IS NOT NULL AND placa IS NOT NULL)
        OR (NOT veicular AND id_veiculo IS NULL AND placa IS NULL
            AND descricao_equipamento IS NOT NULL AND id_base_operacional IS NOT NULL
            AND km_abertura IS NULL AND km_encerramento IS NULL
            AND id_condutor IS NULL AND veiculo_parado = FALSE));

CREATE INDEX idx_frota_os_sem_veiculo ON frota_ordens_servico (id_base_operacional, aberta_em DESC)
    WHERE veicular = FALSE;

-- ── Serviços (mão de obra) ────────────────────────────────────────────────────────
CREATE TABLE frota_os_servicos (
    id UUID PRIMARY KEY,
    id_ordem_servico UUID NOT NULL REFERENCES frota_ordens_servico(id),
    descricao VARCHAR(300) NOT NULL,
    -- Item do catálogo de manutenção, opcional: liga a mão de obra ao item da OS.
    id_item_manutencao UUID REFERENCES frota_itens_manutencao(id),
    -- Oficina interna: colaborador do RH. Externa: nome livre opcional.
    id_mecanico UUID REFERENCES colaboradores(id),
    mecanico_nome VARCHAR(120),
    quantidade NUMERIC(12, 3) NOT NULL CHECK (quantidade > 0),
    valor_unitario NUMERIC(14, 4) NOT NULL CHECK (valor_unitario >= 0),
    subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_os_servico_mecanico CHECK (id_mecanico IS NULL OR mecanico_nome IS NULL)
);
CREATE INDEX idx_frota_os_servicos_os ON frota_os_servicos (id_ordem_servico);
CREATE INDEX idx_frota_os_servicos_mecanico ON frota_os_servicos (id_mecanico) WHERE id_mecanico IS NOT NULL;

-- ── Peças e consumíveis ───────────────────────────────────────────────────────────
CREATE TABLE frota_os_pecas (
    id UUID PRIMARY KEY,
    id_ordem_servico UUID NOT NULL REFERENCES frota_ordens_servico(id),
    descricao VARCHAR(300) NOT NULL,
    codigo VARCHAR(60),
    -- ESTOQUE só registra a origem; a baixa no estoque entra na Fase 4.
    origem VARCHAR(20) NOT NULL,
    quantidade NUMERIC(12, 3) NOT NULL CHECK (quantidade > 0),
    unidade VARCHAR(10) NOT NULL,
    valor_unitario NUMERIC(14, 4) NOT NULL CHECK (valor_unitario >= 0),
    subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_os_peca_origem CHECK (origem IN ('ESTOQUE', 'COMPRA'))
);
CREATE INDEX idx_frota_os_pecas_os ON frota_os_pecas (id_ordem_servico);

-- ── Documentos fiscais ────────────────────────────────────────────────────────────
CREATE TABLE frota_os_documentos_fiscais (
    id UUID PRIMARY KEY,
    id_ordem_servico UUID NOT NULL REFERENCES frota_ordens_servico(id),
    tipo VARCHAR(10) NOT NULL,
    numero VARCHAR(60) NOT NULL,
    serie VARCHAR(10),
    emitido_em DATE NOT NULL,
    -- Fornecedor do financeiro (sem FK: outro módulo) ou nome digitado.
    id_fornecedor UUID,
    fornecedor_nome VARCHAR(150),
    valor NUMERIC(14, 2) NOT NULL CHECK (valor >= 0),
    arquivo_chave VARCHAR(500),
    arquivo_nome VARCHAR(255),
    arquivo_content_type VARCHAR(120),
    arquivo_tamanho_bytes BIGINT,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_os_doc_tipo CHECK (tipo IN ('NFE', 'NFSE', 'CUPOM', 'RECIBO', 'OUTRO')),
    CONSTRAINT ck_frota_os_doc_fornecedor CHECK (id_fornecedor IS NOT NULL OR fornecedor_nome IS NOT NULL),
    CONSTRAINT ck_frota_os_doc_arquivo CHECK ((arquivo_chave IS NULL) = (arquivo_nome IS NULL))
);
CREATE INDEX idx_frota_os_docs_os ON frota_os_documentos_fiscais (id_ordem_servico) WHERE ativo;
-- A mesma nota não entra duas vezes na mesma OS (entre os documentos ativos).
CREATE UNIQUE INDEX uk_frota_os_doc_numero ON frota_os_documentos_fiscais (
    id_ordem_servico, tipo, UPPER(numero), COALESCE(UPPER(serie), ''),
    COALESCE(id_fornecedor::text, UPPER(fornecedor_nome)))
    WHERE ativo;

