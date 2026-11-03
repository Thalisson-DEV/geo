-- Seguros e sinistros da frota (change modulo-gestao-frota-seguros-sinistros).
-- Apólices com seguradora e corretor do financeiro, veículos cobertos por período, parcelas
-- pagas pelo financeiro (origem FROTA_SEGURO) e anexos; sinistros com condutor do momento,
-- seguradora acionada, anexos e a OS de reparo (origem SINISTRO).
-- Aditiva. Rollback: DROP de frota_sinistro_anexos, frota_sinistros, seq_frota_sinistro_numero,
-- frota_apolice_anexos, frota_apolice_parcelas, frota_apolice_veiculos e frota_apolices (nesta
-- ordem), volta dos CHECKs ck_frota_os_origem e ck_frota_alerta_tipo, DELETE das permissões
-- 'frota:seguro:%' e 'frota:sinistro:%', das regras 'Apólice perto do vencimento' e
-- 'frota.sinistro_registrado' e da condição tipoAlvo da regra de documentos e CNH.

-- ── Apólices ──────────────────────────────────────────────────────────────────────
CREATE TABLE frota_apolices (
    id UUID PRIMARY KEY,
    numero VARCHAR(60) NOT NULL,
    -- Seguradora e corretor são fornecedores do financeiro (sem FK: outro módulo).
    id_seguradora UUID NOT NULL,
    id_corretor UUID,
    segurado VARCHAR(150),
    id_base_operacional UUID REFERENCES bases_operacionais(id),
    -- Setor/centro de custo do financeiro (processo de negócio).
    id_processo UUID,
    vigencia_inicio DATE NOT NULL,
    vigencia_fim DATE NOT NULL,
    valor NUMERIC(14, 2) NOT NULL CHECK (valor >= 0),
    franquia NUMERIC(14, 2) CHECK (franquia IS NULL OR franquia >= 0),
    observacao VARCHAR(1000),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_apolice_vigencia CHECK (vigencia_fim >= vigencia_inicio)
);
-- O mesmo número pode repetir em seguradoras diferentes.
CREATE UNIQUE INDEX uk_frota_apolices_numero ON frota_apolices (id_seguradora, UPPER(numero)) WHERE ativo;
CREATE INDEX idx_frota_apolices_vigencia_fim ON frota_apolices (vigencia_fim) WHERE ativo;

-- Veículo coberto num período dentro da vigência; sem fim, vai até o fim da vigência.
CREATE TABLE frota_apolice_veiculos (
    id UUID PRIMARY KEY,
    id_apolice UUID NOT NULL REFERENCES frota_apolices(id),
    id_veiculo UUID NOT NULL REFERENCES veiculos(id),
    inicio DATE NOT NULL,
    fim DATE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_apolice_veiculo_periodo CHECK (fim IS NULL OR fim >= inicio)
);
CREATE INDEX idx_frota_apolice_veiculos_apolice ON frota_apolice_veiculos (id_apolice) WHERE ativo;
CREATE INDEX idx_frota_apolice_veiculos_veiculo ON frota_apolice_veiculos (id_veiculo) WHERE ativo;

CREATE TABLE frota_apolice_parcelas (
    id UUID PRIMARY KEY,
    id_apolice UUID NOT NULL REFERENCES frota_apolices(id),
    numero INTEGER NOT NULL CHECK (numero > 0),
    vencimento DATE NOT NULL,
    valor NUMERIC(14, 2) NOT NULL CHECK (valor > 0),
    -- Solicitação de pagamento aberta pela parcela (sem FK: outro módulo).
    id_solicitacao_financeira UUID,
    numero_solicitacao_financeira BIGINT,
    situacao_pagamento VARCHAR(20),
    motivo_reprovacao_pagamento VARCHAR(500),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_apolice_parcela_situacao CHECK (situacao_pagamento IS NULL OR situacao_pagamento IN ('SOLICITADO', 'APROVADO', 'REPROVADO')),
    CONSTRAINT ck_frota_apolice_parcela_solicitacao CHECK ((id_solicitacao_financeira IS NULL) = (situacao_pagamento IS NULL))
);
CREATE UNIQUE INDEX uk_frota_apolice_parcelas_numero ON frota_apolice_parcelas (id_apolice, numero) WHERE ativo;
CREATE UNIQUE INDEX uk_frota_apolice_parcelas_solicitacao ON frota_apolice_parcelas (id_solicitacao_financeira) WHERE id_solicitacao_financeira IS NOT NULL;

CREATE TABLE frota_apolice_anexos (
    id UUID PRIMARY KEY,
    id_apolice UUID NOT NULL REFERENCES frota_apolices(id),
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
CREATE INDEX idx_frota_apolice_anexos_apolice ON frota_apolice_anexos (id_apolice) WHERE ativo;

-- ── Sinistros ─────────────────────────────────────────────────────────────────────
CREATE SEQUENCE seq_frota_sinistro_numero START WITH 1 INCREMENT BY 1;

CREATE TABLE frota_sinistros (
    id UUID PRIMARY KEY,
    numero BIGINT NOT NULL DEFAULT nextval('seq_frota_sinistro_numero'),
    id_veiculo UUID NOT NULL REFERENCES veiculos(id),
    placa VARCHAR(10) NOT NULL,
    id_base_operacional UUID REFERENCES bases_operacionais(id),
    ocorrido_em TIMESTAMP WITH TIME ZONE NOT NULL,
    local VARCHAR(300),
    tipo VARCHAR(30) NOT NULL,
    -- Colaborador que dirigia; sem informar, quem estava vinculado ao veículo no instante.
    id_condutor UUID,
    culpa_condutor BOOLEAN,
    descricao VARCHAR(4000) NOT NULL,
    terceiros VARCHAR(2000),
    boletim_ocorrencia VARCHAR(60),
    -- Seguradora acionada.
    id_apolice UUID REFERENCES frota_apolices(id),
    numero_sinistro_seguradora VARCHAR(60),
    seguradora_acionada_em TIMESTAMP WITH TIME ZONE,
    franquia_paga NUMERIC(14, 2) CHECK (franquia_paga IS NULL OR franquia_paga >= 0),
    -- OS de reparo aberta pelo sinistro.
    id_ordem_servico UUID REFERENCES frota_ordens_servico(id),
    situacao VARCHAR(30) NOT NULL DEFAULT 'RASCUNHO',
    finalizado_em TIMESTAMP WITH TIME ZONE,
    cancelado_em TIMESTAMP WITH TIME ZONE,
    motivo_cancelamento VARCHAR(1000),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_sinistro_tipo CHECK (tipo IN ('COLISAO_SEM_VITIMA', 'COLISAO_COM_VITIMA', 'SEM_TERCEIROS',
        'INTRAFROTA', 'CARGA_AVARIADA', 'FURTO', 'ASSALTO')),
    CONSTRAINT ck_frota_sinistro_situacao CHECK (situacao IN ('RASCUNHO', 'EM_OFICINA', 'SEGURADORA_ACIONADA', 'FINALIZADO', 'CANCELADO')),
    CONSTRAINT ck_frota_sinistro_acionamento CHECK ((id_apolice IS NULL) = (seguradora_acionada_em IS NULL))
);
CREATE UNIQUE INDEX uk_frota_sinistros_numero ON frota_sinistros (numero);
CREATE UNIQUE INDEX uk_frota_sinistros_os ON frota_sinistros (id_ordem_servico) WHERE id_ordem_servico IS NOT NULL;
CREATE INDEX idx_frota_sinistros_veiculo ON frota_sinistros (id_veiculo, ocorrido_em DESC) WHERE ativo;
CREATE INDEX idx_frota_sinistros_ocorrido ON frota_sinistros (ocorrido_em DESC) WHERE ativo;

-- Fotos, boletim de ocorrência e outros documentos do sinistro.
CREATE TABLE frota_sinistro_anexos (
    id UUID PRIMARY KEY,
    id_sinistro UUID NOT NULL REFERENCES frota_sinistros(id),
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
CREATE INDEX idx_frota_sinistro_anexos_sinistro ON frota_sinistro_anexos (id_sinistro) WHERE ativo;

-- ── OS de reparo e aviso de vencimento da apólice ─────────────────────────────────
ALTER TABLE frota_ordens_servico DROP CONSTRAINT ck_frota_os_origem;
ALTER TABLE frota_ordens_servico ADD CONSTRAINT ck_frota_os_origem
    CHECK (origem IN ('VERBAL', 'CHECKLIST', 'INSPECAO', 'PREVENTIVA', 'MANUAL', 'IMPORTACAO', 'SINISTRO'));

ALTER TABLE frota_alertas_vencimento DROP CONSTRAINT ck_frota_alerta_tipo;
ALTER TABLE frota_alertas_vencimento ADD CONSTRAINT ck_frota_alerta_tipo CHECK (tipo_alvo IN ('DOCUMENTO', 'CNH', 'APOLICE'));

-- ── Permissões ────────────────────────────────────────────────────────────────────
INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
SELECT gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, nome
FROM (VALUES ('frota:seguro:read'), ('frota:seguro:write'), ('frota:sinistro:read'), ('frota:sinistro:write')) AS p(nome)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE perfil.nome IN ('ADMINISTRADOR', 'GESTOR_FROTA') AND permissao.nome IN
      ('frota:seguro:read', 'frota:seguro:write', 'frota:sinistro:read', 'frota:sinistro:write')
ON CONFLICT DO NOTHING;

-- A operação registra e acompanha sinistros e consulta as apólices.
INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE perfil.nome = 'OPERACAO_FROTA' AND permissao.nome IN ('frota:seguro:read', 'frota:sinistro:read', 'frota:sinistro:write')
ON CONFLICT DO NOTHING;

-- ── Regras de fábrica ─────────────────────────────────────────────────────────────
-- O vencimento da apólice usa o gatilho de vencimentos da frota (tipoAlvo = APOLICE), com regra
-- própria para quem cuida dos seguros; a regra de documentos e CNH continua só com eles.
DO $$
DECLARE
    v_regra UUID;
BEGIN
    FOR v_regra IN SELECT r.id FROM regras_notificacao r
                    WHERE r.chave_gatilho = 'frota.vencimento_proximo' AND r.sistema = TRUE
                      AND r.nome = 'Documento ou CNH perto do vencimento'
                      AND NOT EXISTS (SELECT 1 FROM condicoes_regra_notificacao c
                                       WHERE c.id_regra = r.id AND c.campo = 'tipoAlvo' AND c.ativo)
    LOOP
        INSERT INTO condicoes_regra_notificacao (id, id_regra, campo, operador, valor, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'tipoAlvo', 'DIFERENTE', 'APOLICE', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    END LOOP;


    IF NOT EXISTS (SELECT 1 FROM regras_notificacao WHERE chave_gatilho = 'frota.vencimento_proximo'
                   AND sistema = TRUE AND nome = 'Apólice perto do vencimento') THEN
        v_regra := gen_random_uuid();
        INSERT INTO regras_notificacao (
            id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
            titulo_template, corpo_template, deeplink_template, limiar,
            cooldown_minutos, enviar_email, versao, data_criacao, usuario_criacao, ativo)
        VALUES (
            v_regra, 'frota.vencimento_proximo', 'Apólice perto do vencimento',
            'Avisa quem cuida dos seguros da frota quando uma apólice ativa entra numa faixa de aviso.',
            TRUE, 'OPERACIONAL', 'NORMAL',
            '{{descricao}} de {{referencia}} {{prazo}}',
            '{{descricao}} de {{referencia}} {{prazo}} (fim da vigência em {{dataVencimento}}). Renove ou cadastre a nova apólice.',
            '{{link}}', NULL, 0, TRUE, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
        INSERT INTO destinatarios_regra_notificacao (
            id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'PERMISSAO', NULL, 'frota:seguro:write', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
        INSERT INTO condicoes_regra_notificacao (id, id_regra, campo, operador, valor, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'tipoAlvo', 'IGUAL', 'APOLICE', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    END IF;
END $$;

DO $$
DECLARE
    v_regra UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM regras_notificacao WHERE chave_gatilho = 'frota.sinistro_registrado' AND sistema = TRUE) THEN
        v_regra := gen_random_uuid();
        INSERT INTO regras_notificacao (
            id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
            titulo_template, corpo_template, deeplink_template, limiar,
            cooldown_minutos, enviar_email, versao, data_criacao, usuario_criacao, ativo)
        VALUES (
            v_regra, 'frota.sinistro_registrado', 'Sinistro registrado',
            'Avisa a gestão da frota quando um sinistro (acidente, furto, assalto ou carga avariada) é registrado.',
            TRUE, 'OPERACIONAL', 'ALTA',
            'Sinistro {{numero}}: {{tipo}} com o {{placa}}',
            '{{tipo}} com o {{placa}} em {{ocorridoEm}}{{localTexto}}. Condutor: {{condutor}}. {{descricao}}',
            '{{link}}', NULL, 0, TRUE, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
        INSERT INTO destinatarios_regra_notificacao (
            id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'PERMISSAO', NULL, 'frota:sinistro:write', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    END IF;
END $$;

