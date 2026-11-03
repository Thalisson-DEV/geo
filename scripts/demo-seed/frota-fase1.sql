-- Carga de dados da frota (fase 1): seguradoras, apolices, sinistros, preventivas, pneus e telemetria.
-- Depende de veiculos, fornecedores, bases_operacionais ja carregados. Nao executar em producao.
-- Valores de enums conferidos com os CHECKs das migrations V209-V227.
BEGIN;

-- Seguradoras e corretoras (vinculadas a fornecedores existentes)
INSERT INTO frota_seguradoras (id, id_fornecedor, papel, telefone_assistencia, observacao)
SELECT gen_random_uuid(), f.id, x.papel, x.tel, x.obs
FROM (VALUES (0, 'SEGURADORA', '08007270000', 'Assistencia 24h com guincho ate 400 km'),
             (1, 'SEGURADORA', '08007011234', 'Atende frota pesada e utilitarios'),
             (2, 'CORRETORA',  '7133451200',  'Corretora responsavel pela renovacao anual')) AS x(ofs, papel, tel, obs)
CROSS JOIN LATERAL (SELECT id FROM financeiro_fornecedor ORDER BY id OFFSET x.ofs LIMIT 1) f;

-- Apolices
INSERT INTO frota_apolices (id, numero, id_seguradora, id_corretor, segurado, id_base_operacional, vigencia_inicio, vigencia_fim, valor, franquia, observacao)
VALUES
 (gen_random_uuid(), '1031.2026.0004521', (SELECT id FROM frota_seguradoras WHERE papel='SEGURADORA' ORDER BY id LIMIT 1),
  (SELECT id FROM frota_seguradoras WHERE papel='CORRETORA' LIMIT 1), 'Frota leve - Salvador e RMS',
  (SELECT id FROM bases_operacionais ORDER BY id LIMIT 1), DATE '2026-03-01', DATE '2027-02-28', 84250.00, 3500.00, 'Cobertura compreensiva, RCF-V 200 mil'),
 (gen_random_uuid(), '0577.2026.0011873', (SELECT id FROM frota_seguradoras WHERE papel='SEGURADORA' ORDER BY id OFFSET 1 LIMIT 1),
  (SELECT id FROM frota_seguradoras WHERE papel='CORRETORA' LIMIT 1), 'Caminhoes e cestos aereos - interior',
  (SELECT id FROM bases_operacionais ORDER BY id OFFSET 1 LIMIT 1), DATE '2026-06-15', DATE '2027-06-14', 152900.00, 8000.00, 'Inclui equipamento acoplado (cesto aereo)');

INSERT INTO frota_apolice_veiculos (id, id_apolice, id_veiculo, inicio)
SELECT gen_random_uuid(), (SELECT id FROM frota_apolices WHERE numero='1031.2026.0004521'), v.id, DATE '2026-03-01'
FROM (SELECT id FROM veiculos ORDER BY id LIMIT 6) v;
INSERT INTO frota_apolice_veiculos (id, id_apolice, id_veiculo, inicio)
SELECT gen_random_uuid(), (SELECT id FROM frota_apolices WHERE numero='0577.2026.0011873'), v.id, DATE '2026-06-15'
FROM (SELECT id FROM veiculos ORDER BY id OFFSET 6 LIMIT 4) v;

-- Sinistros
INSERT INTO frota_sinistros (id, id_veiculo, placa, id_base_operacional, ocorrido_em, local, tipo, culpa_condutor, descricao, terceiros, boletim_ocorrencia, id_apolice, seguradora_acionada_em, situacao)
SELECT gen_random_uuid(), v.id, v.placa, (SELECT id FROM bases_operacionais ORDER BY id LIMIT 1), x.quando, x.local, x.tipo, x.culpa, x.descr, x.terc, x.bo,
       (SELECT id FROM frota_apolices WHERE numero='1031.2026.0004521'), x.quando + interval '1 day', 'RASCUNHO'
FROM (VALUES
  (0, TIMESTAMPTZ '2026-09-12 07:40:00-03', 'BR-324, km 612, Simoes Filho - BA', 'COLISAO_SEM_VITIMA', false,
   'Veiculo atingido na traseira por carreta em retencao no trecho de obras.', 'Carreta placa QKD-4F21, condutor acionou seguro proprio', 'BO 00451/2026-DT Simoes Filho'),
  (1, TIMESTAMPTZ '2026-10-03 15:10:00-03', 'Av. Presidente Dutra, Feira de Santana - BA', 'SEM_TERCEIROS', true,
   'Retrovisor e para-lama dianteiro direito danificados em manobra no patio do cliente.', NULL, NULL),
  (2, TIMESTAMPTZ '2026-10-21 22:30:00-03', 'Rua Sete de Setembro, Vitoria da Conquista - BA', 'FURTO', false,
   'Furto de ferramentas e bateria com o veiculo estacionado em frente ao alojamento.', NULL, 'BO 01987/2026-1a DT Vitoria da Conquista')
) AS x(ofs, quando, local, tipo, culpa, descr, terc, bo)
CROSS JOIN LATERAL (SELECT id, placa FROM veiculos ORDER BY id OFFSET x.ofs LIMIT 1) v;

-- Planos preventivos
INSERT INTO frota_planos_preventivos (id, nome, descricao, intervalo_km, intervalo_dias, antecedencia_km, antecedencia_dias, criticidade, abrir_os_automaticamente)
VALUES
 (gen_random_uuid(), 'Troca de oleo e filtros - leves', 'Oleo do motor, filtro de oleo, filtro de ar e combustivel', 10000, 180, 800, 15, 'MEDIA', true),
 (gen_random_uuid(), 'Revisao de freios', 'Pastilhas, discos, fluido e regulagem do freio de estacionamento', 20000, 365, 1500, 20, 'ALTA', false),
 (gen_random_uuid(), 'Inspecao do cesto aereo', 'Hidraulico, isolacao, pinos e travas do equipamento', NULL, 90, NULL, 10, 'ALTA', true),
 (gen_random_uuid(), 'Alinhamento e balanceamento', 'Alinhamento, balanceamento e rodizio dos pneus', 15000, NULL, 1000, NULL, 'BAIXA', false);

-- Pneus em estoque e montados
INSERT INTO frota_pneus (id, marca_fogo, numero_serie, marca, modelo, largura, perfil, aro, indice_carga, indice_velocidade, dot, nota_fiscal, data_compra, valor_compra, sulco_inicial_mm, sulco_atual_mm, pressao_recomendada_psi, situacao)
VALUES
 (gen_random_uuid(), 'FG-1001', 'P8813201', 'Pirelli', 'Chrono', 205, 75, '16', '110', 'R', '2226', 'NF 48812', DATE '2026-05-20', 689.90, 9.0, 7.4, 65, 'DISPONIVEL'),
 (gen_random_uuid(), 'FG-1002', 'P8813202', 'Pirelli', 'Chrono', 205, 75, '16', '110', 'R', '2226', 'NF 48812', DATE '2026-05-20', 689.90, 9.0, 7.1, 65, 'DISPONIVEL'),
 (gen_random_uuid(), 'FG-1003', 'M5520917', 'Michelin', 'Agilis', 225, 70, '15', '112', 'S', '1826', 'NF 50177', DATE '2026-07-02', 812.00, 9.5, 9.5, 70, 'DISPONIVEL'),
 (gen_random_uuid(), 'FG-1004', 'M5520918', 'Michelin', 'Agilis', 225, 70, '15', '112', 'S', '1826', 'NF 50177', DATE '2026-07-02', 812.00, 9.5, 9.5, 70, 'DISPONIVEL'),
 (gen_random_uuid(), 'FG-2001', 'B2774410', 'Bridgestone', 'R268', 275, 80, '22.5', '149', 'L', '0926', 'NF 3391', DATE '2026-02-11', 2390.00, 15.0, 11.2, 110, 'DISPONIVEL'),
 (gen_random_uuid(), 'FG-2002', 'B2774411', 'Bridgestone', 'R268', 275, 80, '22.5', '149', 'L', '0926', 'NF 3391', DATE '2026-02-11', 2390.00, 15.0, 10.8, 110, 'DISPONIVEL');

-- Telemetria: rastreadores (espelhando o cadastro dos provedores)
INSERT INTO frota_telemetria_rastreadores (id, provedor, id_externo, placa_provedor, nome_provedor, id_veiculo, situacao, ultima_comunicacao, latitude, longitude, velocidade_kmh, ignicao, odometro_metros, motorista_nome)
SELECT gen_random_uuid(), x.prov, x.ext, v.placa, x.nome, v.id, 'VINCULADO', now() - (x.ofs || ' minutes')::interval, x.lat, x.lon, x.vel, x.ign, x.odo, x.mot
FROM (VALUES
  (0, 'UBICALY', '358240051112301', 'Strada - Equipe Salvador 01', -12.9714, -38.5014, 42.0, true, 48211000, 'Carlos Henrique Santana'),
  (1, 'UBICALY', '358240051112302', 'Saveiro - Equipe Lauro 02',   -12.8970, -38.3270, 0.0, false, 61340500, 'Joselito Ribeiro Matos'),
  (2, 'ZUQ',     'ZQ-77810',        'Cesto aereo - Feira 01',     -12.2664, -38.9663, 58.0, true, 112908000, 'Ednaldo Pereira Cruz'),
  (3, 'ZUQ',     'ZQ-77811',        'Caminhao - Conquista 01',    -14.8615, -40.8442, 0.0, false, 98450200, 'Rosivaldo Souza Lima'),
  (4, 'UBICALY', '358240051112305', 'Hilux - Alagoinhas',         -12.1356, -38.4192, 71.0, true, 75120000, 'Adriana Conceicao Alves')
) AS x(ofs, prov, ext, nome, lat, lon, vel, ign, odo, mot)
CROSS JOIN LATERAL (SELECT id, placa FROM veiculos ORDER BY id OFFSET x.ofs LIMIT 1) v;

-- Telemetria: posicoes do dia (trajetos Salvador -> Feira, Feira -> Santo Estevao, Conquista urbana), 1 ponto a cada 2 min
INSERT INTO frota_telemetria_posicoes (id_rastreador, lido_em, latitude, longitude, velocidade_kmh, ignicao, odometro_metros)
SELECT r.id,
       date_trunc('day', now()) + interval '7 hours' + (g * interval '2 minutes'),
       t.lat0 + (t.lat1 - t.lat0) * g / 180.0 + (random() - 0.5) * 0.0015,
       t.lon0 + (t.lon1 - t.lon0) * g / 180.0 + (random() - 0.5) * 0.0015,
       CASE WHEN g % 25 IN (0, 1) THEN 0 ELSE round((35 + random() * 50)::numeric, 1) END,
       g % 60 <> 59,
       r.odometro_metros - (180 - g) * 650
FROM (VALUES
  ('358240051112301', -12.9714, -38.5014, -12.2664, -38.9663),
  ('ZQ-77810',        -12.2664, -38.9663, -12.4302, -39.2510),
  ('ZQ-77811',        -14.8615, -40.8442, -14.8402, -40.8780),
  ('358240051112305', -12.1356, -38.4192, -11.9440, -38.0850)
) AS t(ext, lat0, lon0, lat1, lon1)
JOIN frota_telemetria_rastreadores r ON r.id_externo = t.ext
CROSS JOIN generate_series(0, 179) g;

-- Telemetria: eventos de conducao
INSERT INTO frota_telemetria_eventos (id, provedor, id_externo, id_rastreador, id_veiculo, placa, tipo, ocorrido_em, latitude, longitude, endereco, velocidade_kmh, limite_kmh, duracao_segundos, descricao, motorista_nome)
SELECT gen_random_uuid(), r.provedor, x.ext_evt, r.id, r.id_veiculo, r.placa_provedor, x.tipo,
       date_trunc('day', now()) + x.hora, x.lat, x.lon, x.ender, x.vel, x.lim, x.dur, x.descr, r.motorista_nome
FROM (VALUES
  ('358240051112301', 'UB-EV-90311', 'EXCESSO_VELOCIDADE', interval '08:12', -12.7350, -38.6520, 'BR-324, km 590, Candeias - BA', 97.0, 80.0, 45, 'Velocidade acima do limite da via'),
  ('358240051112301', 'UB-EV-90312', 'FRENAGEM_BRUSCA',    interval '09:03', -12.4510, -38.8120, 'BR-324, Amelia Rodrigues - BA', 62.0, NULL, NULL, 'Desaceleracao brusca registrada'),
  ('ZQ-77810',        'ZQ-EV-55120', 'MOTOR_LIGADO_PARADO',       interval '10:40', -12.3010, -39.0410, 'BA-502, Sao Goncalo dos Campos - BA', 0.0, NULL, 1260, 'Motor ligado parado por 21 minutos'),
  ('358240051112305', 'UB-EV-90340', 'EXCESSO_VELOCIDADE', interval '11:25', -12.0400, -38.2500, 'BA-110, Entre Rios - BA', 104.0, 80.0, 70, 'Velocidade acima do limite da via')
) AS x(ext, ext_evt, tipo, hora, lat, lon, ender, vel, lim, dur, descr)
JOIN frota_telemetria_rastreadores r ON r.id_externo = x.ext;

COMMIT;
