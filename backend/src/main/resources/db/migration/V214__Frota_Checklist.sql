-- V182: módulo de frota — checklist do veículo (openspec/changes/modulo-gestao-frota-checklist).
--
-- Aditiva. Modelos começam vazios (criados na tela de configurações).
-- Rollback: DROP das tabelas frota_checklist_* e frota_liberacoes_cnh (ordem inversa), DELETE das
-- permissões 'frota:checklist:%' e da regra 'frota.checklist_ausente'.

-- ── Modelos ───────────────────────────────────────────────────────────────────────
CREATE TABLE frota_checklist_modelos (
    id UUID PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    instrucoes VARCHAR(2000),
    -- Confirmação de quem preencheu (o login) antes de enviar.
    exige_assinatura BOOLEAN NOT NULL DEFAULT FALSE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_checklist_modelo_tipo CHECK (tipo IN ('PRINCIPAL', 'ADICIONAL'))
);
CREATE UNIQUE INDEX uk_frota_checklist_modelo_nome ON frota_checklist_modelos (UPPER(nome));

-- Vazio = vale para todos os tipos.
CREATE TABLE frota_checklist_modelo_tipos_veiculo (
    id_modelo UUID NOT NULL REFERENCES frota_checklist_modelos(id),
    id_tipo_veiculo UUID NOT NULL REFERENCES frota_tipos_veiculo(id),
    PRIMARY KEY (id_modelo, id_tipo_veiculo)
);

CREATE TABLE frota_checklist_modelo_tipos_implemento (
    id_modelo UUID NOT NULL REFERENCES frota_checklist_modelos(id),
    id_tipo_implemento UUID NOT NULL REFERENCES frota_tipos_implemento(id),
    PRIMARY KEY (id_modelo, id_tipo_implemento)
);

CREATE TABLE frota_checklist_perguntas (
    id UUID PRIMARY KEY,
    id_modelo UUID NOT NULL REFERENCES frota_checklist_modelos(id),
    ordem INTEGER NOT NULL CHECK (ordem >= 0),
    grupo VARCHAR(80),
    texto VARCHAR(300) NOT NULL,
    tipo_resposta VARCHAR(20) NOT NULL,
    foto_no_nao_ok BOOLEAN NOT NULL DEFAULT FALSE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_checklist_pergunta_tipo CHECK (tipo_resposta IN ('OK_NOK', 'OPCOES', 'TEXTO')),
    CONSTRAINT ck_frota_checklist_pergunta_foto CHECK (NOT foto_no_nao_ok OR tipo_resposta = 'OK_NOK')
);
CREATE INDEX idx_frota_checklist_perguntas_modelo ON frota_checklist_perguntas (id_modelo, ordem);

-- Opções personalizadas (OPCOES) e motivos pré-definidos do Não OK (OK_NOK).
CREATE TABLE frota_checklist_alternativas (
    id UUID PRIMARY KEY,
    id_pergunta UUID NOT NULL REFERENCES frota_checklist_perguntas(id),
    tipo VARCHAR(10) NOT NULL,
    ordem INTEGER NOT NULL CHECK (ordem >= 0),
    texto VARCHAR(120) NOT NULL,
    -- Opção que conta como problema (gera pendência como um Não OK).
    indica_problema BOOLEAN NOT NULL DEFAULT FALSE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_checklist_alternativa_tipo CHECK (tipo IN ('OPCAO', 'MOTIVO'))
);
CREATE INDEX idx_frota_checklist_alternativas_pergunta ON frota_checklist_alternativas (id_pergunta, tipo, ordem);

-- ── Checklists preenchidos ────────────────────────────────────────────────────────
-- O id vem do aparelho: reenviar o mesmo checklist não duplica.
CREATE TABLE frota_checklists (
    id UUID PRIMARY KEY,
    id_veiculo UUID NOT NULL REFERENCES veiculos(id),
    -- Placa e base na hora do checklist, para listas e filtros sem atravessar o RH.
    placa VARCHAR(10) NOT NULL,
    id_base_operacional UUID REFERENCES bases_operacionais(id),
    id_modelo UUID NOT NULL REFERENCES frota_checklist_modelos(id),
    modelo_nome VARCHAR(120) NOT NULL,
    id_condutor UUID NOT NULL REFERENCES colaboradores(id),
    id_usuario_preenchimento UUID NOT NULL,
    preenchido_em TIMESTAMP WITH TIME ZONE NOT NULL,
    recebido_em TIMESTAMP WITH TIME ZONE NOT NULL,
    medicao BIGINT CHECK (medicao IS NULL OR medicao >= 0),
    unidade_medicao VARCHAR(10) NOT NULL DEFAULT 'KM',
    id_leitura UUID,
    passagem_veiculo BOOLEAN NOT NULL DEFAULT FALSE,
    assinado BOOLEAN NOT NULL DEFAULT FALSE,
    comentario VARCHAR(2000),
    -- Liberação do gestor usada quando a CNH não permitia (vencida/categoria).
    id_liberacao_cnh UUID,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_checklist_unidade CHECK (unidade_medicao IN ('KM', 'HORAS'))
);
CREATE INDEX idx_frota_checklists_veiculo ON frota_checklists (id_veiculo, preenchido_em DESC);
CREATE INDEX idx_frota_checklists_base ON frota_checklists (id_base_operacional, preenchido_em DESC);
CREATE INDEX idx_frota_checklists_condutor ON frota_checklists (id_condutor, preenchido_em DESC);

CREATE TABLE frota_checklist_respostas (
    id UUID PRIMARY KEY,
    id_checklist UUID NOT NULL REFERENCES frota_checklists(id),
    id_pergunta UUID NOT NULL REFERENCES frota_checklist_perguntas(id),
    ordem INTEGER NOT NULL,
    -- Cópia do que foi perguntado e respondido: editar o modelo não reescreve o histórico.
    grupo VARCHAR(80),
    pergunta_texto VARCHAR(300) NOT NULL,
    tipo_resposta VARCHAR(20) NOT NULL,
    conforme BOOLEAN,
    id_alternativa UUID REFERENCES frota_checklist_alternativas(id),
    resposta_texto VARCHAR(500),
    motivo_texto VARCHAR(120),
    comentario VARCHAR(1000),
    problema BOOLEAN NOT NULL DEFAULT FALSE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_frota_checklist_respostas_checklist ON frota_checklist_respostas (id_checklist, ordem);

-- Foto esperada (id do aparelho) e, depois do envio, o arquivo no armazenamento.
CREATE TABLE frota_checklist_fotos (
    id UUID PRIMARY KEY,
    id_checklist UUID NOT NULL REFERENCES frota_checklists(id),
    id_resposta UUID REFERENCES frota_checklist_respostas(id),
    arquivo_chave VARCHAR(500),
    arquivo_nome VARCHAR(255),
    arquivo_content_type VARCHAR(120),
    arquivo_tamanho_bytes BIGINT,
    recebida_em TIMESTAMP WITH TIME ZONE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_frota_checklist_fotos_checklist ON frota_checklist_fotos (id_checklist);

-- ── Pendências de Não OK ──────────────────────────────────────────────────────────
CREATE TABLE frota_checklist_pendencias (
    id UUID PRIMARY KEY,
    id_checklist UUID NOT NULL REFERENCES frota_checklists(id),
    id_resposta UUID NOT NULL UNIQUE REFERENCES frota_checklist_respostas(id),
    id_veiculo UUID NOT NULL REFERENCES veiculos(id),
    id_base_operacional UUID REFERENCES bases_operacionais(id),
    situacao VARCHAR(20) NOT NULL DEFAULT 'ABERTA',
    id_ordem_servico UUID REFERENCES frota_ordens_servico(id),
    justificativa VARCHAR(1000),
    id_usuario_decisao UUID,
    decidida_em TIMESTAMP WITH TIME ZONE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_checklist_pendencia_situacao CHECK (situacao IN ('ABERTA', 'OS_ABERTA', 'DESCARTADA')),
    CONSTRAINT ck_frota_checklist_pendencia_decisao CHECK (
        (situacao = 'ABERTA' AND decidida_em IS NULL)
        OR (situacao = 'OS_ABERTA' AND id_ordem_servico IS NOT NULL AND decidida_em IS NOT NULL)
        OR (situacao = 'DESCARTADA' AND justificativa IS NOT NULL AND decidida_em IS NOT NULL))
);
CREATE INDEX idx_frota_checklist_pendencias_abertas ON frota_checklist_pendencias (id_base_operacional, data_criacao)
    WHERE situacao = 'ABERTA';

-- ── Liberação de CNH pelo gestor (vale para o condutor, o veículo e o dia) ─────────
CREATE TABLE frota_liberacoes_cnh (
    id UUID PRIMARY KEY,
    id_condutor UUID NOT NULL REFERENCES colaboradores(id),
    id_veiculo UUID NOT NULL REFERENCES veiculos(id),
    dia DATE NOT NULL,
    justificativa VARCHAR(1000) NOT NULL,
    id_usuario_liberacao UUID,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uk_frota_liberacao_cnh ON frota_liberacoes_cnh (id_condutor, id_veiculo, dia) WHERE ativo;

-- ── Permissões ────────────────────────────────────────────────────────────────────
-- Preencher pelo app vale para qualquer usuário logado (resposta do cliente, 15/10/2026);
-- aqui ficam a leitura na web e a configuração dos modelos.
INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
SELECT gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, nome
FROM (VALUES ('frota:checklist:read'), ('frota:checklist:configurar')) AS p(nome)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE (perfil.nome IN ('ADMINISTRADOR', 'GESTOR_FROTA') AND permissao.nome LIKE 'frota:checklist:%')
   OR (perfil.nome IN ('OPERACAO_FROTA', 'OFICINA_FROTA') AND permissao.nome = 'frota:checklist:read')
ON CONFLICT DO NOTHING;

-- ── Regra de aviso de veículo sem checklist ───────────────────────────────────────
DO $$
DECLARE
    v_regra UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM regras_notificacao WHERE chave_gatilho = 'frota.checklist_ausente' AND sistema = TRUE) THEN
        v_regra := gen_random_uuid();
        INSERT INTO regras_notificacao (
            id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
            titulo_template, corpo_template, deeplink_template, limiar,
            cooldown_minutos, enviar_email, versao, data_criacao, usuario_criacao, ativo)
        VALUES (
            v_regra, 'frota.checklist_ausente', 'Veículos sem checklist hoje',
            'Avisa a operação, uma vez por dia e por base, dos veículos usados sem checklist do dia.',
            TRUE, 'OPERACIONAL', 'NORMAL',
            '{{quantidade}} veículo(s) sem checklist hoje na base {{base}}',
            'Veículos usados hoje sem checklist na base {{base}}: {{placas}}.',
            '{{link}}', NULL, 0, FALSE, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
        INSERT INTO destinatarios_regra_notificacao (
            id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'PERMISSAO', NULL, 'frota:checklist:read', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    END IF;
END $$;

-- V183: checklist do veículo — fotos de recebimento e pendência resolvida na hora
-- (respostas da operação, 15/10/2026; openspec/changes/modulo-gestao-frota-checklist).
--
-- Aditiva. Na troca de condutor, as fotos de recebimento do modelo são obrigatórias.
-- O "Não OK" resolvido na hora vira OS já concluída, ligada à pendência (situação RESOLVIDA_NA_HORA).
-- Rollback: DROP de frota_checklist_modelo_fotos_recebimento, das colunas novas de frota_checklist_fotos
-- e volta do CHECK de frota_checklist_pendencias.

CREATE TABLE frota_checklist_modelo_fotos_recebimento (
    id UUID PRIMARY KEY,
    id_modelo UUID NOT NULL REFERENCES frota_checklist_modelos(id),
    ordem INTEGER NOT NULL CHECK (ordem >= 0),
    descricao VARCHAR(120) NOT NULL,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_frota_checklist_fotos_recebimento_modelo ON frota_checklist_modelo_fotos_recebimento (id_modelo, ordem);

-- Foto de resposta (Não OK), de recebimento (passagem) ou geral.
ALTER TABLE frota_checklist_fotos
    ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'RESPOSTA',
    ADD COLUMN id_foto_recebimento UUID REFERENCES frota_checklist_modelo_fotos_recebimento(id),
    -- Cópia da descrição pedida (ex.: "Lateral esquerda"), como nas respostas.
    ADD COLUMN descricao VARCHAR(120),
    ADD CONSTRAINT ck_frota_checklist_foto_tipo CHECK (tipo IN ('RESPOSTA', 'RECEBIMENTO', 'GERAL')),
    ADD CONSTRAINT ck_frota_checklist_foto_vinculo CHECK (
        (tipo = 'RESPOSTA' AND id_resposta IS NOT NULL)
        OR (tipo = 'RECEBIMENTO' AND id_resposta IS NULL)
        OR (tipo = 'GERAL' AND id_resposta IS NULL));

ALTER TABLE frota_checklist_pendencias
    DROP CONSTRAINT ck_frota_checklist_pendencia_situacao,
    DROP CONSTRAINT ck_frota_checklist_pendencia_decisao,
    ADD CONSTRAINT ck_frota_checklist_pendencia_situacao
        CHECK (situacao IN ('ABERTA', 'OS_ABERTA', 'RESOLVIDA_NA_HORA', 'DESCARTADA')),
    ADD CONSTRAINT ck_frota_checklist_pendencia_decisao CHECK (
        (situacao = 'ABERTA' AND decidida_em IS NULL)
        OR (situacao IN ('OS_ABERTA', 'RESOLVIDA_NA_HORA') AND id_ordem_servico IS NOT NULL AND decidida_em IS NOT NULL)
        OR (situacao = 'DESCARTADA' AND justificativa IS NOT NULL AND decidida_em IS NOT NULL));

-- V184: checklist do veículo — id gerado no aparelho para o envio idempotente do app
-- (openspec/changes/modulo-gestao-frota-checklist).
--
-- O id das entidades é gerado pelo servidor (BaseEntity); o id do aparelho fica numa coluna
-- própria, única, e é por ele que o app reenvia o checklist e as fotos sem duplicar.
-- Aditiva (as tabelas ainda estão vazias). Rollback: DROP das colunas e dos índices.

ALTER TABLE frota_checklists ADD COLUMN id_aparelho UUID NOT NULL;
CREATE UNIQUE INDEX uk_frota_checklists_id_aparelho ON frota_checklists (id_aparelho);

ALTER TABLE frota_checklist_fotos ADD COLUMN id_aparelho UUID NOT NULL;
CREATE UNIQUE INDEX uk_frota_checklist_fotos_id_aparelho ON frota_checklist_fotos (id_checklist, id_aparelho);

-- Aditiva. Texto do aviso "Veículos sem checklist hoje" sem o plural improvisado ("1 veículo(s)").
-- Só troca o texto se ninguém o editou na tela de regras.
-- Rollback: voltar os templates para os da V182.
UPDATE regras_notificacao
   SET titulo_template = 'Base {{base}}: veículos usados sem checklist hoje',
       corpo_template = 'Sem checklist do dia ({{quantidade}}): {{placas}}.',
       versao = versao + 1,
       data_ultima_alteracao = CURRENT_TIMESTAMP,
       usuario_ultima_alteracao = 'SISTEMA'
 WHERE chave_gatilho = 'frota.checklist_ausente'
   AND sistema = TRUE
   AND titulo_template = '{{quantidade}} veículo(s) sem checklist hoje na base {{base}}';

