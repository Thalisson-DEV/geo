-- Medidas disciplinares (change rh-medidas-disciplinares): o lançamento passa a ser feito depois
-- que a medida foi aplicada ao colaborador. Saem o rascunho (em análise), a ciência do
-- colaborador (com testemunhas e o aviso de ciência pendente) e o termo em PDF: a empresa já tem
-- o próprio termo, e o documento assinado vai como anexo, opcional.
-- Situações que ficam: APLICADA e CANCELADA. Rascunhos e medidas cientes viram aplicadas; a data
-- da aplicação do rascunho é a prevista (limitada ao dia em que ele foi criado, para não ficar no
-- futuro) ou, sem ela, a do fato.
-- O histórico mantém os eventos antigos de aplicação e ciência.
-- Rollback: recriar as colunas, os CHECKs e as regras da V209 e DROP NOT NULL em data_aplicacao.

UPDATE rh_medidas_disciplinares
   SET situacao = 'APLICADA',
       aplicada_em = COALESCE(aplicada_em, data_criacao),
       data_aplicacao = GREATEST(data_fato, LEAST(COALESCE(data_aplicacao, data_fato), CAST(data_criacao AS DATE)))
 WHERE situacao = 'RASCUNHO';

UPDATE rh_medidas_disciplinares SET situacao = 'APLICADA' WHERE situacao = 'CIENTE';

UPDATE rh_medidas_disciplinares
   SET data_aplicacao = data_fato
 WHERE data_aplicacao IS NULL;

ALTER TABLE rh_medidas_disciplinares
    DROP CONSTRAINT ck_rh_medida_situacao,
    DROP CONSTRAINT ck_rh_medida_aplicacao,
    DROP CONSTRAINT ck_rh_medida_ciencia,
    DROP CONSTRAINT ck_rh_medida_recusa,
    DROP COLUMN ciencia_em,
    DROP COLUMN ciencia_recusada,
    DROP COLUMN testemunha_1,
    DROP COLUMN testemunha_2,
    DROP COLUMN aviso_ciencia_em,
    ALTER COLUMN situacao SET DEFAULT 'APLICADA',
    ALTER COLUMN data_aplicacao SET NOT NULL,
    ADD CONSTRAINT ck_rh_medida_situacao CHECK (situacao IN ('APLICADA', 'CANCELADA')),
    ADD CONSTRAINT ck_rh_medida_aplicacao CHECK (data_aplicacao >= data_fato);

ALTER TABLE rh_tipos_medida_disciplinar DROP COLUMN texto_termo;
ALTER TABLE rh_parametros DROP COLUMN dias_aviso_ciencia, DROP COLUMN empresa_nome;
ALTER TABLE rh_medida_disciplinar_anexos DROP COLUMN termo_assinado;

-- Aviso de ciência pendente: a regra de fábrica sai, e a automação convertida dela, se houver, é
-- arquivada (sem exclusão, para o histórico de execuções).
UPDATE regras_notificacao
   SET ativo = FALSE, data_desativacao = CURRENT_TIMESTAMP
 WHERE chave_gatilho = 'rh.medida_ciencia_pendente' AND ativo;

UPDATE automacoes
   SET status = 'ARQUIVADA', data_ultima_alteracao = CURRENT_TIMESTAMP
 WHERE chave_evento = 'rh.medida_ciencia_pendente' AND status <> 'ARQUIVADA';

UPDATE regras_notificacao
   SET descricao = 'Avisa o RH quando uma medida disciplinar aplicada é lançada.',
       corpo_template = 'Motivo: {{motivo}}. Base: {{base}}. Fato em {{dataFato}}.'
 WHERE chave_gatilho = 'rh.medida_aplicada' AND sistema;
