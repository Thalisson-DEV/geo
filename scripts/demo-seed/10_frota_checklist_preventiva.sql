-- Frota: modelos de checklist, checklists preenchidos e controles de preventiva.
BEGIN;
SELECT setseed(0.17);

CREATE TEMP TABLE v AS
SELECT row_number() OVER (ORDER BY placa) - 1 AS n, id, placa, id_base_operacional
FROM veiculos WHERE ativo AND placa NOT LIKE 'TST%';
CREATE TEMP TABLE c AS
SELECT row_number() OVER (ORDER BY id) - 1 AS n, id_colaborador AS id FROM frota_condutores;
CREATE TEMP TABLE u AS SELECT id FROM usuarios ORDER BY data_criacao LIMIT 1;

-- Planos preventivos: nomes acentuados, itens, tarefas e tipos de veículo
UPDATE frota_planos_preventivos SET nome = 'Troca de óleo e filtros - leves' WHERE nome = 'Troca de oleo e filtros - leves';
UPDATE frota_planos_preventivos SET nome = 'Revisão de freios' WHERE nome = 'Revisao de freios';
UPDATE frota_planos_preventivos SET nome = 'Inspeção do cesto aéreo' WHERE nome = 'Inspecao do cesto aereo';

INSERT INTO frota_plano_preventivo_itens (id_plano, ordem, id_item)
SELECT p.id, 0, (SELECT id FROM frota_itens_manutencao WHERE nome = x.item)
FROM frota_planos_preventivos p
JOIN (VALUES ('Troca de óleo e filtros - leves', 'TROCA DE ÓLEO E FILTROS'),
             ('Revisão de freios', 'PASTILHA DE FREIO DIANTEIRA'),
             ('Inspeção do cesto aéreo', 'SISTEMA HIDRÁULICO DO IMPLEMENTO'),
             ('Alinhamento e balanceamento', 'PNEU (REPARO)')) x(plano, item) ON x.plano = p.nome
ON CONFLICT DO NOTHING;

INSERT INTO frota_plano_preventivo_tarefas (id_plano, ordem, texto)
SELECT p.id, t.ordem, t.texto
FROM frota_planos_preventivos p
JOIN (VALUES
  ('Troca de óleo e filtros - leves', 0, 'Trocar óleo do motor'),
  ('Troca de óleo e filtros - leves', 1, 'Trocar filtro de óleo e filtro de ar'),
  ('Troca de óleo e filtros - leves', 2, 'Conferir nível do fluido de arrefecimento'),
  ('Revisão de freios', 0, 'Medir espessura das pastilhas e discos'),
  ('Revisão de freios', 1, 'Trocar fluido de freio'),
  ('Inspeção do cesto aéreo', 0, 'Verificar mangueiras e vazamentos do sistema hidráulico'),
  ('Inspeção do cesto aéreo', 1, 'Ensaio de isolação da lança'),
  ('Inspeção do cesto aéreo', 2, 'Testar comandos de emergência'),
  ('Alinhamento e balanceamento', 0, 'Alinhar direção'),
  ('Alinhamento e balanceamento', 1, 'Balancear as quatro rodas e fazer rodízio')
) t(plano, ordem, texto) ON t.plano = p.nome
ON CONFLICT DO NOTHING;

INSERT INTO frota_plano_preventivo_tipos_veiculo (id_plano, id_tipo_veiculo)
SELECT p.id, tv.id
FROM frota_planos_preventivos p CROSS JOIN frota_tipos_veiculo tv
WHERE (p.nome = 'Inspeção do cesto aéreo') = (tv.nome = 'Caminhão Cesto Aéreo')
ON CONFLICT DO NOTHING;

-- Controles de preventiva: bases espalhadas para haver itens em dia, próximos e vencidos
INSERT INTO frota_preventiva_controles (id, versao, data_criacao, usuario_criacao, ativo, id_veiculo, id_plano, base_data, base_medicao, base_unidade, base_origem)
SELECT gen_random_uuid(), 0, now(), 'USRADMIN', true, v.id, p.id,
       current_date - ((v.n * 37 + p.rn * 53) % 420)::int,
       CASE WHEN p.intervalo_km IS NOT NULL THEN 30000 + ((v.n * 4100 + p.rn * 2700) % 26000) END,
       'KM', (ARRAY['INICIO','INFORMADA','ORDEM_SERVICO'])[1 + (v.n + p.rn) % 3]
FROM v
CROSS JOIN (SELECT id, intervalo_km, row_number() OVER (ORDER BY nome) AS rn, nome FROM frota_planos_preventivos) p
WHERE p.nome <> 'Inspeção do cesto aéreo' OR v.placa = 'RPE5K90';

-- Modelos de checklist
INSERT INTO frota_checklist_modelos (id, versao, data_criacao, usuario_criacao, ativo, nome, tipo, instrucoes, exige_assinatura)
VALUES (gen_random_uuid(), 0, now(), 'USRADMIN', true, 'Checklist diário do veículo', 'PRINCIPAL',
        'Preencher antes de sair da base, com o veículo desligado.', true),
       (gen_random_uuid(), 0, now(), 'USRADMIN', true, 'Inspeção do implemento', 'ADICIONAL',
        'Obrigatório para veículos com cesto aéreo ou guindauto.', false);

INSERT INTO frota_checklist_modelo_tipos_veiculo (id_modelo, id_tipo_veiculo)
SELECT m.id, tv.id FROM frota_checklist_modelos m CROSS JOIN frota_tipos_veiculo tv
WHERE m.nome = 'Checklist diário do veículo'
   OR (m.nome = 'Inspeção do implemento' AND tv.nome IN ('Caminhão Munck', 'Caminhão Cesto Aéreo'))
ON CONFLICT DO NOTHING;

INSERT INTO frota_checklist_perguntas (id, versao, data_criacao, usuario_criacao, ativo, id_modelo, ordem, grupo, texto, tipo_resposta, foto_no_nao_ok, modo_foto)
SELECT gen_random_uuid(), 0, now(), 'USRADMIN', true, m.id, q.ordem, q.grupo, q.texto, 'OK_NOK', true, 'NAO_OK'
FROM frota_checklist_modelos m
JOIN (VALUES
  ('Checklist diário do veículo', 0, 'Motor', 'Nível do óleo do motor'),
  ('Checklist diário do veículo', 1, 'Motor', 'Nível da água do radiador'),
  ('Checklist diário do veículo', 2, 'Segurança', 'Freios e freio de mão'),
  ('Checklist diário do veículo', 3, 'Segurança', 'Cintos de segurança'),
  ('Checklist diário do veículo', 4, 'Segurança', 'Extintor dentro da validade'),
  ('Checklist diário do veículo', 5, 'Iluminação', 'Faróis, lanternas e setas'),
  ('Checklist diário do veículo', 6, 'Pneus', 'Calibragem e estado dos pneus'),
  ('Checklist diário do veículo', 7, 'Pneus', 'Estepe, macaco e chave de roda'),
  ('Checklist diário do veículo', 8, 'Cabine', 'Para-brisa e retrovisores'),
  ('Checklist diário do veículo', 9, 'Cabine', 'Limpeza e organização da cabine'),
  ('Inspeção do implemento', 0, 'Hidráulico', 'Vazamentos no sistema hidráulico'),
  ('Inspeção do implemento', 1, 'Hidráulico', 'Funcionamento dos comandos'),
  ('Inspeção do implemento', 2, 'Estrutura', 'Patolas e sapatas'),
  ('Inspeção do implemento', 3, 'Estrutura', 'Cesto/lança sem trincas ou deformações')
) q(modelo, ordem, grupo, texto) ON q.modelo = m.nome;

-- Checklists preenchidos (diários, últimos 45 dias)
CREATE TEMP TABLE ck AS
SELECT i, gen_random_uuid() AS id,
       (SELECT id FROM v WHERE n = i % (SELECT count(*) FROM v)) AS id_veiculo,
       (SELECT placa FROM v WHERE n = i % (SELECT count(*) FROM v)) AS placa,
       (SELECT id_base_operacional FROM v WHERE n = i % (SELECT count(*) FROM v)) AS id_base,
       (SELECT id FROM c WHERE n = (i * 5) % (SELECT count(*) FROM c)) AS id_condutor,
       date_trunc('day', now()) - ((180 - i) / 4) * interval '1 day' + interval '6 hours 40 minutes' + (i % 4) * interval '17 minutes' AS quando,
       (42000 + i * 95)::bigint AS km
FROM generate_series(0, 179) i;
DELETE FROM ck WHERE quando > now();

INSERT INTO frota_checklists (id, versao, data_criacao, usuario_criacao, ativo, id_veiculo, placa, id_base_operacional, id_modelo, modelo_nome,
  id_condutor, id_usuario_preenchimento, preenchido_em, recebido_em, medicao, unidade_medicao, passagem_veiculo, assinado, comentario, id_aparelho, finalidade, cnh_situacao)
SELECT k.id, 0, k.quando, 'USRADMIN', true, k.id_veiculo, k.placa, k.id_base, m.id, m.nome,
  k.id_condutor, (SELECT id FROM u), k.quando, k.quando + interval '2 minutes', k.km, 'KM', false, true,
  CASE WHEN k.i % 11 = 0 THEN 'Veículo com barulho na suspensão, avisei o supervisor' END,
  gen_random_uuid(), 'USO', 'REGULAR'
FROM ck k CROSS JOIN (SELECT id, nome FROM frota_checklist_modelos WHERE nome = 'Checklist diário do veículo') m;

INSERT INTO frota_checklist_respostas (id, versao, data_criacao, usuario_criacao, ativo, id_checklist, id_pergunta, ordem, grupo, pergunta_texto, tipo_resposta, conforme, comentario, problema)
SELECT gen_random_uuid(), 0, k.quando, 'USRADMIN', true, k.id, p.id, p.ordem, p.grupo, p.texto, 'OK_NOK',
  NOT ((k.i * 7 + p.ordem * 3) % 41 = 0),
  CASE WHEN (k.i * 7 + p.ordem * 3) % 41 = 0 THEN 'Item com problema, precisa de verificação na oficina' END,
  (k.i * 7 + p.ordem * 3) % 41 = 0
FROM ck k
JOIN frota_checklist_perguntas p ON p.id_modelo = (SELECT id FROM frota_checklist_modelos WHERE nome = 'Checklist diário do veículo');

COMMIT;
