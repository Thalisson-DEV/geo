-- Telemetria (change modulo-gestao-frota-telemetria, Fase 5): rastreadores da Ubicaly e da Zuq
-- casados com a frota, posições, eventos de condução e a situação da sincronização de cada
-- provedor. As chaves dos provedores ficam só nas variáveis de ambiente.
-- Aditiva. A V211 é da change rh-medidas-disciplinares (out-of-order ligado).
-- Posições: dado bruto de sensor, sem auditoria por linha (como telemetria_mobile). Retenção de
-- 180 dias (ADR 0001, seção 7): o job diário apaga as mais antigas. É a única exclusão física
-- da frota, exigida pela LGPD; eventos de condução não são apagados.
-- Rollback: DROP das tabelas frota_telemetria_eventos, frota_telemetria_posicoes,
-- frota_telemetria_rastreadores e frota_telemetria_sincronizacoes (nesta ordem), DELETE das
-- permissões 'frota:telemetria:%' e das regras 'frota.telemetria_falha' e 'frota.telemetria_evento'.

-- ── Rastreadores: vínculo com o veículo e último estado ─────────────────────────────
CREATE TABLE frota_telemetria_rastreadores (
    id UUID PRIMARY KEY,
    provedor VARCHAR(20) NOT NULL,
    id_externo VARCHAR(40) NOT NULL,
    placa_provedor VARCHAR(20),
    nome_provedor VARCHAR(160),
    id_veiculo UUID REFERENCES veiculos(id),
    situacao VARCHAR(20) NOT NULL,
    vinculo_manual BOOLEAN NOT NULL DEFAULT FALSE,
    ultima_comunicacao TIMESTAMP WITH TIME ZONE,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    velocidade_kmh NUMERIC(6, 1),
    ignicao BOOLEAN,
    odometro_metros BIGINT CHECK (odometro_metros IS NULL OR odometro_metros >= 0),
    horimetro_horas NUMERIC(12, 1) CHECK (horimetro_horas IS NULL OR horimetro_horas >= 0),
    motorista_externo VARCHAR(40),
    motorista_nome VARCHAR(160),
    id_colaborador_motorista UUID,
    leitura_registrada_em TIMESTAMP WITH TIME ZONE,
    eventos_ate TIMESTAMP WITH TIME ZONE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_telemetria_rastreador_provedor CHECK (provedor IN ('UBICALY', 'ZUQ')),
    CONSTRAINT ck_frota_telemetria_rastreador_situacao CHECK (situacao IN ('VINCULADO', 'SEM_VEICULO', 'IGNORADO')),
    CONSTRAINT ck_frota_telemetria_rastreador_vinculo CHECK ((situacao = 'VINCULADO') = (id_veiculo IS NOT NULL))
);

CREATE UNIQUE INDEX uk_frota_telemetria_rastreadores ON frota_telemetria_rastreadores (provedor, id_externo);
CREATE INDEX idx_frota_telemetria_rastreadores_veiculo ON frota_telemetria_rastreadores (id_veiculo) WHERE id_veiculo IS NOT NULL;

-- ── Posições (série para o km e o consumo; 180 dias) ────────────────────────────────
CREATE TABLE frota_telemetria_posicoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_rastreador UUID NOT NULL REFERENCES frota_telemetria_rastreadores(id),
    lido_em TIMESTAMP WITH TIME ZONE NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    velocidade_kmh NUMERIC(6, 1),
    ignicao BOOLEAN,
    odometro_metros BIGINT,
    horimetro_horas NUMERIC(12, 1),
    recebido_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uk_frota_telemetria_posicoes ON frota_telemetria_posicoes (id_rastreador, lido_em);
CREATE INDEX idx_frota_telemetria_posicoes_lido ON frota_telemetria_posicoes (lido_em);

COMMENT ON TABLE frota_telemetria_posicoes IS 'Posições dos rastreadores da frota. Retenção de 180 dias (LGPD).';

-- ── Eventos de condução ─────────────────────────────────────────────────────────────
CREATE TABLE frota_telemetria_eventos (
    id UUID PRIMARY KEY,
    provedor VARCHAR(20) NOT NULL,
    id_externo VARCHAR(80) NOT NULL,
    id_rastreador UUID NOT NULL REFERENCES frota_telemetria_rastreadores(id),
    id_veiculo UUID REFERENCES veiculos(id),
    placa VARCHAR(20),
    tipo VARCHAR(30) NOT NULL,
    ocorrido_em TIMESTAMP WITH TIME ZONE NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    endereco VARCHAR(300),
    velocidade_kmh NUMERIC(6, 1),
    limite_kmh NUMERIC(6, 1),
    duracao_segundos INTEGER,
    descricao VARCHAR(500),
    motorista_nome VARCHAR(160),
    id_colaborador UUID,
    origem_condutor VARCHAR(20),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_telemetria_evento_provedor CHECK (provedor IN ('UBICALY', 'ZUQ')),
    CONSTRAINT ck_frota_telemetria_evento_tipo CHECK (tipo IN ('EXCESSO_VELOCIDADE', 'FRENAGEM_BRUSCA', 'ACELERACAO_BRUSCA',
        'CURVA_BRUSCA', 'CONDUCAO_AGRESSIVA', 'MOTOR_LIGADO_PARADO', 'PANICO', 'SEM_MOTORISTA', 'DESCONEXAO_BATERIA')),
    CONSTRAINT ck_frota_telemetria_evento_origem CHECK (origem_condutor IS NULL OR origem_condutor IN ('PROVEDOR', 'VINCULO')),
    CONSTRAINT ck_frota_telemetria_evento_condutor CHECK ((origem_condutor IS NULL) = (id_colaborador IS NULL))
);

CREATE UNIQUE INDEX uk_frota_telemetria_eventos ON frota_telemetria_eventos (provedor, id_externo);
CREATE INDEX idx_frota_telemetria_eventos_ocorrido ON frota_telemetria_eventos (ocorrido_em DESC);
CREATE INDEX idx_frota_telemetria_eventos_veiculo ON frota_telemetria_eventos (id_veiculo, ocorrido_em DESC);
CREATE INDEX idx_frota_telemetria_eventos_colaborador ON frota_telemetria_eventos (id_colaborador, ocorrido_em DESC)
    WHERE id_colaborador IS NOT NULL;

-- ── Situação da sincronização por provedor e rotina ─────────────────────────────────
CREATE TABLE frota_telemetria_sincronizacoes (
    id UUID PRIMARY KEY,
    provedor VARCHAR(20) NOT NULL,
    rotina VARCHAR(20) NOT NULL,
    situacao VARCHAR(20) NOT NULL,
    ultima_execucao TIMESTAMP WITH TIME ZONE,
    ultimo_sucesso TIMESTAMP WITH TIME ZONE,
    mensagem VARCHAR(500),
    falhas_seguidas INTEGER NOT NULL DEFAULT 0,
    itens INTEGER NOT NULL DEFAULT 0,
    falha_avisada_em TIMESTAMP WITH TIME ZONE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_telemetria_sincronizacao_provedor CHECK (provedor IN ('UBICALY', 'ZUQ')),
    CONSTRAINT ck_frota_telemetria_sincronizacao_rotina CHECK (rotina IN ('VEICULOS', 'EVENTOS')),
    CONSTRAINT ck_frota_telemetria_sincronizacao_situacao CHECK (situacao IN ('OK', 'ERRO', 'NAO_CONFIGURADO'))
);

CREATE UNIQUE INDEX uk_frota_telemetria_sincronizacoes ON frota_telemetria_sincronizacoes (provedor, rotina);

-- ── Permissões ──────────────────────────────────────────────────────────────────────
INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
SELECT gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, nome
FROM (VALUES ('frota:telemetria:read'), ('frota:telemetria:write')) AS p(nome)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE (perfil.nome IN ('ADMINISTRADOR', 'GESTOR_FROTA') AND permissao.nome LIKE 'frota:telemetria:%')
   OR (perfil.nome = 'OPERACAO_FROTA' AND permissao.nome = 'frota:telemetria:read')
ON CONFLICT DO NOTHING;

-- ── Regras de fábrica ───────────────────────────────────────────────────────────────
-- Falha: ligada, um aviso por incidente. Evento: desligada, para o gestor escolher os tipos.
DO $$
DECLARE
    v_regra UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM regras_notificacao WHERE chave_gatilho = 'frota.telemetria_falha' AND sistema = TRUE) THEN
        v_regra := gen_random_uuid();
        INSERT INTO regras_notificacao (
            id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
            titulo_template, corpo_template, deeplink_template, limiar,
            cooldown_minutos, enviar_email, versao, data_criacao, usuario_criacao, ativo)
        VALUES (
            v_regra, 'frota.telemetria_falha', 'Telemetria sem sincronizar',
            'Avisa a frota, uma vez por incidente, quando um provedor de telemetria fica mais de uma hora sem sincronizar.',
            TRUE, 'OPERACIONAL', 'ALTA',
            'Telemetria {{provedor}} sem sincronizar',
            'A {{provedor}} não sincroniza desde {{desde}}. Último erro: {{mensagem}}',
            '{{link}}', NULL, 0, TRUE, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
        INSERT INTO destinatarios_regra_notificacao (
            id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'PERMISSAO', NULL, 'frota:telemetria:write', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM regras_notificacao WHERE chave_gatilho = 'frota.telemetria_evento' AND sistema = TRUE) THEN
        v_regra := gen_random_uuid();
        INSERT INTO regras_notificacao (
            id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
            titulo_template, corpo_template, deeplink_template, limiar,
            cooldown_minutos, enviar_email, versao, data_criacao, usuario_criacao, ativo, data_desativacao)
        VALUES (
            v_regra, 'frota.telemetria_evento', 'Evento de condução',
            'Avisa a frota a cada evento de condução vindo da telemetria. Vem desligada: ligue escolhendo os tipos que interessam.',
            TRUE, 'OPERACIONAL', 'NORMAL',
            '{{tipo}}: {{placa}}',
            '{{tipo}} do {{placa}} em {{ocorridoEm}} ({{condutor}}). {{detalhe}}',
            '{{link}}', NULL, 0, FALSE, 0, CURRENT_TIMESTAMP, 'SISTEMA', FALSE, CURRENT_TIMESTAMP);
        INSERT INTO destinatarios_regra_notificacao (
            id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'PERMISSAO', NULL, 'frota:telemetria:read', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    END IF;
END $$;

