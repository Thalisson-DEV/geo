-- V195: linha do tempo do desconto, desfazer decisões e o status FINALIZADO.
--
-- Até aqui o desconto guardava só a ÚLTIMA validação, baixa ou rejeição, em colunas
-- próprias. Com a possibilidade de desfazer cada uma dessas etapas, as colunas passam
-- a ser apagadas, e a trilha precisa viver em outro lugar: uma linha por fato,
-- imutável, com quem fez, quando, por quanto e por quê.
--
-- FINALIZADO é o desconto baixado em folha que recebeu o termo impresso pelo C.E.S e
-- assinado pelo colaborador. O arquivo fica entre os anexos, marcado como o termo.


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1) Finalização
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE desconto
    ADD COLUMN usuario_finalizacao_id UUID,
    ADD COLUMN data_finalizacao TIMESTAMP WITH TIME ZONE;

ALTER TABLE desconto_anexo
    ADD COLUMN termo_assinado BOOLEAN NOT NULL DEFAULT FALSE;

-- No máximo um termo assinado vigente por desconto.
CREATE UNIQUE INDEX uq_desconto_anexo_termo_assinado
    ON desconto_anexo (desconto_id)
    WHERE termo_assinado AND ativo;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2) Linha do tempo
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE desconto_evento (
    id UUID PRIMARY KEY,
    id_desconto UUID NOT NULL REFERENCES desconto (id),
    tipo VARCHAR(30) NOT NULL,
    status_anterior VARCHAR(20),
    status_novo VARCHAR(20) NOT NULL,
    id_usuario UUID,
    valor NUMERIC(12, 2),
    texto TEXT,
    id_anexo UUID,
    ocorrido_em TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_desconto_evento_tipo CHECK (tipo IN (
        'LANCADO', 'DADOS_ALTERADOS', 'ITEM_INCLUIDO', 'ITEM_ALTERADO', 'ITEM_REMOVIDO',
        'ANEXO_INCLUIDO', 'ANEXO_REMOVIDO', 'VALIDADO', 'REJEITADO', 'BAIXADO',
        'FINALIZADO', 'DECISAO_DESFEITA'))
);

CREATE INDEX idx_desconto_evento_desconto ON desconto_evento (id_desconto, ocorrido_em);


-- O passado é reconstruído a partir das colunas: é tudo o que se sabe dele, e é
-- exatamente o que o termo já mostrava. Itens e anexos entram com a data em que
-- foram gravados; alterações de dados anteriores a esta versão não deixaram rastro.
INSERT INTO desconto_evento (id, id_desconto, tipo, status_anterior, status_novo, id_usuario, valor, texto, id_anexo, ocorrido_em)
SELECT gen_random_uuid(), d.id, e.tipo, e.anterior, e.novo, e.usuario, e.valor, e.texto, NULL, e.quando
  FROM desconto d
 CROSS JOIN LATERAL (VALUES
       ('LANCADO', NULL, 'SOLICITADO', d.usuario_solicitante_id, NULL::NUMERIC, NULL::TEXT, d.data_criacao),
       ('VALIDADO', 'SOLICITADO', 'VALIDADO', d.usuario_validador_id, d.valor_validado, NULL,
           CASE WHEN d.status IN ('VALIDADO', 'BAIXADO') THEN d.data_validacao END),
       ('BAIXADO', 'VALIDADO', 'BAIXADO', d.usuario_baixa_id, d.valor_baixado, NULL,
           CASE WHEN d.status = 'BAIXADO' THEN d.data_baixa END),
       ('REJEITADO', 'SOLICITADO', 'REJEITADO', d.usuario_rejeicao_id, NULL, d.motivo_rejeicao,
           CASE WHEN d.status = 'REJEITADO' THEN COALESCE(d.data_rejeicao, d.data_ultima_alteracao) END)
      ) AS e(tipo, anterior, novo, usuario, valor, texto, quando)
 WHERE e.quando IS NOT NULL;

-- Itens e comprovantes já gravados: entram com o status em que o desconto estava
-- ao recebê-los (sempre antes da validação para itens).
INSERT INTO desconto_evento (id, id_desconto, tipo, status_anterior, status_novo, id_usuario, valor, texto, id_anexo, ocorrido_em)
SELECT gen_random_uuid(), i.desconto_id, 'ITEM_INCLUIDO', NULL, 'SOLICITADO', d.usuario_solicitante_id,
       i.valor, i.descricao_material || ' (' || t.descricao || ')', NULL, i.data_criacao
  FROM desconto_item i
  JOIN desconto d ON d.id = i.desconto_id
  JOIN tipo_equipamento t ON t.id = i.tipo_equipamento_id
 WHERE i.ativo;

INSERT INTO desconto_evento (id, id_desconto, tipo, status_anterior, status_novo, id_usuario, valor, texto, id_anexo, ocorrido_em)
SELECT gen_random_uuid(), a.desconto_id, 'ANEXO_INCLUIDO', NULL,
       CASE WHEN d.data_validacao IS NOT NULL AND a.data_criacao > d.data_validacao THEN 'VALIDADO' ELSE 'SOLICITADO' END,
       NULL, NULL, a.nome_arquivo, a.id, a.data_criacao
  FROM desconto_anexo a
  JOIN desconto d ON d.id = a.desconto_id
 WHERE a.ativo;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3) O que já estava baixado vira finalizado
-- ═══════════════════════════════════════════════════════════════════════════════
-- A exigência do termo assinado vale só para descontos novos ou ainda não baixados.
-- Os já baixados ficam finalizados pelo sistema, sem termo anexado; a linha do tempo
-- registra que foi automático. A data é a da baixa, que foi quando o ciclo terminou.

INSERT INTO desconto_evento (id, id_desconto, tipo, status_anterior, status_novo, id_usuario, valor, texto, id_anexo, ocorrido_em)
SELECT gen_random_uuid(), d.id, 'FINALIZADO', 'BAIXADO', 'FINALIZADO', NULL, NULL,
       'Finalizado automaticamente pelo sistema: baixado antes da exigência do termo assinado.',
       NULL, COALESCE(d.data_baixa, d.data_ultima_alteracao, d.data_criacao) + INTERVAL '1 second'
  FROM desconto d
 WHERE d.status = 'BAIXADO';

UPDATE desconto
   SET status = 'FINALIZADO',
       data_finalizacao = COALESCE(data_baixa, data_ultima_alteracao, data_criacao)
 WHERE status = 'BAIXADO';
