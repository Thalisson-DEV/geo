-- Frota: rastreadores restantes, resumo diário da telemetria, turnos, preços e faturas dos postos, estoque da oficina.
BEGIN;
SELECT setseed(0.73);

CREATE TEMP TABLE v AS
SELECT row_number() OVER (ORDER BY placa) - 1 AS n, id, placa, id_base_operacional FROM veiculos WHERE ativo;

-- Rastreadores para os veículos que ainda não têm
INSERT INTO frota_telemetria_rastreadores (id, versao, data_criacao, usuario_criacao, ativo, provedor, id_externo, placa_provedor, nome_provedor, id_veiculo,
  situacao, vinculo_manual, ultima_comunicacao, latitude, longitude, velocidade_kmh, ignicao, odometro_metros)
SELECT gen_random_uuid(), 0, now(), 'USRADMIN', true, CASE WHEN v.n % 2 = 0 THEN 'UBICALY' ELSE 'ZUQ' END,
  (358240051120000 + v.n * 7919)::text, v.placa, v.placa, v.id, 'VINCULADO', false,
  now() - (v.n * 3) * interval '1 minute',
  -9.41 + (v.n % 5) * 0.21 - random() * 0.05, -40.50 + (v.n % 4) * 0.33 + random() * 0.05,
  CASE WHEN v.n % 3 = 0 THEN 0 ELSE round((20 + random() * 60)::numeric) END, v.n % 3 <> 0,
  ((42000 + v.n * 3100) * 1000)::bigint
FROM v WHERE NOT EXISTS (SELECT 1 FROM frota_telemetria_rastreadores r WHERE r.id_veiculo = v.id);

-- Resumo diário dos últimos 45 dias
INSERT INTO frota_telemetria_dias (id_veiculo, dia, id_rastreador, km, minutos_movimento, minutos_ligado_parado, km_fora_expediente, minutos_fora_expediente, primeira_partida, ultima_parada, pontos, calculado_em)
SELECT r.id_veiculo, d::date, r.id,
  CASE WHEN extract(dow FROM d) = 0 THEN round((random() * 8)::numeric, 1) ELSE round((60 + random() * 190)::numeric, 1) END,
  CASE WHEN extract(dow FROM d) = 0 THEN floor(random() * 20) ELSE 150 + floor(random() * 230) END,
  CASE WHEN extract(dow FROM d) = 0 THEN 0 ELSE 10 + floor(random() * 75) END,
  CASE WHEN random() < 0.12 THEN round((5 + random() * 40)::numeric, 1) ELSE 0 END,
  CASE WHEN random() < 0.12 THEN 10 + floor(random() * 60) ELSE 0 END,
  d + interval '6 hours 50 minutes' + random() * interval '50 minutes',
  d + interval '17 hours' + random() * interval '90 minutes',
  CASE WHEN extract(dow FROM d) = 0 THEN 12 ELSE 400 + floor(random() * 500) END,
  now()
FROM frota_telemetria_rastreadores r
CROSS JOIN generate_series(current_date - 45, current_date - 1, interval '1 day') d
WHERE r.id_veiculo IS NOT NULL
ON CONFLICT DO NOTHING;

-- Turnos já existentes cruzados com a telemetria
INSERT INTO frota_telemetria_turnos (id_turno, id_veiculo, id_equipe, id_base_operacional, inicio, fim, com_telemetria, km, minutos_movimento, minutos_parado_servico,
  minutos_parado_base, minutos_parado_sem_servico, minutos_ligado_parado, saida_base_em, chegada_base_em, notas, valor_faturado, notas_no_local, notas_fora_local, notas_sem_dado, calculado_em)
SELECT t.id, coalesce(t.id_veiculo, (SELECT id FROM v WHERE n = (abs(hashtext(t.id::text)) % (SELECT count(*) FROM v)))), t.id_equipe, e.id_base_operacional,
  t.data_inicio, coalesce(t.data_fim, t.data_inicio + interval '9 hours'), true,
  round((40 + random() * 140)::numeric, 1), 120 + floor(random() * 120), 150 + floor(random() * 120), 25 + floor(random() * 30),
  floor(random() * 50), 10 + floor(random() * 40), t.data_inicio + interval '25 minutes', coalesce(t.data_fim, t.data_inicio + interval '9 hours') - interval '20 minutes',
  n.notas, round((n.notas * (380 + random() * 600))::numeric, 2), greatest(n.notas - 1, 0), CASE WHEN n.notas > 0 THEN 1 ELSE 0 END, 0, now()
FROM turnos t
JOIN equipes e ON e.id = t.id_equipe
CROSS JOIN LATERAL (SELECT (3 + floor(random() * 6))::int AS notas) n
WHERE t.data_inicio IS NOT NULL
ON CONFLICT DO NOTHING;

-- Preços praticados nos postos
INSERT INTO frota_posto_precos (id, versao, data_criacao, usuario_criacao, ativo, id_posto, id_produto, preco_unitario, vigente_desde, origem)
SELECT gen_random_uuid(), 0, now(), 'USRADMIN', true, p.id, pr.id,
  CASE pr.nome WHEN 'Diesel S10' THEN 6.05 WHEN 'Diesel S500' THEN 5.89 WHEN 'Gasolina comum' THEN 6.29 WHEN 'Etanol' THEN 4.49 ELSE 3.20 END + round((random() * 0.25)::numeric, 2) + k.delta,
  current_date - k.dias, 'MANUAL'
FROM frota_postos p
CROSS JOIN frota_produtos_abastecimento pr
CROSS JOIN (VALUES (60, -0.12), (20, 0.00)) k(dias, delta)
WHERE pr.nome IN ('Diesel S10', 'Diesel S500', 'Gasolina comum', 'Etanol', 'ARLA 32');

-- Faturas quinzenais dos postos (as anteriores conferidas/enviadas) e vínculo dos abastecimentos
INSERT INTO frota_faturas_posto (id, versao, data_criacao, usuario_criacao, ativo, id_posto, numero, periodo_inicio, periodo_fim, valor, situacao, conferida_em, id_usuario_conferencia)
SELECT gen_random_uuid(), 0, now(), 'USRADMIN', true, p.id,
  'FAT-' || to_char(q.ini, 'YYMMDD') || '-' || lpad((row_number() OVER ())::text, 3, '0'),
  q.ini, q.fim, 0,
  CASE WHEN q.fim < current_date - 30 THEN 'ENVIADA_AO_FINANCEIRO' WHEN q.fim < current_date - 10 THEN 'CONFERIDA' ELSE 'RASCUNHO' END,
  CASE WHEN q.fim < current_date - 10 THEN q.fim + interval '3 days' END,
  CASE WHEN q.fim < current_date - 10 THEN (SELECT id FROM usuarios ORDER BY data_criacao LIMIT 1) END
FROM frota_postos p
CROSS JOIN (SELECT d::date AS ini, (d + interval '14 days')::date AS fim
            FROM generate_series(date_trunc('month', current_date - 90), current_date - 15, interval '15 days') d) q;

UPDATE frota_abastecimentos a SET id_fatura = f.id
FROM frota_faturas_posto f
WHERE a.situacao = 'REALIZADA' AND a.id_posto = f.id_posto AND a.realizado_em::date BETWEEN f.periodo_inicio AND f.periodo_fim;

UPDATE frota_faturas_posto f SET valor = coalesce(s.total, 0)
FROM (SELECT a.id_fatura, sum(i.valor_total) total FROM frota_abastecimentos a JOIN frota_abastecimento_itens i ON i.id_abastecimento = a.id
      WHERE a.id_fatura IS NOT NULL GROUP BY 1) s
WHERE s.id_fatura = f.id;
DELETE FROM frota_faturas_posto f WHERE valor = 0 AND NOT EXISTS (SELECT 1 FROM frota_abastecimentos a WHERE a.id_fatura = f.id);

-- Estoque da oficina
INSERT INTO estoques (id, versao, data_criacao, usuario_criacao, ativo, nome_identificador, id_tipo_estoque, id_base_operacional)
SELECT gen_random_uuid(), 0, now(), 'USRADMIN', true, x.nome, (SELECT id FROM tipos_estoque WHERE nome = 'FROTA'),
       (SELECT id_base_operacional FROM v WHERE n = x.k)
FROM (VALUES (0, 'OFICINA JUAZEIRO'), (3, 'OFICINA JACOBINA')) x(k, nome)
WHERE NOT EXISTS (SELECT 1 FROM estoques e WHERE e.nome_identificador = x.nome);

INSERT INTO materiais (id, versao, data_criacao, usuario_criacao, ativo, cod_material, descricao, unidade_medida, detalha_serie, catalogo, grupo)
SELECT gen_random_uuid(), 0, now(), 'USRADMIN', true, x.cod, x.descr, x.un, false, 'FROTA', x.grupo
FROM (VALUES
  ('FRT-0001', 'FILTRO DE ÓLEO HILUX/S10 2.8 DIESEL', 'UN', 'Filtros'),
  ('FRT-0002', 'FILTRO DE AR MOTOR PICAPE MÉDIA', 'UN', 'Filtros'),
  ('FRT-0003', 'FILTRO DE COMBUSTÍVEL DIESEL', 'UN', 'Filtros'),
  ('FRT-0004', 'ÓLEO DE MOTOR 15W40 SINTÉTICO', 'L', 'Lubrificantes'),
  ('FRT-0005', 'ÓLEO HIDRÁULICO ISO 68', 'L', 'Lubrificantes'),
  ('FRT-0006', 'FLUIDO DE FREIO DOT 4', 'L', 'Lubrificantes'),
  ('FRT-0007', 'PASTILHA DE FREIO DIANTEIRA PICAPE', 'JG', 'Freios'),
  ('FRT-0008', 'LONA DE FREIO TRASEIRA CAMINHÃO', 'JG', 'Freios'),
  ('FRT-0009', 'BATERIA 100AH SELADA', 'UN', 'Elétrica'),
  ('FRT-0010', 'LÂMPADA H4 12V', 'UN', 'Elétrica'),
  ('FRT-0011', 'PALHETA LIMPADOR PARA-BRISA', 'PAR', 'Acessórios'),
  ('FRT-0012', 'CORREIA POLY-V MOTOR DIESEL', 'UN', 'Motor'),
  ('FRT-0013', 'MANGUEIRA HIDRÁULICA 1/2 POL', 'M', 'Hidráulico'),
  ('FRT-0014', 'ARLA 32 BALDE 20L', 'UN', 'Lubrificantes')
) x(cod, descr, un, grupo)
ON CONFLICT (cod_material) DO NOTHING;

INSERT INTO saldos (id, versao, data_criacao, usuario_criacao, ativo, id_estoque, id_material, quantidade, condicao, custo_medio)
SELECT gen_random_uuid(), 0, now(), 'USRADMIN', true, e.id, m.id,
  CASE WHEN (abs(hashtext(e.id::text || m.id::text)) % 9) = 0 THEN 1 ELSE 2 + abs(hashtext(m.cod_material || e.nome_identificador)) % 30 END,
  'NOVO',
  CASE m.grupo WHEN 'Filtros' THEN 48 WHEN 'Lubrificantes' THEN 32 WHEN 'Freios' THEN 210 WHEN 'Elétrica' THEN 95 WHEN 'Motor' THEN 160 WHEN 'Hidráulico' THEN 55 ELSE 40 END
    + round((random() * 30)::numeric, 2)
FROM estoques e CROSS JOIN materiais m
WHERE e.nome_identificador IN ('OFICINA JUAZEIRO', 'OFICINA JACOBINA') AND m.catalogo = 'FROTA'
ON CONFLICT DO NOTHING;

INSERT INTO estoque_parametros_material (id, id_estoque, id_material, estoque_minimo, localizacao, usuario_criacao)
SELECT gen_random_uuid(), s.id_estoque, s.id_material, 4, 'Prateleira ' || chr(65 + abs(hashtext(s.id_material::text)) % 5) || '-' || (1 + abs(hashtext(s.id::text)) % 6), 'USRADMIN'
FROM saldos s JOIN materiais m ON m.id = s.id_material AND m.catalogo = 'FROTA'
ON CONFLICT DO NOTHING;

INSERT INTO movimentacoes_estoque (id, versao, data_criacao, usuario_criacao, ativo, id_estoque_origem, id_estoque_destino, id_material, quantidade, tipo_movimentacao,
  id_usuario_operador, data_hora, condicao, valor_unitario, motivo, documento, observacao, id_veiculo)
SELECT gen_random_uuid(), 0, now(), 'USRADMIN', true,
  CASE WHEN g % 3 = 0 THEN NULL ELSE s.id_estoque END,
  CASE WHEN g % 3 = 0 THEN s.id_estoque END,
  s.id_material, 1 + g % 4, CASE WHEN g % 3 = 0 THEN 'ENTRADA_AVULSA' ELSE 'BAIXA_AVULSA' END,
  (SELECT id FROM usuarios ORDER BY data_criacao LIMIT 1), now() - (g * 2) * interval '1 day', 'NOVO', s.custo_medio,
  CASE WHEN g % 3 = 0 THEN 'COMPRA' ELSE 'APLICACAO_VEICULO' END,
  CASE WHEN g % 3 = 0 THEN 'NF ' || (18200 + g) END,
  CASE WHEN g % 3 = 0 THEN 'Reposição de estoque da oficina' ELSE 'Aplicado em manutenção' END,
  CASE WHEN g % 3 = 0 THEN NULL ELSE (SELECT id FROM v WHERE n = g % (SELECT count(*) FROM v)) END
FROM generate_series(1, 40) g
JOIN LATERAL (SELECT s.* FROM saldos s JOIN materiais m ON m.id = s.id_material AND m.catalogo = 'FROTA' ORDER BY s.id OFFSET g % 28 LIMIT 1) s ON true;

COMMIT;
