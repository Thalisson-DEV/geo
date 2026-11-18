-- Almoxarifados regionais e saldo dos materiais de rede usados nos kits das obras (entradas de nota fiscal).
-- Base para as solicitações técnicas criadas pelo 23_solicitacoes_material.py. Idempotente.
BEGIN;
SELECT setseed(0.21);

INSERT INTO estoques (id, nome_identificador, id_tipo_estoque, id_base_operacional, ativo, data_criacao, versao, usuario_criacao)
SELECT gen_random_uuid(), x.nome, (SELECT id FROM tipos_estoque WHERE nome = 'FISICO'), (SELECT id FROM bases_operacionais WHERE nome = x.base), true, now() - interval '200 days', 0, 'USRADMIN'
  FROM (VALUES ('ALMOX JACOBINA', 'JACOBINA'), ('ALMOX SENHOR DO BONFIM', 'BONFIM')) x(nome, base)
 WHERE NOT EXISTS (SELECT 1 FROM estoques e WHERE e.nome_identificador = x.nome);
-- Estoque de campo (custódia) de cada equipe, exigido na entrega técnica
INSERT INTO estoques (id, nome_identificador, id_tipo_estoque, id_equipe, id_base_operacional, ativo, data_criacao, versao, usuario_criacao)
SELECT gen_random_uuid(), e.cod_equipe, (SELECT id FROM tipos_estoque WHERE nome = 'CAMPO'), e.id, e.id_base_operacional, true, now() - interval '200 days', 0, 'USRADMIN'
  FROM equipes e WHERE e.ativo AND NOT EXISTS (SELECT 1 FROM estoques x WHERE x.id_equipe = e.id)
   AND NOT EXISTS (SELECT 1 FROM estoques x WHERE x.nome_identificador = e.cod_equipe);
UPDATE estoques SET id_base_operacional = (SELECT id FROM bases_operacionais WHERE nome = 'JUAZEIRO')
 WHERE nome_identificador = 'ALMOX CENTRAL JUAZEIRO' AND id_base_operacional IS NULL;

CREATE TEMP TABLE _cota (cod text, qtd numeric, custo numeric) ON COMMIT DROP;
INSERT INTO _cota VALUES
 ('300115', 160, 1650), ('300116', 140, 2480), ('300101', 420, 210), ('300078', 900, 38), ('300220', 600, 52), ('300172', 380, 46),
 ('300045', 1500, 9.8), ('300012', 9000, 18.5), ('300011', 6000, 7.9), ('300201', 22000, 4.1), ('300202', 12000, 7.6),
 ('300210', 45, 6900), ('300211', 18, 14800), ('300212', 10, 19600), ('300144', 260, 410), ('300158', 600, 12), ('300130', 300, 165),
 ('300186', 420, 58), ('300230', 3500, 31), ('300240', 900, 6.5), ('300260', 1800, 11), ('300250', 2, 98000), ('300251', 6, 41000), ('300190', 400, 8);

-- Saldo: almox de Juazeiro com o volume principal, regionais com ~35%
INSERT INTO saldos (id, id_estoque, id_material, quantidade, condicao, custo_medio, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), e.id, m.id, round(c.qtd * CASE WHEN e.nome_identificador = 'ALMOX CENTRAL JUAZEIRO' THEN 1 ELSE 0.35 END), 'NOVO', c.custo, 0, now() - interval '60 days', 'GALMEIDA', true
  FROM _cota c JOIN materiais m ON m.cod_material = c.cod
  CROSS JOIN estoques e WHERE e.nome_identificador IN ('ALMOX CENTRAL JUAZEIRO', 'ALMOX JACOBINA', 'ALMOX SENHOR DO BONFIM')
ON CONFLICT (id_estoque, id_material, condicao) DO UPDATE SET quantidade = greatest(saldos.quantidade, EXCLUDED.quantidade), custo_medio = EXCLUDED.custo_medio;

-- Entradas que formaram o saldo (notas fiscais de fornecedores), espalhadas nos últimos 4 meses
INSERT INTO movimentacoes_estoque (id, id_estoque_origem, id_estoque_destino, id_material, quantidade, tipo_movimentacao, id_usuario_operador, data_hora,
                                   condicao, valor_unitario, motivo, documento, observacao, id_fornecedor, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), NULL, e.id, m.id, round(c.qtd * CASE WHEN e.nome_identificador = 'ALMOX CENTRAL JUAZEIRO' THEN 1 ELSE 0.35 END / 2), 'ENTRADA_AVULSA',
       coalesce((SELECT id FROM usuarios WHERE login = 'GALMEIDA'), (SELECT id FROM usuarios WHERE login = 'USRADMIN')),
       now() - ((10 + g * 47 + abs(hashtext(c.cod)) % 20) || ' days')::interval, 'NOVO', c.custo, 'COMPRA', 'NF ' || (40210 + abs(hashtext(c.cod || g)) % 9000),
       'Entrada de material de rede para a carteira de obras', (SELECT id FROM financeiro_fornecedor WHERE ativo ORDER BY id LIMIT 1 OFFSET abs(hashtext(c.cod)) % 20),
       0, now() - ((10 + g * 47 + abs(hashtext(c.cod)) % 20) || ' days')::interval, 'GALMEIDA', true
  FROM _cota c JOIN materiais m ON m.cod_material = c.cod
  CROSS JOIN estoques e CROSS JOIN generate_series(0, 1) g
 WHERE e.nome_identificador IN ('ALMOX CENTRAL JUAZEIRO', 'ALMOX JACOBINA', 'ALMOX SENHOR DO BONFIM')
   AND NOT EXISTS (SELECT 1 FROM movimentacoes_estoque x WHERE x.id_estoque_destino = e.id AND x.id_material = m.id AND x.observacao = 'Entrada de material de rede para a carteira de obras');
COMMIT;
