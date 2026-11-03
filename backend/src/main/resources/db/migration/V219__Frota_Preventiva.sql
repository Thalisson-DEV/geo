-- Preventiva (change modulo-gestao-frota-preventiva, Fase 3): planos por tipo de veículo ou de
-- implemento, frequência por km, horas e/ou dias, controle por veículo e plano, realizações
-- (informadas ou por OS) e o aviso 'frota.preventiva_proxima'.
-- Aditiva. A V209 fica para a change rh-medidas-disciplinares (out-of-order ligado).
-- Rollback: DROP das tabelas frota_preventiva_realizacoes, frota_preventiva_controles,
-- frota_plano_preventivo_tarefas, frota_plano_preventivo_itens,
-- frota_plano_preventivo_tipos_implemento, frota_plano_preventivo_tipos_veiculo e
-- frota_planos_preventivos (nesta ordem), DELETE das permissões 'frota:preventiva:%' e da
-- regra 'frota.preventiva_proxima'.

-- ── Planos ────────────────────────────────────────────────────────────────────────
CREATE TABLE frota_planos_preventivos (
    id UUID PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    descricao VARCHAR(1000),
    intervalo_km BIGINT CHECK (intervalo_km IS NULL OR intervalo_km > 0),
    intervalo_horas BIGINT CHECK (intervalo_horas IS NULL OR intervalo_horas > 0),
    intervalo_dias INTEGER CHECK (intervalo_dias IS NULL OR intervalo_dias > 0),
    antecedencia_km BIGINT CHECK (antecedencia_km IS NULL OR antecedencia_km >= 0),
    antecedencia_horas BIGINT CHECK (antecedencia_horas IS NULL OR antecedencia_horas >= 0),
    antecedencia_dias INTEGER CHECK (antecedencia_dias IS NULL OR antecedencia_dias >= 0),
    criticidade VARCHAR(20) NOT NULL DEFAULT 'MEDIA',
    abrir_os_automaticamente BOOLEAN NOT NULL DEFAULT FALSE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_plano_preventivo_frequencia
        CHECK (intervalo_km IS NOT NULL OR intervalo_horas IS NOT NULL OR intervalo_dias IS NOT NULL),
    CONSTRAINT ck_frota_plano_preventivo_criticidade CHECK (criticidade IN ('URGENTE', 'ALTA', 'MEDIA', 'BAIXA'))
);
CREATE UNIQUE INDEX uk_frota_planos_preventivos_nome ON frota_planos_preventivos (UPPER(nome));

CREATE TABLE frota_plano_preventivo_tipos_veiculo (
    id_plano UUID NOT NULL REFERENCES frota_planos_preventivos(id),
    id_tipo_veiculo UUID NOT NULL REFERENCES frota_tipos_veiculo(id),
    PRIMARY KEY (id_plano, id_tipo_veiculo)
);

CREATE TABLE frota_plano_preventivo_tipos_implemento (
    id_plano UUID NOT NULL REFERENCES frota_planos_preventivos(id),
    id_tipo_implemento UUID NOT NULL REFERENCES frota_tipos_implemento(id),
    PRIMARY KEY (id_plano, id_tipo_implemento)
);

-- Itens de manutenção que a OS preventiva leva, na ordem do cadastro.
CREATE TABLE frota_plano_preventivo_itens (
    id_plano UUID NOT NULL REFERENCES frota_planos_preventivos(id),
    ordem INTEGER NOT NULL,
    id_item UUID NOT NULL REFERENCES frota_itens_manutencao(id),
    PRIMARY KEY (id_plano, ordem)
);

-- Roteiro de inspeção: tarefas em ordem, copiadas para a OS na abertura.
CREATE TABLE frota_plano_preventivo_tarefas (
    id_plano UUID NOT NULL REFERENCES frota_planos_preventivos(id),
    ordem INTEGER NOT NULL,
    texto VARCHAR(300) NOT NULL,
    PRIMARY KEY (id_plano, ordem)
);

-- ── Controle por veículo e plano ──────────────────────────────────────────────────
CREATE TABLE frota_preventiva_controles (
    id UUID PRIMARY KEY,
    id_veiculo UUID NOT NULL REFERENCES veiculos(id),
    id_plano UUID NOT NULL REFERENCES frota_planos_preventivos(id),
    -- Base do ciclo atual: a próxima realização conta a partir daqui.
    base_data DATE NOT NULL,
    -- Medição acumulada (soma os painéis anteriores da mesma unidade); nula enquanto o veículo não tem leitura.
    base_medicao BIGINT CHECK (base_medicao IS NULL OR base_medicao >= 0),
    base_unidade VARCHAR(10) NOT NULL,
    base_origem VARCHAR(20) NOT NULL,
    id_realizacao_aberta UUID,
    avisado_proxima_em DATE,
    avisado_vencida_em DATE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_preventiva_controle_unidade CHECK (base_unidade IN ('KM', 'HORAS')),
    CONSTRAINT ck_frota_preventiva_controle_origem CHECK (base_origem IN ('INICIO', 'INFORMADA', 'ORDEM_SERVICO'))
);
CREATE UNIQUE INDEX uk_frota_preventiva_controles ON frota_preventiva_controles (id_veiculo, id_plano);
CREATE INDEX idx_frota_preventiva_controles_plano ON frota_preventiva_controles (id_plano) WHERE ativo;

CREATE TABLE frota_preventiva_realizacoes (
    id UUID PRIMARY KEY,
    id_controle UUID NOT NULL REFERENCES frota_preventiva_controles(id),
    origem VARCHAR(20) NOT NULL,
    situacao VARCHAR(20) NOT NULL,
    id_ordem_servico UUID REFERENCES frota_ordens_servico(id),
    roteiro VARCHAR(16000),
    realizada_em DATE,
    medicao BIGINT CHECK (medicao IS NULL OR medicao >= 0),
    unidade VARCHAR(10) NOT NULL,
    observacao VARCHAR(1000),
    id_usuario UUID,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_preventiva_realizacao_origem CHECK (origem IN ('INFORMADA', 'ORDEM_SERVICO')),
    CONSTRAINT ck_frota_preventiva_realizacao_situacao CHECK (situacao IN ('ABERTA', 'CONCLUIDA', 'CANCELADA')),
    CONSTRAINT ck_frota_preventiva_realizacao_os CHECK ((origem = 'ORDEM_SERVICO') = (id_ordem_servico IS NOT NULL)),
    CONSTRAINT ck_frota_preventiva_realizacao_data CHECK (situacao <> 'CONCLUIDA' OR realizada_em IS NOT NULL)
);
CREATE INDEX idx_frota_preventiva_realizacoes_controle ON frota_preventiva_realizacoes (id_controle, data_criacao DESC);
CREATE INDEX idx_frota_preventiva_realizacoes_os ON frota_preventiva_realizacoes (id_ordem_servico) WHERE id_ordem_servico IS NOT NULL;

-- ── Permissões ────────────────────────────────────────────────────────────────────
INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
SELECT gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, nome
FROM (VALUES ('frota:preventiva:read'), ('frota:preventiva:write')) AS p(nome)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE (perfil.nome IN ('ADMINISTRADOR', 'GESTOR_FROTA') AND permissao.nome LIKE 'frota:preventiva:%')
   OR (perfil.nome IN ('OPERACAO_FROTA', 'OFICINA_FROTA') AND permissao.nome = 'frota:preventiva:read')
ON CONFLICT DO NOTHING;

-- ── Regra de aviso de preventiva próxima ou vencida ───────────────────────────────
DO $$
DECLARE
    v_regra UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM regras_notificacao WHERE chave_gatilho = 'frota.preventiva_proxima' AND sistema = TRUE) THEN
        v_regra := gen_random_uuid();
        INSERT INTO regras_notificacao (
            id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
            titulo_template, corpo_template, deeplink_template, limiar,
            cooldown_minutos, enviar_email, versao, data_criacao, usuario_criacao, ativo)
        VALUES (
            v_regra, 'frota.preventiva_proxima', 'Preventiva próxima ou vencida',
            'Avisa a frota, uma vez por etapa em cada ciclo, quando a preventiva de um veículo fica próxima ou vence.',
            TRUE, 'OPERACIONAL', 'NORMAL',
            'Preventiva {{situacao}}: {{plano}} do {{placa}}',
            '{{plano}} do {{placa}} ({{base}}): {{falta}}.',
            '{{link}}', NULL, 0, FALSE, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
        INSERT INTO destinatarios_regra_notificacao (
            id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'PERMISSAO', NULL, 'frota:preventiva:read', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    END IF;
END $$;

