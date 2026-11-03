-- Abastecimento (Fase 2 do ADR 0001): postos, produtos, carteiras de aprovação por placa,
-- solicitações com itens, fotos, alertas, avisos ao posto e faturas do posto.
-- Aditiva. Produtos padrão já cadastrados; postos e carteiras começam vazios.
-- Rollback: DROP das tabelas frota_faturas_posto, frota_abastecimento_avisos_posto,
-- frota_abastecimento_alertas, frota_abastecimento_fotos, frota_abastecimento_itens,
-- frota_abastecimentos, frota_carteira_placas, frota_carteiras_aprovacao,
-- frota_produtos_abastecimento e frota_postos (nesta ordem), DELETE das permissões
-- 'frota:abastecimento:%' e das regras 'frota.abastecimento_%'.

-- ── Postos ────────────────────────────────────────────────────────────────────────
CREATE TABLE frota_postos (
    id UUID PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    cnpj VARCHAR(14),
    id_base_operacional UUID REFERENCES bases_operacionais(id),
    -- Formato E.164 sem o "+", ex.: 5574999990000.
    whatsapp VARCHAR(20),
    -- Fornecedor do financeiro que recebe a fatura (outro módulo: sem chave estrangeira).
    id_fornecedor UUID,
    observacao VARCHAR(500),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_frota_postos_base ON frota_postos (id_base_operacional) WHERE ativo;

-- ── Produtos ──────────────────────────────────────────────────────────────────────
CREATE TABLE frota_produtos_abastecimento (
    id UUID PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    categoria VARCHAR(20) NOT NULL,
    unidade VARCHAR(5) NOT NULL,
    -- Liga o produto ao combustível da ficha do veículo, para sugerir o preferido.
    combustivel VARCHAR(20),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_produto_abast_categoria CHECK (categoria IN ('COMBUSTIVEL', 'ARLA', 'OLEO', 'FLUIDO')),
    CONSTRAINT ck_frota_produto_abast_unidade CHECK (unidade IN ('L', 'UN')),
    CONSTRAINT ck_frota_produto_abast_combustivel CHECK (
        combustivel IS NULL OR (categoria = 'COMBUSTIVEL' AND combustivel IN ('DIESEL_S10', 'DIESEL_S500', 'GASOLINA', 'ETANOL', 'GNV')))
);
CREATE UNIQUE INDEX uk_frota_produto_abast_nome ON frota_produtos_abastecimento (lower(nome)) WHERE ativo;

INSERT INTO frota_produtos_abastecimento (id, nome, categoria, unidade, combustivel, versao, data_criacao, usuario_criacao, ativo)
VALUES
    (gen_random_uuid(), 'Diesel S10', 'COMBUSTIVEL', 'L', 'DIESEL_S10', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE),
    (gen_random_uuid(), 'Diesel S500', 'COMBUSTIVEL', 'L', 'DIESEL_S500', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE),
    (gen_random_uuid(), 'Gasolina comum', 'COMBUSTIVEL', 'L', 'GASOLINA', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE),
    (gen_random_uuid(), 'Etanol', 'COMBUSTIVEL', 'L', 'ETANOL', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE),
    (gen_random_uuid(), 'GNV', 'COMBUSTIVEL', 'L', 'GNV', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE),
    (gen_random_uuid(), 'ARLA 32', 'ARLA', 'L', NULL, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE),
    (gen_random_uuid(), 'Óleo do motor', 'OLEO', 'L', NULL, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE),
    (gen_random_uuid(), 'Óleo hidráulico', 'OLEO', 'L', NULL, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE),
    (gen_random_uuid(), 'Fluido de freio', 'FLUIDO', 'L', NULL, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE),
    (gen_random_uuid(), 'Fluido de arrefecimento', 'FLUIDO', 'L', NULL, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);

-- ── Carteiras de aprovação (quem aprova quais placas) ─────────────────────────────
CREATE TABLE frota_carteiras_aprovacao (
    id UUID PRIMARY KEY,
    id_usuario UUID NOT NULL REFERENCES usuarios(id),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uk_frota_carteira_usuario ON frota_carteiras_aprovacao (id_usuario) WHERE ativo;

-- Placas gravadas uma a uma, mesmo quando incluídas pelo atalho da base: placa nova na base
-- não entra sozinha (resposta do cliente, 15/10/2026).
CREATE TABLE frota_carteira_placas (
    id_carteira UUID NOT NULL REFERENCES frota_carteiras_aprovacao(id),
    id_veiculo UUID NOT NULL REFERENCES veiculos(id),
    PRIMARY KEY (id_carteira, id_veiculo)
);
CREATE INDEX idx_frota_carteira_placas_veiculo ON frota_carteira_placas (id_veiculo);

-- ── Abastecimentos ────────────────────────────────────────────────────────────────
CREATE TABLE frota_abastecimentos (
    id UUID PRIMARY KEY,
    -- Gerado no aparelho: reenviar a mesma solicitação não duplica.
    id_aparelho UUID NOT NULL UNIQUE,
    id_veiculo UUID NOT NULL REFERENCES veiculos(id),
    id_base_operacional UUID REFERENCES bases_operacionais(id),
    id_condutor UUID NOT NULL REFERENCES colaboradores(id),
    id_usuario_solicitante UUID NOT NULL,
    id_equipe UUID REFERENCES equipes(id),
    id_posto UUID NOT NULL REFERENCES frota_postos(id),
    situacao VARCHAR(25) NOT NULL DEFAULT 'AGUARDANDO_APROVACAO',
    solicitado_em TIMESTAMP WITH TIME ZONE NOT NULL,
    medicao_solicitacao NUMERIC(12, 1) NOT NULL,
    observacao VARCHAR(500),
    id_usuario_aprovacao UUID,
    aprovado_em TIMESTAMP WITH TIME ZONE,
    motivo_reprovacao VARCHAR(500),
    id_usuario_liberacao UUID,
    liberado_em TIMESTAMP WITH TIME ZONE,
    vence_em TIMESTAMP WITH TIME ZONE,
    id_usuario_cancelamento UUID,
    cancelado_em TIMESTAMP WITH TIME ZONE,
    motivo_cancelamento VARCHAR(500),
    realizado_em TIMESTAMP WITH TIME ZONE,
    medicao_realizado NUMERIC(12, 1),
    id_leitura_odometro UUID,
    id_fatura UUID,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_abast_situacao CHECK (situacao IN (
        'AGUARDANDO_APROVACAO', 'APROVADA', 'REPROVADA', 'LIBERADA', 'REALIZADA', 'CANCELADA', 'VENCIDA')),
    CONSTRAINT ck_frota_abast_reprovada CHECK (situacao <> 'REPROVADA' OR motivo_reprovacao IS NOT NULL),
    CONSTRAINT ck_frota_abast_cancelada CHECK (situacao <> 'CANCELADA' OR cancelado_em IS NOT NULL),
    CONSTRAINT ck_frota_abast_realizada CHECK (situacao <> 'REALIZADA' OR (realizado_em IS NOT NULL AND medicao_realizado IS NOT NULL))
);
-- Uma solicitação em andamento por veículo.
CREATE UNIQUE INDEX uk_frota_abast_aberta_veiculo ON frota_abastecimentos (id_veiculo)
    WHERE ativo AND situacao IN ('AGUARDANDO_APROVACAO', 'APROVADA', 'LIBERADA');
CREATE INDEX idx_frota_abast_situacao ON frota_abastecimentos (situacao, solicitado_em);
CREATE INDEX idx_frota_abast_posto ON frota_abastecimentos (id_posto, realizado_em) WHERE situacao = 'REALIZADA';
CREATE INDEX idx_frota_abast_veiculo ON frota_abastecimentos (id_veiculo, solicitado_em);

CREATE TABLE frota_abastecimento_itens (
    id UUID PRIMARY KEY,
    id_abastecimento UUID NOT NULL REFERENCES frota_abastecimentos(id),
    ordem INTEGER NOT NULL,
    id_produto_pedido UUID NOT NULL REFERENCES frota_produtos_abastecimento(id),
    quantidade_pedida NUMERIC(10, 2) NOT NULL,
    -- Preenchidos no realizado (o combustível pode mudar no posto).
    id_produto UUID REFERENCES frota_produtos_abastecimento(id),
    quantidade NUMERIC(10, 2),
    valor_total NUMERIC(12, 2),
    valor_unitario NUMERIC(12, 3),
    tanque_cheio BOOLEAN,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_abast_item_pedido CHECK (quantidade_pedida > 0),
    CONSTRAINT ck_frota_abast_item_realizado CHECK (quantidade IS NULL OR (quantidade >= 0 AND valor_total >= 0))
);
CREATE INDEX idx_frota_abast_itens_abast ON frota_abastecimento_itens (id_abastecimento);

CREATE TABLE frota_abastecimento_fotos (
    id UUID PRIMARY KEY,
    id_abastecimento UUID NOT NULL REFERENCES frota_abastecimentos(id),
    -- Id gerado no aparelho, único no abastecimento: reenviar a foto não duplica.
    id_aparelho UUID NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    arquivo_chave VARCHAR(500),
    arquivo_nome VARCHAR(255),
    arquivo_content_type VARCHAR(120),
    arquivo_tamanho_bytes BIGINT,
    -- SHA-256 do arquivo: a mesma foto em outro abastecimento vira alerta.
    hash_arquivo VARCHAR(64),
    recebida_em TIMESTAMP WITH TIME ZONE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_abast_foto_tipo CHECK (tipo IN ('PAINEL_ANTES', 'PAINEL_DEPOIS', 'CUPOM')),
    CONSTRAINT uk_frota_abast_foto_aparelho UNIQUE (id_abastecimento, id_aparelho)
);
CREATE INDEX idx_frota_abast_fotos_hash ON frota_abastecimento_fotos (hash_arquivo) WHERE hash_arquivo IS NOT NULL;

CREATE TABLE frota_abastecimento_alertas (
    id UUID PRIMARY KEY,
    id_abastecimento UUID NOT NULL REFERENCES frota_abastecimentos(id),
    tipo VARCHAR(40) NOT NULL,
    -- PROGRAMATICO hoje; IA quando a leitura das fotos entrar.
    origem VARCHAR(20) NOT NULL DEFAULT 'PROGRAMATICO',
    etapa VARCHAR(20) NOT NULL,
    mensagem VARCHAR(500) NOT NULL,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_abast_alerta_origem CHECK (origem IN ('PROGRAMATICO', 'IA')),
    CONSTRAINT ck_frota_abast_alerta_etapa CHECK (etapa IN ('SOLICITACAO', 'REALIZADO'))
);
CREATE INDEX idx_frota_abast_alertas_abast ON frota_abastecimento_alertas (id_abastecimento);

CREATE TABLE frota_abastecimento_avisos_posto (
    id UUID PRIMARY KEY,
    id_abastecimento UUID NOT NULL REFERENCES frota_abastecimentos(id),
    motivo VARCHAR(20) NOT NULL,
    situacao VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
    whatsapp VARCHAR(20),
    mensagem VARCHAR(1000) NOT NULL,
    id_mensagem_externa VARCHAR(120),
    erro VARCHAR(500),
    tentativas INTEGER NOT NULL DEFAULT 0,
    enviado_em TIMESTAMP WITH TIME ZONE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_abast_aviso_motivo CHECK (motivo IN ('LIBERACAO', 'CANCELAMENTO')),
    CONSTRAINT ck_frota_abast_aviso_situacao CHECK (situacao IN ('PENDENTE', 'ENVIADO', 'FALHOU'))
);
CREATE INDEX idx_frota_abast_avisos_abast ON frota_abastecimento_avisos_posto (id_abastecimento);

-- ── Faturas do posto ──────────────────────────────────────────────────────────────
CREATE TABLE frota_faturas_posto (
    id UUID PRIMARY KEY,
    id_posto UUID NOT NULL REFERENCES frota_postos(id),
    numero VARCHAR(60) NOT NULL,
    periodo_inicio DATE NOT NULL,
    periodo_fim DATE NOT NULL,
    valor NUMERIC(14, 2) NOT NULL,
    situacao VARCHAR(25) NOT NULL DEFAULT 'RASCUNHO',
    arquivo_chave VARCHAR(500),
    arquivo_nome VARCHAR(255),
    conferida_em TIMESTAMP WITH TIME ZONE,
    id_usuario_conferencia UUID,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_fatura_posto_situacao CHECK (situacao IN ('RASCUNHO', 'CONFERIDA', 'ENVIADA_AO_FINANCEIRO')),
    CONSTRAINT ck_frota_fatura_posto_periodo CHECK (periodo_fim >= periodo_inicio)
);
CREATE UNIQUE INDEX uk_frota_fatura_posto_numero ON frota_faturas_posto (id_posto, numero) WHERE ativo;

ALTER TABLE frota_abastecimentos
    ADD CONSTRAINT fk_frota_abast_fatura FOREIGN KEY (id_fatura) REFERENCES frota_faturas_posto(id);

-- ── Permissões ────────────────────────────────────────────────────────────────────
INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
SELECT gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, nome
FROM (VALUES ('frota:abastecimento:read'), ('frota:abastecimento:solicitar'), ('frota:abastecimento:aprovar'),
             ('frota:abastecimento:liberar'), ('frota:abastecimento:configurar')) AS p(nome)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE (perfil.nome IN ('ADMINISTRADOR', 'GESTOR_FROTA') AND permissao.nome LIKE 'frota:abastecimento:%')
   OR (perfil.nome = 'OPERACAO_FROTA' AND permissao.nome IN ('frota:abastecimento:read', 'frota:abastecimento:liberar'))
ON CONFLICT DO NOTHING;

-- ── Regras de aviso (texto final antes da conversão em automação) ─────────────────
DO $$
DECLARE
    v_regra UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM regras_notificacao WHERE chave_gatilho = 'frota.abastecimento_solicitado' AND sistema = TRUE) THEN
        v_regra := gen_random_uuid();
        INSERT INTO regras_notificacao (
            id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
            titulo_template, corpo_template, deeplink_template, limiar,
            cooldown_minutos, enviar_email, versao, data_criacao, usuario_criacao, ativo)
        VALUES (
            v_regra, 'frota.abastecimento_solicitado', 'Abastecimento para aprovar',
            'Avisa quem tem a placa na carteira de aprovação quando chega uma solicitação.',
            TRUE, 'APROVACAO', 'ALTA',
            'Abastecimento de {{placa}} para aprovar',
            '{{solicitante}} pediu {{itens}} no {{posto}}.{{alertas}}',
            '{{link}}', NULL, 0, FALSE, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
        INSERT INTO destinatarios_regra_notificacao (
            id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'PAPEL_DINAMICO', NULL, 'aprovadores', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM regras_notificacao WHERE chave_gatilho = 'frota.abastecimento_aprovado' AND sistema = TRUE) THEN
        v_regra := gen_random_uuid();
        INSERT INTO regras_notificacao (
            id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
            titulo_template, corpo_template, deeplink_template, limiar,
            cooldown_minutos, enviar_email, versao, data_criacao, usuario_criacao, ativo)
        VALUES (
            v_regra, 'frota.abastecimento_aprovado', 'Abastecimento para liberar',
            'Avisa quem libera abastecimentos quando uma solicitação é aprovada.',
            TRUE, 'OPERACIONAL', 'ALTA',
            'Abastecimento de {{placa}} aprovado: falta liberar',
            '{{itens}} no {{posto}}, aprovado por {{aprovador}}.',
            '{{link}}', NULL, 0, FALSE, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
        INSERT INTO destinatarios_regra_notificacao (
            id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'PERMISSAO', NULL, 'frota:abastecimento:liberar', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM regras_notificacao WHERE chave_gatilho = 'frota.abastecimento_atualizado' AND sistema = TRUE) THEN
        v_regra := gen_random_uuid();
        INSERT INTO regras_notificacao (
            id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
            titulo_template, corpo_template, deeplink_template, limiar,
            cooldown_minutos, enviar_email, versao, data_criacao, usuario_criacao, ativo)
        VALUES (
            v_regra, 'frota.abastecimento_atualizado', 'Andamento do abastecimento',
            'Avisa quem solicitou quando o abastecimento é reprovado, liberado, cancelado ou vence.',
            TRUE, 'OPERACIONAL', 'NORMAL',
            'Abastecimento de {{placa}}: {{situacao}}',
            '{{detalhe}}',
            '{{link}}', NULL, 0, FALSE, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
        INSERT INTO destinatarios_regra_notificacao (
            id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'PAPEL_DINAMICO', NULL, 'solicitante', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    END IF;
END $$;

-- Solicitar abastecimento vale para qualquer usuário do app, como o checklist (resposta do
-- cliente: "as solicitações passam pela solicitação do colaborador no app"). A permissão
-- 'frota:abastecimento:solicitar' da V186 ficaria sem uso; sai aqui.
-- Rollback: recriar a permissão e o vínculo com ADMINISTRADOR e GESTOR_FROTA (ver V186).
DELETE FROM perfil_permissoes
 WHERE id_permissao IN (SELECT id FROM permissoes WHERE nome = 'frota:abastecimento:solicitar');

DELETE FROM permissoes WHERE nome = 'frota:abastecimento:solicitar';

