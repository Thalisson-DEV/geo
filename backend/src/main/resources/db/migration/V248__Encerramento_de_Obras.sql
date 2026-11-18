-- =====================================================================
-- V248: Fechamento de obras
--
-- A solicitação de fechamento é uma solicitação de material com contexto
-- FECHAMENTO: regulariza o saldo da obra no SAP (221/921/222/922), sem
-- agendamento, separação ou assinatura. O almoxarifado marca como
-- movimentado (parcial por quantidade) escolhendo o efeito no estoque:
-- FISICO (almoxarifado <-> estoque da obra) ou VIRTUAL (só registro).
--
-- O processo de obras não foi usado em produção: não há dados a migrar.
-- =====================================================================

-- Contexto novo -------------------------------------------------------
ALTER TABLE solicitacoes_material
    DROP CONSTRAINT IF EXISTS ck_solicitacoes_material_contexto;
ALTER TABLE solicitacoes_material
    ADD CONSTRAINT ck_solicitacoes_material_contexto
        CHECK (contexto IS NULL OR contexto IN ('COMERCIAL', 'TECNICO', 'FECHAMENTO'));

-- Dados próprios do fechamento ------------------------------------------
ALTER TABLE solicitacoes_material
    ADD COLUMN id_encarregado UUID,
    ADD COLUMN id_supervisor UUID,
    ADD COLUMN prazo_reserva_ate TIMESTAMP WITH TIME ZONE,
    ADD COLUMN prazo_movimentacao_ate TIMESTAMP WITH TIME ZONE,
    ADD COLUMN reserva_cumprida_em TIMESTAMP WITH TIME ZONE,
    ADD COLUMN movimentacao_concluida_em TIMESTAMP WITH TIME ZONE,
    ADD COLUMN situacao_fechamento VARCHAR(30),
    ADD COLUMN prazo_vigente_ate TIMESTAMP WITH TIME ZONE,
    ADD COLUMN cancelada_em TIMESTAMP WITH TIME ZONE,
    ADD COLUMN id_usuario_cancelamento UUID,
    ADD COLUMN motivo_cancelamento VARCHAR(500);

ALTER TABLE solicitacoes_material
    ADD CONSTRAINT ck_solicitacoes_material_fechamento CHECK (
        contexto IS DISTINCT FROM 'FECHAMENTO'
        OR (tipo_tecnico IN ('221', '921', '222', '922')
            AND id_obra IS NOT NULL
            AND tipo_obra_snapshot IS NOT NULL
            AND id_almoxarifado_atendimento IS NOT NULL
            AND situacao_fechamento IN (
                'AGUARDANDO_RESERVA', 'AGUARDANDO_MOVIMENTACAO',
                'MOVIMENTADA_PARCIALMENTE', 'MOVIMENTADA', 'CANCELADA')
            AND prazo_reserva_ate IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_solicitacoes_fechamento_obra
    ON solicitacoes_material (id_obra, situacao_fechamento)
    WHERE contexto = 'FECHAMENTO';
CREATE INDEX IF NOT EXISTS idx_solicitacoes_fechamento_requisitante
    ON solicitacoes_material (id_requisitante)
    WHERE contexto = 'FECHAMENTO';
CREATE INDEX IF NOT EXISTS idx_solicitacoes_fechamento_prazo
    ON solicitacoes_material (prazo_vigente_ate)
    WHERE contexto = 'FECHAMENTO';

-- Operação de movimentação com efeito no estoque ------------------------
-- O efeito só existe nas operações de fechamento; é a única coluna mutável
-- de uma operação (troca de efeito), sempre com movimentação de estoque e
-- evento no histórico.
ALTER TABLE operacoes_solicitacao_material
    ADD COLUMN efeito_estoque VARCHAR(10);

ALTER TABLE operacoes_solicitacao_material
    DROP CONSTRAINT IF EXISTS ck_operacoes_solicitacao_tipo;
ALTER TABLE operacoes_solicitacao_material
    ADD CONSTRAINT ck_operacoes_solicitacao_tipo
        CHECK (tipo IN ('ENTREGA', 'DEVOLUCAO', 'ESTORNO', 'ENCERRAMENTO', 'MOVIMENTACAO')),
    ADD CONSTRAINT ck_operacoes_solicitacao_efeito CHECK (
        (efeito_estoque IS NULL AND tipo <> 'MOVIMENTACAO')
        OR (efeito_estoque IN ('FISICO', 'VIRTUAL') AND tipo IN ('MOVIMENTACAO', 'ESTORNO'))
    );

-- Fechamento não tem ocorrência, nem quando a obra é corretiva/preventiva.
ALTER TABLE operacoes_solicitacao_material
    DROP CONSTRAINT IF EXISTS ck_operacoes_solicitacao_ocorrencia_final;
ALTER TABLE operacoes_solicitacao_material
    ADD CONSTRAINT ck_operacoes_solicitacao_ocorrencia_final CHECK (
        (efeito_estoque IS NOT NULL
            AND id_ocorrencia IS NULL AND codigo_ocorrencia_snapshot IS NULL)
        OR (tipo_obra_snapshot IN ('CORRETIVA', 'PREVENTIVA')
            AND id_ocorrencia IS NOT NULL AND codigo_ocorrencia_snapshot IS NOT NULL)
        OR (tipo_obra_snapshot IN ('OBRA', 'LPT')
            AND id_ocorrencia IS NULL AND codigo_ocorrencia_snapshot IS NULL)
    );

ALTER TABLE movimentacoes_estoque
    DROP CONSTRAINT IF EXISTS ck_movimentacoes_estoque_ocorrencia_final;
ALTER TABLE movimentacoes_estoque
    ADD CONSTRAINT ck_movimentacoes_estoque_ocorrencia_final CHECK (
        tipo_tecnico IS NULL
        OR (id_ocorrencia IS NULL AND codigo_ocorrencia_snapshot IS NULL)
        OR (tipo_obra_snapshot IN ('CORRETIVA', 'PREVENTIVA')
            AND id_ocorrencia IS NOT NULL AND codigo_ocorrencia_snapshot IS NOT NULL)
    );

-- Perfil e permissões ---------------------------------------------------
INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
VALUES
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'obras:fechamento:read'),
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'obras:fechamento:create'),
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'obras:fechamento:movimentar')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfis_acesso (id, nome, versao, data_criacao, usuario_criacao, ativo)
VALUES (gen_random_uuid(), 'TECNICO_FECHAMENTO', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE perfil.nome = 'ADMINISTRADOR'
  AND permissao.nome IN ('obras:fechamento:read', 'obras:fechamento:create', 'obras:fechamento:movimentar')
ON CONFLICT DO NOTHING;

-- Técnico de fechamento: cria e acompanha; lê o que as telas consultam.
INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE perfil.nome = 'TECNICO_FECHAMENTO'
  AND permissao.nome IN (
      'obras:fechamento:read',
      'obras:fechamento:create',
      'obras:obra:read',
      'estoque:estoque:read',
      'estoque:material:read',
      'estoque:saldo:read',
      'estoque:motivo-rejeicao:read',
      'rh:colaborador:read',
      'rh:supervisor:read',
      'rh:coordenador:read'
  )
ON CONFLICT DO NOTHING;

-- Almoxarifado: acompanha e movimenta (marca, troca efeito e estorna).
INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE perfil.nome = 'BACKOFFICE_ALMOXARIFADO'
  AND permissao.nome IN (
      'obras:fechamento:read',
      'obras:fechamento:movimentar',
      'obras:obra:read',
      'rh:supervisor:read',
      'rh:coordenador:read'
  )
ON CONFLICT DO NOTHING;
