-- V177: módulo de frota — Fase 1, ordens de serviço (openspec/changes/modulo-gestao-frota-fase-1).
--
-- Aditiva. Nenhuma tabela existente perde ou muda coluna; frota_parametros ganha uma.
-- Rollback: DROP das tabelas frota_os_*, frota_ordens_servico, frota_itens_manutencao e da
-- sequência; ALTER TABLE frota_parametros DROP COLUMN janela_repeticao_dias; DELETE das
-- permissões 'frota:os:%', do perfil OFICINA_FROTA e das regras 'frota.os_%' e
-- 'frota.manutencao_repetida'.

-- ── Parâmetro novo ────────────────────────────────────────────────────────────────
-- Uma OS concluída com o mesmo item na mesma placa dentro desta janela é repetição.
ALTER TABLE frota_parametros
    ADD COLUMN janela_repeticao_dias INTEGER NOT NULL DEFAULT 90
        CHECK (janela_repeticao_dias BETWEEN 1 AND 730);

-- ── Catálogo de itens de manutenção ───────────────────────────────────────────────
CREATE TABLE frota_itens_manutencao (
    id UUID PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    -- Mesmos valores de financeiro NaturezaServicoFrota, para pré-preencher a compra.
    natureza VARCHAR(40) NOT NULL,
    descricao VARCHAR(255),
    dias_repeticao INTEGER CHECK (dias_repeticao IS NULL OR dias_repeticao BETWEEN 1 AND 730),
    -- Chave no sistema de onde o registro foi importado (ex.: EXP), para reimportar sem duplicar.
    sistema_origem VARCHAR(20),
    id_externo VARCHAR(80),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_item_natureza CHECK (natureza IN (
        'COMPRA_E_REFORMA_DE_PNEUS', 'SUSPENSAO_FREIOS', 'ARREFECIMENTO', 'TRANSMISSAO', 'ELETRICA',
        'CHAPARIA_E_PINTURA', 'GUINCHO', 'HIDRAULICA', 'TAPECARIA', 'LAVAGEM_E_LUBRIFICACAO', 'ACESSORIOS',
        'BATERIA', 'BORRACHARIA', 'MECANICA', 'PNEUMATICA', 'POSTO_DE_MOLAS', 'REFRIGERACAO_E_CLIMATIZACAO',
        'TACOGRAFO', 'TORNEADORA')),
    CONSTRAINT ck_frota_item_externo CHECK ((sistema_origem IS NULL) = (id_externo IS NULL))
);
CREATE UNIQUE INDEX uk_frota_itens_manutencao_nome ON frota_itens_manutencao (UPPER(nome));
CREATE UNIQUE INDEX uk_frota_itens_manutencao_externo
    ON frota_itens_manutencao (sistema_origem, id_externo) WHERE id_externo IS NOT NULL;

-- Itens comuns para a tela não começar vazia; o gestor ajusta, desativa ou acrescenta.
INSERT INTO frota_itens_manutencao (id, nome, natureza, usuario_criacao)
VALUES
    (gen_random_uuid(), 'PASTILHA DE FREIO DIANTEIRA', 'SUSPENSAO_FREIOS', 'SISTEMA'),
    (gen_random_uuid(), 'PASTILHA DE FREIO TRASEIRA', 'SUSPENSAO_FREIOS', 'SISTEMA'),
    (gen_random_uuid(), 'AMORTECEDOR', 'SUSPENSAO_FREIOS', 'SISTEMA'),
    (gen_random_uuid(), 'TROCA DE ÓLEO E FILTROS', 'LAVAGEM_E_LUBRIFICACAO', 'SISTEMA'),
    (gen_random_uuid(), 'BATERIA', 'BATERIA', 'SISTEMA'),
    (gen_random_uuid(), 'EMBREAGEM', 'TRANSMISSAO', 'SISTEMA'),
    (gen_random_uuid(), 'RADIADOR / ARREFECIMENTO', 'ARREFECIMENTO', 'SISTEMA'),
    (gen_random_uuid(), 'SISTEMA ELÉTRICO', 'ELETRICA', 'SISTEMA'),
    (gen_random_uuid(), 'AR-CONDICIONADO', 'REFRIGERACAO_E_CLIMATIZACAO', 'SISTEMA'),
    (gen_random_uuid(), 'PNEU (REPARO)', 'BORRACHARIA', 'SISTEMA'),
    (gen_random_uuid(), 'FUNILARIA E PINTURA', 'CHAPARIA_E_PINTURA', 'SISTEMA'),
    (gen_random_uuid(), 'SISTEMA HIDRÁULICO DO IMPLEMENTO', 'HIDRAULICA', 'SISTEMA'),
    (gen_random_uuid(), 'GUINCHO / REBOQUE', 'GUINCHO', 'SISTEMA'),
    (gen_random_uuid(), 'MOTOR (DIAGNÓSTICO E REPARO)', 'MECANICA', 'SISTEMA')
ON CONFLICT DO NOTHING;

-- ── Ordens de serviço ─────────────────────────────────────────────────────────────
CREATE SEQUENCE seq_frota_os_numero START WITH 1 INCREMENT BY 1;

CREATE TABLE frota_ordens_servico (
    id UUID PRIMARY KEY,
    numero BIGINT NOT NULL DEFAULT nextval('seq_frota_os_numero'),
    id_veiculo UUID NOT NULL REFERENCES veiculos(id),
    -- Placa e base do veículo na abertura: a OS pertence ao local onde foi tratada.
    placa VARCHAR(10) NOT NULL,
    id_base_operacional UUID REFERENCES bases_operacionais(id),
    tipo_manutencao VARCHAR(20) NOT NULL,
    origem VARCHAR(20) NOT NULL,
    criticidade VARCHAR(20) NOT NULL,
    motivo VARCHAR(30),
    descricao VARCHAR(2000) NOT NULL,
    id_condutor UUID REFERENCES colaboradores(id),
    aberta_em TIMESTAMP WITH TIME ZONE NOT NULL,
    id_usuario_abertura UUID,
    km_abertura BIGINT CHECK (km_abertura IS NULL OR km_abertura >= 0),
    situacao VARCHAR(20) NOT NULL,
    tipo_oficina VARCHAR(20) NOT NULL,
    -- Fornecedor do financeiro (sem FK: outro módulo).
    id_fornecedor UUID,
    oficina_nome VARCHAR(150),
    agendada_para TIMESTAMP WITH TIME ZONE,
    local_agendamento VARCHAR(200),
    inicio_real TIMESTAMP WITH TIME ZONE,
    previsao_termino TIMESTAMP WITH TIME ZONE,
    fim_real TIMESTAMP WITH TIME ZONE,
    prazo_avisado_para TIMESTAMP WITH TIME ZONE,
    veiculo_parado BOOLEAN NOT NULL DEFAULT FALSE,
    parado_desde TIMESTAMP WITH TIME ZONE,
    liberado_em TIMESTAMP WITH TIME ZONE,
    descricao_servico VARCHAR(4000),
    itens_substituidos VARCHAR(4000),
    valor_total NUMERIC(14, 2) CHECK (valor_total IS NULL OR valor_total >= 0),
    km_encerramento BIGINT CHECK (km_encerramento IS NULL OR km_encerramento >= 0),
    -- Id de origem da leitura de odômetro do encerramento (a da abertura usa o id da OS).
    id_leitura_encerramento UUID NOT NULL,
    cancelada_em TIMESTAMP WITH TIME ZONE,
    motivo_cancelamento VARCHAR(1000),
    -- Chave no sistema de onde a OS foi importada (ex.: EXP + número da OS lá).
    sistema_origem VARCHAR(20),
    id_externo VARCHAR(80),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_os_tipo CHECK (tipo_manutencao IN ('CORRETIVA', 'PREVENTIVA')),
    CONSTRAINT ck_frota_os_origem CHECK (origem IN ('VERBAL', 'CHECKLIST', 'INSPECAO', 'PREVENTIVA', 'MANUAL', 'IMPORTACAO')),
    CONSTRAINT ck_frota_os_criticidade CHECK (criticidade IN ('URGENTE', 'ALTA', 'MEDIA', 'BAIXA')),
    CONSTRAINT ck_frota_os_motivo CHECK (motivo IS NULL OR motivo IN (
        'DESGASTE_NATURAL', 'ADEQUACAO_DE_MELHORIA', 'PROBLEMA_MECANICO', 'MAU_USO_DESCONTO', 'OUTRA')),
    CONSTRAINT ck_frota_os_situacao CHECK (situacao IN (
        'PENDENTE', 'AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA')),
    CONSTRAINT ck_frota_os_oficina CHECK (tipo_oficina IN ('INTERNA', 'EXTERNA')),
    CONSTRAINT ck_frota_os_execucao CHECK (fim_real IS NULL OR inicio_real IS NULL OR fim_real >= inicio_real),
    CONSTRAINT ck_frota_os_parada CHECK (
        (veiculo_parado = FALSE AND parado_desde IS NULL AND liberado_em IS NULL)
        OR (veiculo_parado = TRUE AND parado_desde IS NOT NULL
            AND (liberado_em IS NULL OR liberado_em >= parado_desde))),
    CONSTRAINT ck_frota_os_externo CHECK ((sistema_origem IS NULL) = (id_externo IS NULL)),
    CONSTRAINT ck_frota_os_concluida CHECK (
        situacao <> 'CONCLUIDA' OR (inicio_real IS NOT NULL AND fim_real IS NOT NULL AND descricao_servico IS NOT NULL))
);
CREATE UNIQUE INDEX uk_frota_os_numero ON frota_ordens_servico (numero);
CREATE UNIQUE INDEX uk_frota_os_externo
    ON frota_ordens_servico (sistema_origem, id_externo) WHERE id_externo IS NOT NULL;
CREATE INDEX idx_frota_os_veiculo ON frota_ordens_servico (id_veiculo, aberta_em DESC);
CREATE INDEX idx_frota_os_base_situacao ON frota_ordens_servico (id_base_operacional, situacao);
CREATE INDEX idx_frota_os_abertas ON frota_ordens_servico (situacao, criticidade)
    WHERE situacao IN ('PENDENTE', 'AGENDADA', 'EM_ANDAMENTO');
CREATE INDEX idx_frota_os_concluidas ON frota_ordens_servico (id_veiculo, fim_real DESC)
    WHERE situacao = 'CONCLUIDA';

CREATE TABLE frota_os_itens (
    id UUID PRIMARY KEY,
    id_ordem_servico UUID NOT NULL REFERENCES frota_ordens_servico(id),
    id_item_manutencao UUID NOT NULL REFERENCES frota_itens_manutencao(id),
    -- Repetição gravada no encerramento: OS concluída anterior com o mesmo item e placa.
    id_os_anterior UUID REFERENCES frota_ordens_servico(id),
    numero_os_anterior BIGINT,
    dias_desde_anterior INTEGER CHECK (dias_desde_anterior IS NULL OR dias_desde_anterior >= 0),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uk_frota_os_item UNIQUE (id_ordem_servico, id_item_manutencao)
);
CREATE INDEX idx_frota_os_itens_item ON frota_os_itens (id_item_manutencao);
CREATE INDEX idx_frota_os_itens_repeticao ON frota_os_itens (id_ordem_servico) WHERE id_os_anterior IS NOT NULL;

-- Compras e pagamentos do financeiro abertos a partir da OS (sem FK: outro módulo).
CREATE TABLE frota_os_solicitacoes (
    id UUID PRIMARY KEY,
    id_ordem_servico UUID NOT NULL REFERENCES frota_ordens_servico(id),
    id_solicitacao UUID NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_os_solicitacao_tipo CHECK (tipo IN ('COMPRA', 'PAGAMENTO')),
    CONSTRAINT uk_frota_os_solicitacao UNIQUE (id_solicitacao)
);
CREATE INDEX idx_frota_os_solicitacoes_os ON frota_os_solicitacoes (id_ordem_servico);

-- Histórico da OS: somente inserção.
CREATE TABLE frota_os_historico (
    id UUID PRIMARY KEY,
    id_ordem_servico UUID NOT NULL REFERENCES frota_ordens_servico(id),
    tipo VARCHAR(30) NOT NULL,
    descricao VARCHAR(1000),
    id_usuario UUID,
    ocorrido_em TIMESTAMP WITH TIME ZONE NOT NULL,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_os_historico_tipo CHECK (tipo IN (
        'ABERTA', 'EDITADA', 'AGENDADA', 'INICIADA', 'PREVISAO_ALTERADA', 'CONCLUIDA', 'CANCELADA',
        'VEICULO_PARADO', 'VEICULO_LIBERADO', 'ORCAMENTO_VINCULADO', 'ORCAMENTO_APROVADO', 'ORCAMENTO_REPROVADO'))
);
CREATE INDEX idx_frota_os_historico_os ON frota_os_historico (id_ordem_servico, ocorrido_em);

-- ── Permissões e perfis ───────────────────────────────────────────────────────────
INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
SELECT gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, nome
FROM (VALUES
    ('frota:os:read'),
    ('frota:os:write'),
    ('frota:os:executar')
) AS p(nome)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfis_acesso (id, nome, versao, data_criacao, usuario_criacao, ativo)
VALUES (gen_random_uuid(), 'OFICINA_FROTA', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE)
ON CONFLICT (nome) DO NOTHING;

-- ADMINISTRADOR e GESTOR_FROTA: tudo da OS. OPERACAO_FROTA: abre, acompanha, agenda e
-- cancela. OFICINA_FROTA: lê, executa e encerra, e enxerga veículos e condutores.
INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE (perfil.nome IN ('ADMINISTRADOR', 'GESTOR_FROTA') AND permissao.nome LIKE 'frota:os:%')
   OR (perfil.nome = 'OPERACAO_FROTA' AND permissao.nome IN ('frota:os:read', 'frota:os:write'))
   OR (perfil.nome = 'OFICINA_FROTA' AND permissao.nome IN (
        'frota:os:read', 'frota:os:executar', 'frota:veiculo:read', 'frota:condutor:read',
        'rh:veiculo:read', 'rh:colaborador:read', 'rh:base-operacional:read'))
ON CONFLICT DO NOTHING;

-- ── Regras de fábrica dos avisos da OS (editáveis na tela de regras) ──────────────
CREATE OR REPLACE FUNCTION pg_temp.f_regra_frota(
    p_chave VARCHAR, p_nome VARCHAR, p_descricao VARCHAR, p_prioridade VARCHAR,
    p_titulo VARCHAR, p_corpo VARCHAR, p_permissoes VARCHAR[]) RETURNS VOID AS $$
DECLARE
    v_regra UUID;
    v_permissao VARCHAR;
BEGIN
    SELECT id INTO v_regra FROM regras_notificacao WHERE chave_gatilho = p_chave AND sistema = TRUE LIMIT 1;
    IF v_regra IS NOT NULL THEN
        RETURN;
    END IF;
    v_regra := gen_random_uuid();
    INSERT INTO regras_notificacao (
        id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
        titulo_template, corpo_template, deeplink_template, limiar,
        cooldown_minutos, enviar_email, versao, data_criacao, usuario_criacao, ativo)
    VALUES (
        v_regra, p_chave, p_nome, p_descricao, TRUE, 'OPERACIONAL', p_prioridade,
        p_titulo, p_corpo, '{{link}}', NULL, 0, TRUE, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    FOREACH v_permissao IN ARRAY p_permissoes LOOP
        INSERT INTO destinatarios_regra_notificacao (
            id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
        VALUES (gen_random_uuid(), v_regra, 'PERMISSAO', NULL, v_permissao, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT pg_temp.f_regra_frota(
    'frota.os_aberta',
    'OS de manutenção aberta',
    'Avisa a operação quando uma OS é aberta. Use condições sobre a criticidade para separar urgentes.',
    'NORMAL',
    'OS {{numero}} ({{criticidadeRotulo}}) aberta para {{placa}}',
    'OS {{numero}} aberta para {{placa}} na base {{base}}, criticidade {{criticidadeRotulo}}: {{descricao}}',
    ARRAY['frota:os:write']);

SELECT pg_temp.f_regra_frota(
    'frota.os_agendada',
    'Manutenção agendada',
    'Avisa a oficina quando uma OS é agendada ou reagendada.',
    'NORMAL',
    'OS {{numero}} de {{placa}} agendada para {{dataAgendamento}}',
    'A manutenção da OS {{numero}} ({{placa}}) foi agendada para {{dataAgendamento}}{{localTexto}}.',
    ARRAY['frota:os:executar']);

SELECT pg_temp.f_regra_frota(
    'frota.os_orcamento_decidido',
    'Orçamento da OS decidido',
    'Avisa a oficina quando o financeiro aprova ou reprova uma compra ou pagamento aberto pela OS.',
    'NORMAL',
    'OS {{numero}} ({{placa}}): {{tipoSolicitacaoRotulo}} {{decisaoRotulo}}',
    'A {{tipoSolicitacaoRotulo}} nº {{numeroSolicitacao}} da OS {{numero}} ({{placa}}) foi {{decisaoRotulo}}.',
    ARRAY['frota:os:executar']);

SELECT pg_temp.f_regra_frota(
    'frota.os_prazo_estourado',
    'OS com prazo estourado',
    'Avisa uma vez por previsão quando uma OS em andamento passa da previsão de término.',
    'ALTA',
    'OS {{numero}} ({{placa}}) passou da previsão de término',
    'A OS {{numero}} de {{placa}} (base {{base}}) devia terminar em {{previsaoTermino}} e segue em andamento.',
    ARRAY['frota:os:write']);

SELECT pg_temp.f_regra_frota(
    'frota.manutencao_repetida',
    'Manutenção repetida',
    'Avisa o gestor quando uma OS concluída repete um item feito na mesma placa dentro da janela de repetição.',
    'ALTA',
    'Manutenção repetida em {{placa}}: {{item}}',
    '{{item}} foi feito de novo em {{placa}} na OS {{numero}}, {{diasDesdeAnterior}} dias depois da OS {{numeroOsAnterior}}.',
    ARRAY['frota:configuracao:write']);

