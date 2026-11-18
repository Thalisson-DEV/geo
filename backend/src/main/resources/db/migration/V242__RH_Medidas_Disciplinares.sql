-- Medidas disciplinares no RH (change rh-medidas-disciplinares): catálogos de tipo e motivo,
-- medida com ciclo rascunho → aplicada → ciente (ou cancelada), histórico, anexos com SHA-256,
-- parâmetros de reincidência e imediatidade, permissões e as regras de fábrica dos avisos.
-- Aditiva. Rollback: DROP das tabelas rh_medida_disciplinar_anexos, rh_medida_disciplinar_historico,
-- rh_medidas_disciplinares, rh_tipos_medida_disciplinar, rh_motivos_medida_disciplinar e
-- rh_parametros; DELETE das permissões 'rh:medida-disciplinar:%' e das regras 'rh.medida_%'.

-- ── Parâmetros do RH ──────────────────────────────────────────────────────────────
-- Uma única linha, com o id fixo de ParametrosRh.ID_UNICO.
CREATE TABLE rh_parametros (
    id UUID PRIMARY KEY,
    -- Meses para trás em que uma medida do mesmo motivo conta como reincidência.
    janela_reincidencia_meses INTEGER NOT NULL DEFAULT 12 CHECK (janela_reincidencia_meses BETWEEN 1 AND 60),
    -- Acima disto entre o fato e a aplicação, o formulário avisa do risco de perdão tácito.
    dias_imediatidade INTEGER NOT NULL DEFAULT 30 CHECK (dias_imediatidade BETWEEN 1 AND 365),
    -- Medida aplicada sem ciência há mais disto dispara o aviso de ciência pendente.
    dias_aviso_ciencia INTEGER NOT NULL DEFAULT 5 CHECK (dias_aviso_ciencia BETWEEN 1 AND 90),
    -- Razão social impressa no termo.
    empresa_nome VARCHAR(150) NOT NULL DEFAULT 'EMPRESA Construções Ltda.',
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);

INSERT INTO rh_parametros (id, usuario_criacao)
VALUES ('00000000-0000-0000-0000-000000000a01', 'SISTEMA');

-- ── Catálogos ─────────────────────────────────────────────────────────────────────
-- Gravidade de 1 a 5: ordena a lista e indica o agravamento sugerido na reincidência.
-- texto_termo é o corpo do termo em PDF, com {{variaveis}} (ver TermoMedidaDisciplinar).
CREATE TABLE rh_tipos_medida_disciplinar (
    id UUID PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    gravidade INTEGER NOT NULL CHECK (gravidade BETWEEN 1 AND 5),
    exige_periodo BOOLEAN NOT NULL DEFAULT FALSE,
    texto_termo TEXT NOT NULL,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uk_rh_tipo_medida_nome ON rh_tipos_medida_disciplinar (LOWER(nome));

CREATE TABLE rh_motivos_medida_disciplinar (
    id UUID PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uk_rh_motivo_medida_nome ON rh_motivos_medida_disciplinar (LOWER(nome));

-- Textos provisórios: a redação final por tipo depende do jurídico (tarefa 4.2).
INSERT INTO rh_tipos_medida_disciplinar (id, nome, gravidade, exige_periodo, texto_termo, usuario_criacao) VALUES
(gen_random_uuid(), 'Orientação', 1, FALSE,
 'A {{empresa}} registra a orientação dada ao(à) colaborador(a) {{colaborador}}, {{funcao}}, lotado(a) na base {{base}}, em {{dataAplicacao}}, em razão do fato ocorrido em {{dataFato}} ({{motivo}}), descrito abaixo. A orientação tem caráter educativo e busca evitar a repetição da conduta.',
 'SISTEMA'),
(gen_random_uuid(), 'Advertência verbal', 2, FALSE,
 'A {{empresa}} registra que, em {{dataAplicacao}}, aplicou advertência verbal ao(à) colaborador(a) {{colaborador}}, {{funcao}}, lotado(a) na base {{base}}, em razão do fato ocorrido em {{dataFato}} ({{motivo}}), descrito abaixo. O(A) colaborador(a) fica ciente de que a repetição da conduta poderá levar a medidas mais graves.',
 'SISTEMA'),
(gen_random_uuid(), 'Advertência escrita', 3, FALSE,
 'A {{empresa}} aplica, nesta data ({{dataAplicacao}}), ADVERTÊNCIA ESCRITA ao(à) colaborador(a) {{colaborador}}, {{funcao}}, lotado(a) na base {{base}}, em razão do fato ocorrido em {{dataFato}} ({{motivo}}), descrito abaixo. O(A) colaborador(a) fica ciente de que a repetição da conduta poderá ensejar suspensão ou a rescisão do contrato de trabalho por justa causa, nos termos do art. 482 da CLT.',
 'SISTEMA'),
(gen_random_uuid(), 'Suspensão', 4, TRUE,
 'A {{empresa}} aplica, nesta data ({{dataAplicacao}}), SUSPENSÃO DISCIPLINAR de {{diasSuspensao}} dia(s), de {{inicioSuspensao}} a {{fimSuspensao}}, ao(à) colaborador(a) {{colaborador}}, {{funcao}}, lotado(a) na base {{base}}, em razão do fato ocorrido em {{dataFato}} ({{motivo}}), descrito abaixo. Os dias de suspensão não serão remunerados. O(A) colaborador(a) deve retornar ao trabalho no dia seguinte ao término da suspensão e fica ciente de que a repetição da conduta poderá ensejar a rescisão do contrato por justa causa, nos termos do art. 482 da CLT.',
 'SISTEMA'),
(gen_random_uuid(), 'Desligamento', 5, FALSE,
 'A {{empresa}} comunica ao(à) colaborador(a) {{colaborador}}, {{funcao}}, lotado(a) na base {{base}}, a rescisão do contrato de trabalho em {{dataAplicacao}}, em razão do fato ocorrido em {{dataFato}} ({{motivo}}), descrito abaixo.',
 'SISTEMA');

INSERT INTO rh_motivos_medida_disciplinar (id, nome, usuario_criacao) VALUES
(gen_random_uuid(), 'Trânsito', 'SISTEMA'),
(gen_random_uuid(), 'Segurança do trabalho', 'SISTEMA'),
(gen_random_uuid(), 'Conduta', 'SISTEMA'),
(gen_random_uuid(), 'Assiduidade/pontualidade', 'SISTEMA'),
(gen_random_uuid(), 'Uso de equipamento', 'SISTEMA'),
(gen_random_uuid(), 'Outros', 'SISTEMA');

-- ── Medida disciplinar ────────────────────────────────────────────────────────────
-- descricao é cifrada (AES-256 GCM) pela aplicação. id_base_operacional é a base do
-- colaborador quando a medida foi registrada. id_origem é opaco: o RH não conhece a frota.
CREATE TABLE rh_medidas_disciplinares (
    id UUID PRIMARY KEY,
    id_colaborador UUID NOT NULL REFERENCES colaboradores(id),
    id_base_operacional UUID REFERENCES bases_operacionais(id),
    id_tipo UUID NOT NULL REFERENCES rh_tipos_medida_disciplinar(id),
    id_motivo UUID NOT NULL REFERENCES rh_motivos_medida_disciplinar(id),
    data_fato DATE NOT NULL,
    data_aplicacao DATE,
    descricao TEXT NOT NULL,
    dias_suspensao INTEGER CHECK (dias_suspensao IS NULL OR dias_suspensao BETWEEN 1 AND 30),
    inicio_suspensao DATE,
    fim_suspensao DATE,
    situacao VARCHAR(20) NOT NULL DEFAULT 'RASCUNHO',
    id_usuario_aplicacao UUID,
    aplicada_em TIMESTAMP WITH TIME ZONE,
    ciencia_em TIMESTAMP WITH TIME ZONE,
    ciencia_recusada BOOLEAN,
    testemunha_1 VARCHAR(150),
    testemunha_2 VARCHAR(150),
    aviso_ciencia_em TIMESTAMP WITH TIME ZONE,
    origem VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    id_origem UUID,
    sistema_origem VARCHAR(20),
    id_externo VARCHAR(80),
    cancelada_em TIMESTAMP WITH TIME ZONE,
    id_usuario_cancelamento UUID,
    justificativa_cancelamento VARCHAR(500),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_rh_medida_situacao CHECK (situacao IN ('RASCUNHO', 'APLICADA', 'CIENTE', 'CANCELADA')),
    CONSTRAINT ck_rh_medida_origem CHECK (origem IN ('MANUAL', 'FROTA_MULTA', 'IMPORTACAO')),
    CONSTRAINT ck_rh_medida_origem_id CHECK (origem <> 'FROTA_MULTA' OR id_origem IS NOT NULL),
    CONSTRAINT ck_rh_medida_suspensao CHECK ((dias_suspensao IS NULL) = (inicio_suspensao IS NULL)
        AND (inicio_suspensao IS NULL) = (fim_suspensao IS NULL)),
    CONSTRAINT ck_rh_medida_aplicacao CHECK (situacao = 'RASCUNHO' OR situacao = 'CANCELADA' OR data_aplicacao IS NOT NULL),
    CONSTRAINT ck_rh_medida_ciencia CHECK (situacao <> 'CIENTE' OR ciencia_em IS NOT NULL),
    CONSTRAINT ck_rh_medida_recusa CHECK (ciencia_recusada IS NOT TRUE OR (testemunha_1 IS NOT NULL AND testemunha_2 IS NOT NULL)),
    CONSTRAINT ck_rh_medida_cancelamento CHECK (situacao <> 'CANCELADA' OR justificativa_cancelamento IS NOT NULL)
);
CREATE INDEX idx_rh_medidas_reincidencia ON rh_medidas_disciplinares (id_colaborador, id_motivo, data_fato DESC);
CREATE INDEX idx_rh_medidas_situacao ON rh_medidas_disciplinares (situacao, aplicada_em);
CREATE INDEX idx_rh_medidas_base ON rh_medidas_disciplinares (id_base_operacional, data_fato DESC);
CREATE INDEX idx_rh_medidas_origem ON rh_medidas_disciplinares (origem, id_origem) WHERE id_origem IS NOT NULL;
-- Reimportar o mesmo arquivo do EXP atualiza ou ignora, nunca duplica.
CREATE UNIQUE INDEX uk_rh_medidas_referencia_externa ON rh_medidas_disciplinares (sistema_origem, id_externo)
    WHERE id_externo IS NOT NULL;

CREATE TABLE rh_medida_disciplinar_historico (
    id UUID PRIMARY KEY,
    id_medida UUID NOT NULL REFERENCES rh_medidas_disciplinares(id),
    tipo VARCHAR(30) NOT NULL,
    descricao VARCHAR(500) NOT NULL,
    id_usuario UUID,
    ocorrido_em TIMESTAMP WITH TIME ZONE NOT NULL,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_rh_medida_historico_tipo CHECK (tipo IN ('REGISTRADA', 'EDITADA', 'APLICADA', 'CIENCIA_ASSINADA',
        'CIENCIA_RECUSADA', 'CANCELADA', 'ANEXO_INCLUIDO', 'ANEXO_REMOVIDO'))
);
CREATE INDEX idx_rh_medida_historico ON rh_medida_disciplinar_historico (id_medida, ocorrido_em);

CREATE TABLE rh_medida_disciplinar_anexos (
    id UUID PRIMARY KEY,
    id_medida UUID NOT NULL REFERENCES rh_medidas_disciplinares(id),
    arquivo_chave VARCHAR(500) NOT NULL,
    arquivo_nome VARCHAR(255) NOT NULL,
    arquivo_content_type VARCHAR(120),
    arquivo_tamanho_bytes BIGINT,
    arquivo_sha256 VARCHAR(64) NOT NULL,
    termo_assinado BOOLEAN NOT NULL DEFAULT FALSE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_rh_medida_anexos ON rh_medida_disciplinar_anexos (id_medida) WHERE ativo;

-- ── Permissões ────────────────────────────────────────────────────────────────────
-- Separadas de rh:colaborador:read (dado restrito). Os demais perfis do RH recebem pela tela
-- de perfis, conforme decisão do cliente (tarefa 4.1).
INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome) VALUES
(gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'rh:medida-disciplinar:read'),
(gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'rh:medida-disciplinar:write'),
(gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'rh:medida-disciplinar:cancelar')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE perfil.nome = 'ADMINISTRADOR'
  AND permissao.nome IN ('rh:medida-disciplinar:read', 'rh:medida-disciplinar:write', 'rh:medida-disciplinar:cancelar')
ON CONFLICT DO NOTHING;

-- ── Regras de fábrica ─────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_regra UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM regras_notificacao WHERE chave_gatilho = 'rh.medida_aplicada' AND sistema = TRUE) THEN
        v_regra := gen_random_uuid();
        INSERT INTO regras_notificacao (
            id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
            titulo_template, corpo_template, deeplink_template, limiar,
            cooldown_minutos, enviar_email, versao, data_criacao, usuario_criacao, ativo)
        VALUES (
            v_regra, 'rh.medida_aplicada', 'Medida disciplinar aplicada',
            'Avisa o RH quando uma medida disciplinar é aplicada, para colher a ciência do colaborador.',
            TRUE, 'OPERACIONAL', 'NORMAL',
            '{{tipo}} aplicada a {{colaborador}}',
            'Motivo: {{motivo}}. Base: {{base}}. Fato em {{dataFato}}. Colha a ciência do colaborador e anexe o termo assinado.',
            '{{link}}', NULL, 0, FALSE, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
        INSERT INTO destinatarios_regra_notificacao (
            id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'PERMISSAO', NULL, 'rh:medida-disciplinar:write', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM regras_notificacao WHERE chave_gatilho = 'rh.medida_ciencia_pendente' AND sistema = TRUE) THEN
        v_regra := gen_random_uuid();
        INSERT INTO regras_notificacao (
            id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
            titulo_template, corpo_template, deeplink_template, limiar,
            cooldown_minutos, enviar_email, versao, data_criacao, usuario_criacao, ativo)
        VALUES (
            v_regra, 'rh.medida_ciencia_pendente', 'Ciência de medida disciplinar pendente',
            'Avisa o RH, uma vez por medida, quando a ciência do colaborador está pendente há mais dias que o configurado nos parâmetros do RH.',
            TRUE, 'OPERACIONAL', 'ALTA',
            'Ciência pendente: {{tipo}} de {{colaborador}}',
            'Aplicada em {{dataAplicacao}}, há {{dias}} dias, ainda sem ciência registrada. Registre a assinatura ou a recusa com duas testemunhas.',
            '{{link}}', NULL, 0, FALSE, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
        INSERT INTO destinatarios_regra_notificacao (
            id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'PERMISSAO', NULL, 'rh:medida-disciplinar:write', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    END IF;
END $$;
