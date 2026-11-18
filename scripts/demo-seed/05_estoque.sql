BEGIN;
INSERT INTO materiais (id, cod_material, descricao, unidade_medida, detalha_serie, id_processo, ativo, versao, data_criacao, usuario_criacao)
SELECT gen_random_uuid(), m.cod, m.descr, m.un, false, (SELECT id_processo FROM materiais ORDER BY data_criacao LIMIT 1), true, 0, now()-interval '170 days', 'USRADMIN'
FROM (VALUES ('300011','CABO ALUMINIO MULTIPLEXADO 2X1X16MM2','M'),('300012','CABO ALUMINIO MULTIPLEXADO 3X1X35+35MM2','M'),
('300045','CONECTOR PERFURANTE 10-95MM2','UN'),('300078','ISOLADOR DE PINO POLIMERICO 15KV','UN'),('300101','CRUZETA CONCRETO 2000MM','UN'),
('300115','POSTE CONCRETO DUPLO T 11M 300DAN','UN'),('300130','PARA-RAIOS POLIMERICO 12KV','UN'),('300144','CHAVE FUSIVEL 15KV 100A','UN'),
('300158','ELO FUSIVEL 10K','UN'),('300172','ARMACAO SECUNDARIA 1 ESTRIBO','UN'),('300186','HASTE DE ATERRAMENTO 2400MM','UN'),('300190','FITA ISOLANTE 19MM X 20M','RL')) m(cod,descr,un)
ON CONFLICT (cod_material) DO NOTHING;

INSERT INTO saldos (id, id_estoque, id_material, quantidade, condicao)
SELECT gen_random_uuid(), e.id, m.id, round((5+random()*400)::numeric,0), 'NOVO'
FROM estoques e CROSS JOIN materiais m WHERE m.cod_material BETWEEN '300011' AND '300190'
ON CONFLICT (id_estoque, id_material, condicao) DO NOTHING;

INSERT INTO movimentacoes_estoque (id, id_estoque_origem, id_estoque_destino, id_material, quantidade, tipo_movimentacao, id_usuario_operador, data_hora, condicao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(),
  CASE WHEN gs%3=0 THEN s.id_estoque END, CASE WHEN gs%3<>0 THEN s.id_estoque END, s.id_material,
  round((1+random()*60)::numeric,0), CASE WHEN gs%3=0 THEN 'BAIXA_AVULSA' ELSE 'ENTRADA_AVULSA' END,
  (SELECT id FROM usuarios WHERE login='USRADMIN'), now()-((gs*2.3)||' days')::interval, 'NOVO', 0, now()-((gs*2.3)||' days')::interval, 'USRADMIN', true
FROM generate_series(1,60) gs
JOIN LATERAL (SELECT id_estoque, id_material FROM saldos WHERE condicao='NOVO' ORDER BY md5(id::text||gs) LIMIT 1) s ON true;
COMMIT;
