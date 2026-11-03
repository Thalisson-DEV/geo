-- Ajustes pedidos pelos gestores da frota em 23/10/2026 (change modulo-gestao-frota-ajustes-gestores):
-- trava de KM no campo, checklist de registro sem condutor, CNH só avisa no checklist, foto
-- sempre obrigatória, pedido de abastecimento sem quantidade e com destino, quantidade
-- aprovada e liberada, preço por posto e sugestão de preço pelo cupom.
-- Aditiva. Rollback: DROP das tabelas frota_posto_precos e frota_sugestoes_preco_posto, DROP
-- das colunas novas, volta dos CHECKs antigos, DELETE da permissão 'frota:checklist:registrar'
-- e da regra 'frota.checklist_cnh_inapta'.

-- ── Trava de KM ───────────────────────────────────────────────────────────────────
-- Acima disto (sobre a última leitura válida), o lançamento de campo é recusado.
-- Em horas, nulo = sem trava de salto (só a de valor menor).
ALTER TABLE frota_parametros
    ADD COLUMN limite_salto_km INTEGER NOT NULL DEFAULT 2000 CHECK (limite_salto_km > 0),
    ADD COLUMN limite_salto_horas INTEGER CHECK (limite_salto_horas IS NULL OR limite_salto_horas > 0);

-- Lançamento manual acima do limite, aceito com justificativa do gestor.
ALTER TABLE frota_leituras_odometro
    ADD COLUMN justificativa_salto VARCHAR(400);

-- ── Checklist ─────────────────────────────────────────────────────────────────────
-- USO tem condutor; RECEBIMENTO e DEVOLUCAO são registros sem condutor (administrativo).
ALTER TABLE frota_checklists
    ADD COLUMN finalidade VARCHAR(20) NOT NULL DEFAULT 'USO',
    ADD COLUMN cnh_situacao VARCHAR(30),
    ADD COLUMN cnh_motivo VARCHAR(300),
    ALTER COLUMN id_condutor DROP NOT NULL,
    ADD CONSTRAINT ck_frota_checklist_finalidade CHECK (finalidade IN ('USO', 'RECEBIMENTO', 'DEVOLUCAO')),
    ADD CONSTRAINT ck_frota_checklist_condutor CHECK ((finalidade = 'USO') = (id_condutor IS NOT NULL));

-- Foto da pergunta: nunca, só no Não OK ou sempre. foto_no_nao_ok fica até a próxima change.
ALTER TABLE frota_checklist_perguntas
    ADD COLUMN modo_foto VARCHAR(10) NOT NULL DEFAULT 'NUNCA';
UPDATE frota_checklist_perguntas SET modo_foto = 'NAO_OK' WHERE foto_no_nao_ok;
ALTER TABLE frota_checklist_perguntas
    ADD CONSTRAINT ck_frota_checklist_pergunta_modo_foto CHECK (modo_foto IN ('NUNCA', 'NAO_OK', 'SEMPRE')),
    ADD CONSTRAINT ck_frota_checklist_pergunta_modo_foto_tipo CHECK (modo_foto <> 'NAO_OK' OR tipo_resposta = 'OK_NOK');

-- Vínculo aberto pelo checklist com a CNH que não permitia dirigir.
ALTER TABLE frota_vinculos_condutor
    ADD COLUMN cnh_situacao_inicio VARCHAR(30);

-- ── Abastecimento ─────────────────────────────────────────────────────────────────
-- APP: pedido da equipe pelo celular. AVULSA: lançada na web por quem aprova a placa, já
-- aprovada (como a solicitação direta do comercial), sem foto do painel e com KM opcional.
ALTER TABLE frota_abastecimentos
    ADD COLUMN destino VARCHAR(200),
    ADD COLUMN origem VARCHAR(10) NOT NULL DEFAULT 'APP',
    ALTER COLUMN medicao_solicitacao DROP NOT NULL,
    ADD CONSTRAINT ck_frota_abast_origem CHECK (origem IN ('APP', 'AVULSA')),
    ADD CONSTRAINT ck_frota_abast_medicao_app CHECK (origem = 'AVULSA' OR medicao_solicitacao IS NOT NULL);
CREATE INDEX idx_frota_abastecimentos_condutor ON frota_abastecimentos (id_condutor, solicitado_em DESC);

-- O condutor pede só o produto; a quantidade é do aprovador, e a liberação pode ajustar.
ALTER TABLE frota_abastecimento_itens
    ALTER COLUMN quantidade_pedida DROP NOT NULL,
    DROP CONSTRAINT ck_frota_abast_item_pedido,
    ADD CONSTRAINT ck_frota_abast_item_pedido CHECK (quantidade_pedida IS NULL OR quantidade_pedida > 0),
    ADD COLUMN quantidade_aprovada NUMERIC(10, 2) CHECK (quantidade_aprovada IS NULL OR quantidade_aprovada >= 0),
    ADD COLUMN quantidade_liberada NUMERIC(10, 2) CHECK (quantidade_liberada IS NULL OR quantidade_liberada >= 0);

-- Pedidos já decididos: o pedido era a quantidade aprovada e a liberada.
UPDATE frota_abastecimento_itens i
SET quantidade_aprovada = i.quantidade_pedida
FROM frota_abastecimentos a
WHERE a.id = i.id_abastecimento AND a.aprovado_em IS NOT NULL AND a.situacao <> 'REPROVADA';
UPDATE frota_abastecimento_itens i
SET quantidade_liberada = i.quantidade_pedida
FROM frota_abastecimentos a
WHERE a.id = i.id_abastecimento AND a.liberado_em IS NOT NULL;

ALTER TABLE frota_abastecimento_alertas
    DROP CONSTRAINT ck_frota_abast_alerta_etapa,
    ADD CONSTRAINT ck_frota_abast_alerta_etapa CHECK (etapa IN ('SOLICITACAO', 'APROVACAO', 'REALIZADO'));

-- Preço do produto no posto, com vigência. Vale o mais recente com vigente_desde <= data.
CREATE TABLE frota_posto_precos (
    id UUID PRIMARY KEY,
    id_posto UUID NOT NULL REFERENCES frota_postos(id),
    id_produto UUID NOT NULL REFERENCES frota_produtos_abastecimento(id),
    preco_unitario NUMERIC(12, 3) NOT NULL CHECK (preco_unitario > 0),
    vigente_desde DATE NOT NULL,
    origem VARCHAR(20) NOT NULL,
    id_abastecimento UUID REFERENCES frota_abastecimentos(id),
    id_usuario UUID,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_posto_preco_origem CHECK (origem IN ('MANUAL', 'CUPOM_CONFIRMADO'))
);
-- Um preço por posto, produto e dia de vigência.
CREATE UNIQUE INDEX uk_frota_posto_preco ON frota_posto_precos (id_posto, id_produto, vigente_desde) WHERE ativo;
CREATE INDEX idx_frota_posto_precos_vigencia ON frota_posto_precos (id_posto, id_produto, vigente_desde DESC);

-- Preço lido no cupom pelo Assistente, diferente do cadastrado. Só vale depois de confirmado.
CREATE TABLE frota_sugestoes_preco_posto (
    id UUID PRIMARY KEY,
    id_abastecimento UUID NOT NULL REFERENCES frota_abastecimentos(id),
    id_posto UUID NOT NULL REFERENCES frota_postos(id),
    id_produto UUID NOT NULL REFERENCES frota_produtos_abastecimento(id),
    preco_cadastrado NUMERIC(12, 3),
    preco_cupom NUMERIC(12, 3) NOT NULL CHECK (preco_cupom > 0),
    data_cupom DATE NOT NULL,
    situacao VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
    id_usuario_decisao UUID,
    decidido_em TIMESTAMP WITH TIME ZONE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_sugestao_preco_situacao CHECK (situacao IN ('PENDENTE', 'CONFIRMADA', 'DESCARTADA'))
);
-- Uma sugestão por abastecimento e produto: reanalisar não duplica.
CREATE UNIQUE INDEX uk_frota_sugestao_preco ON frota_sugestoes_preco_posto (id_abastecimento, id_produto) WHERE ativo;
CREATE INDEX idx_frota_sugestoes_preco_pendentes ON frota_sugestoes_preco_posto (situacao, data_criacao DESC);

-- ── Permissão do checklist sem condutor ───────────────────────────────────────────
INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
VALUES (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'frota:checklist:registrar')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE perfil.nome IN ('ADMINISTRADOR', 'GESTOR_FROTA', 'OPERACAO_FROTA')
  AND permissao.nome = 'frota:checklist:registrar'
ON CONFLICT DO NOTHING;

-- ── Aviso de checklist com CNH que não permite dirigir ────────────────────────────
DO $$
DECLARE
    v_regra UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM regras_notificacao WHERE chave_gatilho = 'frota.checklist_cnh_inapta' AND sistema = TRUE) THEN
        v_regra := gen_random_uuid();
        INSERT INTO regras_notificacao (
            id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
            titulo_template, corpo_template, deeplink_template, limiar,
            cooldown_minutos, enviar_email, versao, data_criacao, usuario_criacao, ativo)
        VALUES (
            v_regra, 'frota.checklist_cnh_inapta', 'Checklist com CNH irregular',
            'Avisa a gestão da frota quando alguém assume um veículo pelo checklist com a CNH vencida, ausente ou de categoria abaixo da exigida.',
            TRUE, 'OPERACIONAL', 'ALTA',
            '{{condutor}} assumiu o {{placa}} com {{situacao}}',
            '{{detalhe}} O checklist foi aceito; o abastecimento fica bloqueado até a regularização ou a liberação do gestor.',
            '{{link}}', NULL, 0, FALSE, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
        INSERT INTO destinatarios_regra_notificacao (
            id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'PERMISSAO', NULL, 'frota:checklist:configurar', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    END IF;
END $$;

