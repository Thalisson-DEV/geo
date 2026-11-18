BEGIN;
WITH c AS (SELECT id, row_number() over (order by nome_completo_hash) rn FROM colaboradores WHERE ativo LIMIT 30),
m AS (SELECT array_agg(id) a FROM motivo_desconto),
u AS (SELECT id FROM usuarios WHERE login='USRADMIN'),
g AS (SELECT c.id cid, c.rn, (ARRAY['SOLICITADO','VALIDADO','BAIXADO','REJEITADO','BAIXADO','VALIDADO'])[1+(c.rn % 6)] st,
   round((80+random()*1400)::numeric,2) val, now() - ((5+c.rn*5)||' days')::interval dt FROM c)
INSERT INTO desconto (id, colaborador_id, motivo_desconto_id, observacoes, quantidade_parcelas, usuario_solicitante_id, usuario_validador_id, usuario_baixa_id,
  status, data_validacao, data_baixa, versao, data_criacao, usuario_criacao, ativo, data_ocorrencia, motivo_rejeicao, usuario_rejeicao_id, data_rejeicao,
  valor_sugerido, valor_validado, valor_baixado)
SELECT gen_random_uuid(), g.cid, m.a[1+(g.rn % array_length(m.a,1))],
  (ARRAY['Extravio de alicate amperímetro durante atendimento','Avaria no retrovisor da viatura em manobra','Perda de EPI (luva isolante classe 0)','Dano ao rádio comunicador','Uso indevido de cartão combustível','Avaria em escada de fibra'])[1+(g.rn % 6)],
  1+(g.rn % 4), u.id,
  CASE WHEN g.st IN ('VALIDADO','BAIXADO') THEN u.id END, CASE WHEN g.st='BAIXADO' THEN u.id END,
  g.st, CASE WHEN g.st IN ('VALIDADO','BAIXADO') THEN g.dt + interval '2 days' END, CASE WHEN g.st='BAIXADO' THEN g.dt + interval '9 days' END,
  0, g.dt, 'USRADMIN', true, g.dt - interval '1 day',
  CASE WHEN g.st='REJEITADO' THEN 'Responsabilidade do colaborador não comprovada no relatório de ocorrência' END,
  CASE WHEN g.st='REJEITADO' THEN u.id END, CASE WHEN g.st='REJEITADO' THEN g.dt + interval '3 days' END,
  g.val, CASE WHEN g.st IN ('VALIDADO','BAIXADO') THEN g.val END, CASE WHEN g.st='BAIXADO' THEN g.val END
FROM g, m, u;
COMMIT;
