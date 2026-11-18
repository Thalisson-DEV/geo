-- Frota: postos, implementos, ordens de serviço, abastecimentos e despesas.
BEGIN;
SELECT setseed(0.42);

CREATE TEMP TABLE v AS
SELECT row_number() OVER (ORDER BY placa) - 1 AS n, id, placa, id_base_operacional
FROM veiculos WHERE ativo AND placa NOT LIKE 'TST%';
CREATE TEMP TABLE c AS
SELECT row_number() OVER (ORDER BY id) - 1 AS n, id_colaborador AS id FROM frota_condutores;
CREATE TEMP TABLE f AS
SELECT row_number() OVER (ORDER BY id) - 1 AS n, id FROM financeiro_fornecedor WHERE ativo LIMIT 30;
CREATE TEMP TABLE im AS
SELECT row_number() OVER (ORDER BY nome) - 1 AS n, id, nome FROM frota_itens_manutencao;
CREATE TEMP TABLE u AS SELECT id FROM usuarios ORDER BY data_criacao LIMIT 1;

-- Postos
INSERT INTO frota_postos (id, versao, data_criacao, usuario_criacao, ativo, nome, cnpj, id_base_operacional, whatsapp, id_fornecedor, observacao)
SELECT gen_random_uuid(), 0, now(), 'USRADMIN', true, p.nome, p.cnpj,
       (SELECT id_base_operacional FROM v WHERE n = p.k % (SELECT count(*) FROM v)), p.zap,
       (SELECT id FROM f WHERE n = p.k + 10), p.obs
FROM (VALUES
  (0, 'Posto Rio São Francisco', '12345678000190', '(74) 99812-4410', 'Aceita faturamento quinzenal'),
  (1, 'Auto Posto Chapada Diamantina', '23456789000101', '(74) 99977-1022', NULL),
  (2, 'Posto Avenida Juazeiro', '34567890000112', '(74) 98844-3109', 'Atendimento 24h'),
  (3, 'Posto Estrela do Sertão', '45678901000123', '(75) 99120-7788', NULL),
  (4, 'Auto Posto BR-407', '56789012000134', '(74) 99655-2301', 'Prioridade para veículos com implemento'),
  (5, 'Posto Lago de Sobradinho', '67890123000145', '(74) 98102-6654', NULL)
) AS p(k, nome, cnpj, zap, obs);

-- Tipos de implemento e implementos
INSERT INTO frota_tipos_implemento (id, versao, data_criacao, usuario_criacao, ativo, nome, descricao)
SELECT gen_random_uuid(), 0, now(), 'USRADMIN', true, x.nome, x.d
FROM (VALUES ('Cesto aéreo', 'Plataforma isolada para trabalho em altura'),
             ('Guindauto (Munck)', 'Guindaste articulado sobre chassi'),
             ('Carretinha de bobina', 'Reboque para transporte de bobinas de cabo'),
             ('Gerador portátil', 'Gerador a diesel para apoio em campo')) x(nome, d)
WHERE NOT EXISTS (SELECT 1 FROM frota_tipos_implemento t WHERE t.nome = x.nome);

INSERT INTO frota_implementos (id, versao, data_criacao, usuario_criacao, ativo, identificacao, id_tipo_implemento, fabricante, modelo, numero_serie, ano_fabricacao, id_base_operacional, situacao, observacao)
SELECT gen_random_uuid(), 0, now(), 'USRADMIN', true, x.ident, (SELECT id FROM frota_tipos_implemento WHERE nome = x.tipo),
       x.fab, x.modelo, x.serie, x.ano, (SELECT id_base_operacional FROM v WHERE n = x.k % (SELECT count(*) FROM v)), x.sit, NULL
FROM (VALUES
  (0, 'CA-014', 'Cesto aéreo', 'Ruthmann', 'TB 270', 'RT27-88412', 2021, 'ATIVO'),
  (1, 'CA-019', 'Cesto aéreo', 'Ruthmann', 'TB 270', 'RT27-90155', 2022, 'EM_MANUTENCAO'),
  (2, 'MK-007', 'Guindauto (Munck)', 'Madal Palfinger', 'MD 20.5', 'MP205-55120', 2020, 'ATIVO'),
  (3, 'MK-011', 'Guindauto (Munck)', 'Madal Palfinger', 'MD 30.5', 'MP305-61877', 2023, 'ATIVO'),
  (4, 'CB-003', 'Carretinha de bobina', 'Rodofort', 'RB 1500', 'RF15-20931', 2019, 'ATIVO'),
  (5, 'CB-005', 'Carretinha de bobina', 'Rodofort', 'RB 1500', 'RF15-21544', 2019, 'RESERVA'),
  (6, 'GE-021', 'Gerador portátil', 'Toyama', 'TDG 8000', 'TY8-77310', 2022, 'ATIVO'),
  (7, 'GE-024', 'Gerador portátil', 'Toyama', 'TDG 8000', 'TY8-80266', 2023, 'PARADO')
) x(k, ident, tipo, fab, modelo, serie, ano, sit);

-- Ordens de serviço (60, nos últimos ~5 meses; as mais recentes ainda em aberto)
CREATE TEMP TABLE os_seed AS
SELECT i,
       gen_random_uuid() AS id,
       (SELECT id FROM v WHERE n = i % (SELECT count(*) FROM v)) AS id_veiculo,
       (SELECT placa FROM v WHERE n = i % (SELECT count(*) FROM v)) AS placa,
       (SELECT id_base_operacional FROM v WHERE n = i % (SELECT count(*) FROM v)) AS id_base,
       (SELECT id FROM c WHERE n = i % (SELECT count(*) FROM c)) AS id_condutor,
       now() - ((61 - i) * interval '2 days 11 hours') - (i % 7) * interval '1 hour' AS aberta_em,
       CASE WHEN i > 52 THEN (ARRAY['PENDENTE','AGENDADA','EM_ANDAMENTO'])[1 + i % 3]
            WHEN i % 13 = 0 THEN 'CANCELADA' ELSE 'CONCLUIDA' END AS situacao,
       CASE WHEN i % 4 = 0 THEN 'PREVENTIVA' ELSE 'CORRETIVA' END AS tipo,
       (ARRAY['URGENTE','ALTA','MEDIA','MEDIA','BAIXA'])[1 + i % 5] AS criticidade,
       CASE WHEN i % 3 = 0 THEN 'INTERNA' ELSE 'EXTERNA' END AS oficina,
       (SELECT id FROM im WHERE n = i % (SELECT count(*) FROM im)) AS id_item,
       (SELECT nome FROM im WHERE n = i % (SELECT count(*) FROM im)) AS item_nome,
       round((180 + random() * 2600)::numeric, 2) AS mao_obra,
       round((90 + random() * 3400)::numeric, 2) AS pecas,
       (38000 + i * 1450 + floor(random() * 900))::bigint AS km
FROM generate_series(1, 60) i;

INSERT INTO frota_ordens_servico (id, versao, data_criacao, usuario_criacao, ativo, id_veiculo, placa, id_base_operacional,
  tipo_manutencao, origem, criticidade, motivo, descricao, id_condutor, aberta_em, id_usuario_abertura, km_abertura, situacao,
  tipo_oficina, id_fornecedor, oficina_nome, agendada_para, local_agendamento, inicio_real, previsao_termino, fim_real,
  veiculo_parado, parado_desde, liberado_em, descricao_servico, itens_substituidos, valor_total, km_encerramento,
  id_leitura_encerramento, cancelada_em, motivo_cancelamento, unidade_medicao, veicular, causa, desconto, acrescimo)
SELECT o.id, 0, o.aberta_em, 'USRADMIN', true, o.id_veiculo, o.placa, o.id_base,
  o.tipo,
  CASE WHEN o.tipo = 'PREVENTIVA' THEN 'PREVENTIVA' ELSE (ARRAY['VERBAL','CHECKLIST','MANUAL','INSPECAO','CHECKLIST'])[1 + o.i % 5] END,
  o.criticidade,
  CASE WHEN o.tipo = 'CORRETIVA' THEN (ARRAY['DESGASTE_NATURAL','PROBLEMA_MECANICO','PROBLEMA_MECANICO','MAU_USO_DESCONTO','ADEQUACAO_DE_MELHORIA'])[1 + o.i % 5] END,
  CASE WHEN o.tipo = 'PREVENTIVA' THEN 'Revisão programada: ' || lower(o.item_nome)
       ELSE (ARRAY['Barulho na suspensão dianteira ao passar em buracos',
                   'Luz de injeção acesa no painel e perda de força em subida',
                   'Freio puxando para a direita e pedal baixo',
                   'Ar-condicionado não gela, equipe reclamando no turno da tarde',
                   'Vazamento de óleo hidráulico no implemento',
                   'Bateria descarregando durante a noite',
                   'Pneu traseiro com corte lateral após rodar em estrada de chão',
                   'Embreagem patinando com o veículo carregado',
                   'Temperatura do motor subindo em marcha lenta',
                   'Retrovisor quebrado e lanterna traseira sem funcionar'])[1 + o.i % 10] END,
  o.id_condutor, o.aberta_em, (SELECT id FROM u), o.km, o.situacao,
  o.oficina,
  CASE WHEN o.oficina = 'EXTERNA' THEN (SELECT id FROM f WHERE n = o.i % 8) END,
  CASE WHEN o.oficina = 'EXTERNA' THEN (ARRAY['Oficina Mecânica São Jorge','Retífica Vale do São Francisco','Auto Center Petrolina','Diesel Norte Serviços','Elétrica Automotiva Sertão'])[1 + o.i % 5] ELSE 'Oficina própria da base' END,
  CASE WHEN o.situacao = 'AGENDADA' THEN date_trunc('hour', now()) + (1 + o.i % 4) * interval '1 day' + interval '8 hours'
       WHEN o.situacao IN ('CONCLUIDA','EM_ANDAMENTO') AND o.i % 2 = 0 THEN o.aberta_em + interval '18 hours' END,
  CASE WHEN o.situacao = 'AGENDADA' OR (o.situacao IN ('CONCLUIDA','EM_ANDAMENTO') AND o.i % 2 = 0) THEN 'Pátio da oficina' END,
  CASE WHEN o.situacao IN ('CONCLUIDA','EM_ANDAMENTO') THEN o.aberta_em + interval '20 hours' END,
  CASE WHEN o.situacao = 'EM_ANDAMENTO' THEN now() + interval '1 day 4 hours'
       WHEN o.situacao = 'CONCLUIDA' THEN o.aberta_em + interval '2 days' END,
  CASE WHEN o.situacao = 'CONCLUIDA' THEN o.aberta_em + interval '20 hours' + (6 + o.i % 40) * interval '1 hour' END,
  (o.situacao = 'EM_ANDAMENTO' OR (o.situacao = 'CONCLUIDA' AND o.criticidade IN ('URGENTE','ALTA'))),
  CASE WHEN o.situacao = 'EM_ANDAMENTO' OR (o.situacao = 'CONCLUIDA' AND o.criticidade IN ('URGENTE','ALTA')) THEN o.aberta_em + interval '20 hours' END,
  CASE WHEN o.situacao = 'CONCLUIDA' AND o.criticidade IN ('URGENTE','ALTA') THEN o.aberta_em + interval '20 hours' + (6 + o.i % 40) * interval '1 hour' END,
  CASE WHEN o.situacao = 'CONCLUIDA' THEN 'Executado: ' || lower(o.item_nome) || '. Teste de rodagem realizado e veículo liberado.' END,
  CASE WHEN o.situacao = 'CONCLUIDA' THEN o.item_nome END,
  CASE WHEN o.situacao = 'CONCLUIDA' THEN o.mao_obra + o.pecas END,
  CASE WHEN o.situacao = 'CONCLUIDA' THEN o.km + 12 END,
  gen_random_uuid(),
  CASE WHEN o.situacao = 'CANCELADA' THEN o.aberta_em + interval '5 hours' END,
  CASE WHEN o.situacao = 'CANCELADA' THEN 'Problema resolvido pelo próprio condutor na base, sem necessidade de oficina' END,
  'KM', true,
  CASE WHEN o.situacao = 'CONCLUIDA' THEN CASE WHEN o.tipo = 'PREVENTIVA' THEN 'SERVICO_PREVENTIVO' ELSE (ARRAY['AVARIA','DESGASTE_NATURAL','SERVICO_CORRETIVO','USO_INDEVIDO'])[1 + o.i % 4] END END,
  0, 0
FROM os_seed o;

INSERT INTO frota_os_itens (id, versao, data_criacao, usuario_criacao, ativo, id_ordem_servico, id_item_manutencao)
SELECT gen_random_uuid(), 0, o.aberta_em, 'USRADMIN', true, o.id, o.id_item FROM os_seed o;

INSERT INTO frota_os_servicos (id, versao, data_criacao, usuario_criacao, ativo, id_ordem_servico, descricao, id_item_manutencao, mecanico_nome, quantidade, valor_unitario, subtotal)
SELECT gen_random_uuid(), 0, o.aberta_em, 'USRADMIN', true, o.id, s.descr, o.id_item,
       CASE WHEN o.oficina = 'INTERNA' THEN (ARRAY['Raimundo Nonato','Edvaldo Santos','Cícero Alves'])[1 + o.i % 3] END,
       1, s.valor, s.valor
FROM os_seed o
CROSS JOIN LATERAL (VALUES ('Mão de obra - ' || lower(o.item_nome), o.mao_obra), ('Peças e insumos - ' || lower(o.item_nome), o.pecas)) s(descr, valor)
WHERE o.situacao IN ('CONCLUIDA', 'EM_ANDAMENTO');

INSERT INTO frota_os_historico (id, versao, data_criacao, usuario_criacao, ativo, id_ordem_servico, tipo, descricao, id_usuario, ocorrido_em)
SELECT gen_random_uuid(), 0, h.quando, 'USRADMIN', true, o.id, h.tipo, h.descr, (SELECT id FROM u), h.quando
FROM os_seed o
JOIN frota_ordens_servico os ON os.id = o.id
CROSS JOIN LATERAL (VALUES
  ('ABERTA', 'Ordem de serviço aberta', os.aberta_em),
  ('AGENDADA', 'Agendada para ' || to_char(os.agendada_para, 'DD/MM HH24:MI'), CASE WHEN os.agendada_para IS NOT NULL THEN os.aberta_em + interval '2 hours' END),
  ('VEICULO_PARADO', 'Veículo parado para manutenção', os.parado_desde),
  ('INICIADA', 'Serviço iniciado', os.inicio_real),
  ('CONCLUIDA', 'Serviço concluído', os.fim_real),
  ('VEICULO_LIBERADO', 'Veículo liberado para operação', os.liberado_em),
  ('CANCELADA', os.motivo_cancelamento, os.cancelada_em)
) h(tipo, descr, quando)
WHERE h.quando IS NOT NULL;

-- Abastecimentos (150 nos últimos 90 dias)
CREATE TEMP TABLE ab AS
SELECT i, gen_random_uuid() AS id,
       (SELECT id FROM v WHERE n = i % (SELECT count(*) FROM v)) AS id_veiculo,
       (SELECT id_base_operacional FROM v WHERE n = i % (SELECT count(*) FROM v)) AS id_base,
       (SELECT id FROM c WHERE n = (i * 7) % (SELECT count(*) FROM c)) AS id_condutor,
       (SELECT id FROM frota_postos ORDER BY nome OFFSET i % 6 LIMIT 1) AS id_posto,
       now() - ((151 - i) * interval '14 hours 20 minutes') AS quando,
       CASE WHEN i > 146 THEN (ARRAY['AGUARDANDO_APROVACAO','APROVADA','LIBERADA','AGUARDANDO_APROVACAO'])[1 + i % 4]
            WHEN i % 23 = 0 THEN 'REPROVADA' WHEN i % 31 = 0 THEN 'CANCELADA' ELSE 'REALIZADA' END AS situacao,
       CASE WHEN i % 5 = 0 THEN 'Gasolina comum' ELSE 'Diesel S10' END AS produto,
       round((35 + random() * 75)::numeric, 1) AS litros,
       CASE WHEN i % 5 = 0 THEN 6.29 ELSE 6.09 END + round((random() * 0.3)::numeric, 2) AS preco,
       (41000 + i * 180 + floor(random() * 60))::numeric AS km
FROM generate_series(1, 150) i;

INSERT INTO frota_abastecimentos (id, versao, data_criacao, usuario_criacao, ativo, id_aparelho, id_veiculo, id_base_operacional, id_condutor,
  id_usuario_solicitante, id_posto, situacao, solicitado_em, medicao_solicitacao, observacao, id_usuario_aprovacao, aprovado_em, motivo_reprovacao,
  id_usuario_liberacao, liberado_em, vence_em, cancelado_em, motivo_cancelamento, realizado_em, medicao_realizado, destino, origem)
SELECT a.id, 0, a.quando, 'USRADMIN', true, gen_random_uuid(), a.id_veiculo, a.id_base, a.id_condutor,
  (SELECT id FROM u), a.id_posto, a.situacao, a.quando, a.km,
  CASE WHEN a.i % 9 = 0 THEN 'Equipe seguindo para atendimento em zona rural' END,
  CASE WHEN a.situacao NOT IN ('AGUARDANDO_APROVACAO','CANCELADA') THEN (SELECT id FROM u) END,
  CASE WHEN a.situacao NOT IN ('AGUARDANDO_APROVACAO','CANCELADA') THEN a.quando + interval '12 minutes' END,
  CASE WHEN a.situacao = 'REPROVADA' THEN 'Abastecimento anterior há menos de 24h com tanque cheio' END,
  CASE WHEN a.situacao IN ('LIBERADA','REALIZADA') THEN (SELECT id FROM u) END,
  CASE WHEN a.situacao IN ('LIBERADA','REALIZADA') THEN a.quando + interval '20 minutes' END,
  CASE WHEN a.situacao IN ('LIBERADA','APROVADA') THEN a.quando + interval '1 day' END,
  CASE WHEN a.situacao = 'CANCELADA' THEN a.quando + interval '1 hour' END,
  CASE WHEN a.situacao = 'CANCELADA' THEN 'Veículo recolhido para manutenção antes do abastecimento' END,
  CASE WHEN a.situacao = 'REALIZADA' THEN a.quando + interval '45 minutes' END,
  CASE WHEN a.situacao = 'REALIZADA' THEN a.km + 3 END,
  (ARRAY['Atendimento emergencial','Rota de manutenção preventiva','Deslocamento para obra','Ligação nova em zona rural'])[1 + a.i % 4],
  'APP'
FROM ab a;

INSERT INTO frota_abastecimento_itens (id, versao, data_criacao, usuario_criacao, ativo, id_abastecimento, ordem, id_produto_pedido, quantidade_pedida,
  id_produto, quantidade, valor_total, valor_unitario, tanque_cheio, quantidade_aprovada, quantidade_liberada)
SELECT gen_random_uuid(), 0, a.quando, 'USRADMIN', true, a.id, 1, p.id, a.litros,
  CASE WHEN a.situacao = 'REALIZADA' THEN p.id END,
  CASE WHEN a.situacao = 'REALIZADA' THEN a.litros END,
  CASE WHEN a.situacao = 'REALIZADA' THEN round(a.litros * a.preco, 2) END,
  CASE WHEN a.situacao = 'REALIZADA' THEN a.preco END,
  CASE WHEN a.situacao = 'REALIZADA' THEN a.i % 3 = 0 END,
  CASE WHEN a.situacao IN ('APROVADA','LIBERADA','REALIZADA') THEN a.litros END,
  CASE WHEN a.situacao IN ('LIBERADA','REALIZADA') THEN a.litros END
FROM ab a JOIN frota_produtos_abastecimento p ON p.nome = a.produto;

-- Despesas (50)
INSERT INTO frota_despesas (id, versao, data_criacao, usuario_criacao, ativo, id_veiculo, data, id_tipo, id_subtipo, descricao, valor,
  id_base_operacional, fornecedor_nome, documento_tipo, documento_numero, forma_pagamento, origem)
SELECT gen_random_uuid(), 0, now(), 'USRADMIN', true,
  (SELECT id FROM v WHERE n = i % (SELECT count(*) FROM v)),
  (current_date - (i * 3 % 120)),
  t.id, (SELECT s.id FROM frota_subtipos_despesa s WHERE s.id_tipo = t.id ORDER BY s.nome OFFSET i % 2 LIMIT 1),
  CASE t.nome WHEN 'Pedágio' THEN 'Praça de pedágio BR-324' WHEN 'Estacionamento' THEN 'Estacionamento próximo ao cliente'
              WHEN 'Lavagem' THEN 'Lavagem após trabalho em área de lama' WHEN 'Mensalidade' THEN 'Mensalidade do mês'
              WHEN 'Taxa e licenciamento' THEN 'Licenciamento anual' ELSE 'Despesa avulsa em campo' END,
  round((CASE t.nome WHEN 'Pedágio' THEN 8 + random() * 25 WHEN 'Estacionamento' THEN 10 + random() * 30
              WHEN 'Lavagem' THEN 40 + random() * 90 WHEN 'Mensalidade' THEN 60 + random() * 80
              WHEN 'Taxa e licenciamento' THEN 180 + random() * 350 ELSE 20 + random() * 150 END)::numeric, 2),
  (SELECT id_base_operacional FROM v WHERE n = i % (SELECT count(*) FROM v)),
  (ARRAY['Lava Jato Bom Jesus','Via Bahia Concessionária','Estacionamento Central','Rastreia Fácil','Detran-BA'])[1 + i % 5],
  CASE WHEN i % 3 = 0 THEN 'RECIBO' WHEN i % 3 = 1 THEN 'CUPOM' END,
  CASE WHEN i % 3 IN (0, 1) THEN lpad((48210 + i * 37)::text, 6, '0') END,
  (ARRAY['CARTAO','JA_PAGO','REEMBOLSO','CARTAO'])[1 + i % 4],
  'MANUAL'
FROM generate_series(1, 50) i
JOIN LATERAL (SELECT id, nome FROM frota_tipos_despesa ORDER BY nome OFFSET i % 6 LIMIT 1) t ON true;

COMMIT;
