-- Carteira de obras: 55 obras em todos os status, com histórico de status, ocorrências (corretivas/preventivas),
-- projetos relacionados, subprojetos e o registro das importações de carteira.
-- A tabela demo_seed_obra guarda o perfil de cada obra para os scripts 18-20 (é removida no 20).
-- Pré-requisito: 14_reset_obras.sql e 16_obras_cadastros.sql.
BEGIN;
SELECT setseed(0.17);

DROP TABLE IF EXISTS demo_seed_obra;
CREATE TABLE demo_seed_obra (
  k int PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid(), numero varchar(7), titulo text, mun text, reg text,
  tipo text, tpl text, classe text, prio text, perfil text, npts int, frac numeric, med text, pai int, vinc text, obs text,
  inicio date, fim_prev date, fim_efetiva date, criada timestamptz, lat double precision, lon double precision,
  id_base uuid, status_nome text);

INSERT INTO demo_seed_obra (k, titulo, mun, reg, tipo, tpl, classe, prio, perfil, npts, frac, med, pai, vinc, obs) VALUES
 (1, 'EXTENSÃO DE REDE BT - LOT. JARDIM FLÓRIDA', 'JUAZEIRO', 'JZR', 'OBRA', 'BT', 'BT', 'NORMAL', 'EXEC', 18, 0.55, 'P', NULL, NULL, NULL),
 (2, 'MELHORIA DE REDE BT - BAIRRO JOÃO PAULO II', 'JUAZEIRO', 'JZR', 'OBRA', 'REF', 'BT', 'ALTA', 'CONC', 14, 1, 'T', NULL, NULL, 'Obra entregue e vistoriada pelo fiscal da distribuidora.'),
 (3, 'ER-MT - POV. JUREMAL - ALIMENTADOR JZD-04', 'JUAZEIRO', 'JZR', 'OBRA', 'MT', 'MT_15', 'NORMAL', 'EXEC', 32, 0.40, 'P', NULL, NULL, NULL),
 (4, 'LPT - POV. LAGOA DO SALITRE (38 UC)', 'JUAZEIRO', 'JZR', 'LPT', 'LPT', 'MT_15', 'ALTA', 'EXEC', 26, 0.70, 'P', NULL, NULL, NULL),
 (5, 'REFORMA RD URBANA - AV. RAUL ALVES', 'JUAZEIRO', 'JZR', 'OBRA', 'REF', 'BT', 'URGENTE', 'PARA', 16, 0.35, 'P', NULL, NULL, 'Aguardando desligamento programado da distribuidora para o trecho central.'),
 (6, 'SUBSTITUIÇÃO DE POSTES DETERIORADOS - BAIRRO PIRANGA', 'JUAZEIRO', 'JZR', 'CORRETIVA', 'CORR', 'BT', 'URGENTE', 'CONC', 6, 1, 'T', NULL, NULL, 'Postes substituídos e rede normalizada.'),
 (7, 'INSTALAÇÃO DE RELIGADOR - ALIMENTADOR JZD-07', 'JUAZEIRO', 'JZR', 'OBRA', 'EQP', 'MT_15', 'ALTA', 'FUT', 3, 0, NULL, NULL, NULL, NULL),
 (8, 'ER-MT - PROJETO IRRIGADO MANIÇOBA LOTE 12', 'JUAZEIRO', 'JZR', 'OBRA', 'MT', 'MT_36', 'NORMAL', 'EXEC', 44, 0.30, 'P', NULL, NULL, NULL),
 (9, 'ER-BT - RUA DAS ACÁCIAS, ALTO DO CRUZEIRO', 'JUAZEIRO', 'JZR', 'OBRA', 'BT', 'BT', 'BAIXA', 'APROG', 8, 0, NULL, NULL, NULL, NULL),
 (10, 'MELHORIA DE TENSÃO - POV. CARNAÍBA DO SERTÃO', 'JUAZEIRO', 'JZR', 'OBRA', 'MT', 'MT_15', 'NORMAL', 'PRONTA', 12, 0, NULL, NULL, NULL, NULL),
 (11, 'ER-MT - VILA SÃO JOAQUIM', 'SOBRADINHO', 'JZR', 'OBRA', 'MT', 'MT_15', 'NORMAL', 'EXEC', 20, 0.80, 'P', NULL, NULL, NULL),
 (12, 'REFORMA DE REDE BT - CENTRO DE SOBRADINHO', 'SOBRADINHO', 'JZR', 'OBRA', 'REF', 'BT', 'NORMAL', 'CONC', 22, 1, 'P', NULL, NULL, 'Concluída; última medição em fechamento.'),
 (13, 'LPT - POV. BARRINHA', 'CURAÇÁ', 'JZR', 'LPT', 'LPT', 'MT_15', 'ALTA', 'EXEC', 30, 0.50, 'P', NULL, NULL, NULL),
 (14, 'BANCO REGULADOR DE TENSÃO - ALIMENTADOR CUR-01', 'CURAÇÁ', 'JZR', 'OBRA', 'EQP', 'MT_15', 'ALTA', 'CONC', 3, 1, 'N', NULL, NULL, 'Equipamento energizado e parametrizado pelo COD.'),
 (15, 'ER-MT - ASSENTAMENTO SALITRE II', 'CASA NOVA', 'JZR', 'OBRA', 'MT', 'MT_15', 'NORMAL', 'LEV', 24, 0, NULL, NULL, NULL, NULL),
 (16, 'LPT - POV. SANTANA DO SOBRADO', 'CASA NOVA', 'JZR', 'LPT', 'LPT', 'MT_15', 'NORMAL', 'FUT', 18, 0, NULL, NULL, NULL, NULL),
 (17, 'EXTENSÃO DE REDE BT - LOT. NOVA CASA NOVA', 'CASA NOVA', 'JZR', 'OBRA', 'BT', 'BT', 'NORMAL', 'CAD', 0, 0, NULL, NULL, NULL, NULL),
 (18, 'LPT - POV. AREIA GRANDE', 'SENTO SÉ', 'JZR', 'LPT', 'LPT', 'MT_15', 'NORMAL', 'PARA', 28, 0.25, 'P', NULL, NULL, 'Falta de transformadores de 10 kVA no almoxarifado; previsão de entrega em 15 dias.'),
 (19, 'MANUTENÇÃO PREVENTIVA - TRONCO SSE-02', 'SENTO SÉ', 'JZR', 'PREVENTIVA', 'PREV', 'MT_15', 'NORMAL', 'EXEC', 10, 0.60, 'P', NULL, NULL, NULL),
 (20, 'ER-MT - POV. LAGOA DO VILAR', 'REMANSO', 'RMS', 'OBRA', 'MT', 'MT_15', 'NORMAL', 'EXEC', 22, 0.45, 'P', NULL, NULL, NULL),
 (21, 'REFORMA RD - ORLA DE REMANSO', 'REMANSO', 'RMS', 'OBRA', 'REF', 'BT', 'ALTA', 'CONC', 12, 1, 'T', NULL, NULL, 'Concluída dentro do prazo regulado.'),
 (22, 'LPT - POV. CAMPO ALEGRE DE BAIXO', 'PILÃO ARCADO', 'RMS', 'LPT', 'LPT', 'MT_15', 'NORMAL', 'APROG', 20, 0, NULL, NULL, NULL, NULL),
 (23, 'SUBSTITUIÇÃO DE TRANSFORMADOR AVARIADO - POV. BREJO', 'PILÃO ARCADO', 'RMS', 'CORRETIVA', 'CORR_TR', 'MT_15', 'URGENTE', 'CONC', 2, 1, 'T', NULL, NULL, 'Transformador substituído; clientes religados no mesmo dia.'),
 (24, 'EXTENSÃO DE REDE BT - BAIRRO SÃO FRANCISCO', 'REMANSO', 'RMS', 'OBRA', 'BT', 'BT', 'BAIXA', 'CANC', 6, 0, NULL, NULL, NULL, 'Cliente desistiu do pedido de ligação.'),
 (25, 'ER-MT - POV. IGARA', 'SENHOR DO BONFIM', 'BNF', 'OBRA', 'MT', 'MT_15', 'NORMAL', 'EXEC', 26, 0.35, 'P', NULL, NULL, NULL),
 (26, 'MELHORIA DE REDE BT - BAIRRO UMBURANAS', 'SENHOR DO BONFIM', 'BNF', 'OBRA', 'REF', 'BT', 'NORMAL', 'FUT', 14, 0, NULL, NULL, NULL, NULL),
 (27, 'LPT - POV. TIJUAÇU', 'SENHOR DO BONFIM', 'BNF', 'LPT', 'LPT', 'MT_15', 'ALTA', 'CONC', 24, 1, 'P', NULL, NULL, 'Rede energizada; complemento segue em obra própria.'),
 (28, 'EXTENSÃO DE REDE BT - LOT. PARQUE DAS ÁRVORES', 'SENHOR DO BONFIM', 'BNF', 'OBRA', 'BT', 'BT', 'NORMAL', 'LEV', 15, 0, NULL, NULL, NULL, NULL),
 (29, 'ER-MT - ÁREA DE MINERAÇÃO (CLIENTE A4)', 'CAMPO FORMOSO', 'BNF', 'OBRA', 'MT', 'MT_36', 'URGENTE', 'EXEC', 36, 0.60, 'P', NULL, NULL, NULL),
 (30, 'REFORMA RD - CENTRO DE CAMPO FORMOSO', 'CAMPO FORMOSO', 'BNF', 'OBRA', 'REF', 'BT', 'NORMAL', 'PARA', 18, 0.50, 'P', NULL, NULL, 'Prefeitura suspendeu intervenções na via central durante os festejos; retomada prevista para a próxima semana.'),
 (31, 'LPT - POV. LAJE DOS NEGROS', 'CAMPO FORMOSO', 'BNF', 'LPT', 'LPT', 'MT_15', 'NORMAL', 'PRONTA', 22, 0, NULL, NULL, NULL, NULL),
 (32, 'MANUTENÇÃO CORRETIVA - TRECHO BR-407 KM 82', 'CAMPO FORMOSO', 'BNF', 'CORRETIVA', 'CORR', 'MT_15', 'URGENTE', 'EXEC', 5, 0.60, NULL, NULL, NULL, NULL),
 (33, 'ER-BT - POV. PEDRA BRANCA', 'ANTÔNIO GONÇALVES', 'BNF', 'OBRA', 'BT', 'BT', 'NORMAL', 'CAD', 0, 0, NULL, NULL, NULL, NULL),
 (34, 'INSTALAÇÃO DE RELIGADOR - ALIMENTADOR SBF-03', 'SENHOR DO BONFIM', 'BNF', 'OBRA', 'EQP', 'MT_15', 'ALTA', 'APROG', 2, 0, NULL, NULL, NULL, NULL),
 (35, 'PREVENTIVA - PODA E REAPERTO ALIMENTADOR CFO-02', 'CAMPO FORMOSO', 'BNF', 'PREVENTIVA', 'PREV', 'MT_15', 'BAIXA', 'CONC', 12, 1, 'T', NULL, NULL, 'Ciclo de poda concluído no alimentador.'),
 (36, 'ER-MT - POV. ITAPEIPU', 'JACOBINA', 'JCB', 'OBRA', 'MT', 'MT_15', 'NORMAL', 'EXEC', 28, 0.50, 'P', NULL, NULL, NULL),
 (37, 'REFORMA DE REDE BT - BAIRRO MUNDO NOVO', 'JACOBINA', 'JCB', 'OBRA', 'REF', 'BT', 'NORMAL', 'LEV', 16, 0, NULL, NULL, NULL, NULL),
 (38, 'LPT - POV. CAATINGA DO MOURA', 'JACOBINA', 'JCB', 'LPT', 'LPT', 'MT_15', 'ALTA', 'EXEC', 34, 0.65, 'P', NULL, NULL, NULL),
 (39, 'EXTENSÃO DE REDE BT - LOT. SERRA VERDE', 'JACOBINA', 'JCB', 'OBRA', 'BT', 'BT', 'NORMAL', 'EXEC', 20, 0.30, 'P', NULL, NULL, NULL),
 (40, 'MELHORIA DE TENSÃO - POV. JUNCO', 'JACOBINA', 'JCB', 'OBRA', 'MT', 'MT_15', 'NORMAL', 'PARA', 14, 0.40, 'P', NULL, NULL, 'Aguardando autorização ambiental para supressão de vegetação na faixa.'),
 (41, 'ER-MT - POV. MUCAMBO', 'MIGUEL CALMON', 'JCB', 'OBRA', 'MT', 'MT_15', 'NORMAL', 'FUT', 20, 0, NULL, NULL, NULL, NULL),
 (42, 'LPT - POV. LAGOA DE DENTRO', 'MIGUEL CALMON', 'JCB', 'LPT', 'LPT', 'MT_15', 'NORMAL', 'CAD', 0, 0, NULL, NULL, NULL, NULL),
 (43, 'SUBSTITUIÇÃO DE POSTES - CENTRO DE MIGUEL CALMON', 'MIGUEL CALMON', 'JCB', 'CORRETIVA', 'CORR', 'BT', 'ALTA', 'EXEC', 7, 0.50, NULL, NULL, NULL, NULL),
 (44, 'ER-BT - CONJUNTO HABITACIONAL VALE DO OURO', 'JACOBINA', 'JCB', 'OBRA', 'BT', 'BT', 'NORMAL', 'CANC', 0, 0, NULL, NULL, NULL, 'Empreendimento adiado pela incorporadora; pedido será refeito.'),
 (45, 'PREVENTIVA - TROCA DE ISOLADORES ALIMENTADOR JCB-05', 'JACOBINA', 'JCB', 'PREVENTIVA', 'PREV', 'MT_15', 'NORMAL', 'CONC', 9, 1, 'N', NULL, NULL, 'Isoladores substituídos; aguardando medição.'),
 (46, 'RAMAIS DE LIGAÇÃO - LOT. JARDIM FLÓRIDA (ETAPA 2)', 'JUAZEIRO', 'JZR', 'OBRA', 'RAM', 'BT', 'NORMAL', 'LEV', 10, 0, NULL, 1, 'KIT', NULL),
 (47, 'ER-MT - POV. JUREMAL TRECHO 2', 'JUAZEIRO', 'JZR', 'OBRA', 'MT', 'MT_15', 'NORMAL', 'CAD', 0, 0, NULL, 3, 'KIT', NULL),
 (48, 'MEDIÇÃO AGRUPADA - PROJETO IRRIGADO MANIÇOBA', 'JUAZEIRO', 'JZR', 'OBRA', 'BT', 'BT', 'NORMAL', 'PRONTA', 5, 0, NULL, 8, 'MEDIDOR', NULL),
 (49, 'LPT - POV. TIJUAÇU (COMPLEMENTO)', 'SENHOR DO BONFIM', 'BNF', 'LPT', 'LPT', 'MT_15', 'NORMAL', 'FUT', 8, 0, NULL, 27, 'KIT', NULL),
 (50, 'ER-BT - LOT. SERRA VERDE (QUADRAS F A H)', 'JACOBINA', 'JCB', 'OBRA', 'BT', 'BT', 'BAIXA', 'APROG', 9, 0, NULL, 39, 'KIT', NULL),
 (51, 'ER-MT - FAZENDA BOA ESPERANÇA', 'CASA NOVA', 'JZR', 'OBRA', 'MT', 'MT_15', 'BAIXA', 'CANC', 10, 0, NULL, NULL, NULL, 'Projeto reprovado na análise técnica da distribuidora; será reapresentado.'),
 (52, 'REFORMA RD - FEIRA LIVRE DE JUAZEIRO', 'JUAZEIRO', 'JZR', 'OBRA', 'REF', 'BT', 'ALTA', 'EXEC', 12, 0.75, 'P', NULL, NULL, NULL),
 (53, 'LPT - POV. RIACHO SECO', 'CURAÇÁ', 'JZR', 'LPT', 'LPT', 'MT_15', 'NORMAL', 'PARA', 20, 0.45, 'P', NULL, NULL, 'Acesso interrompido pela cheia do riacho; equipe remanejada até a vazante.'),
 (54, 'EXTENSÃO DE REDE BT - BAIRRO DOM JOSÉ RODRIGUES', 'JUAZEIRO', 'JZR', 'OBRA', 'BT', 'BT', 'NORMAL', 'CAD', 0, 0, NULL, NULL, NULL, NULL),
 (55, 'MELHORIA DE REDE - POV. ABÓBORA', 'JUAZEIRO', 'JZR', 'OBRA', 'MT', 'MT_15', 'NORMAL', 'CANC', 0, 0, NULL, NULL, NULL, 'Obra incorporada ao projeto do alimentador JZD-04.');

-- Centro do município (coordenadas reais aproximadas)
-- sl/so: sentido permitido do afastamento (-1, 1 ou 0 = ambos), para não cair no rio nem no lago de Sobradinho
CREATE TEMP TABLE _mun (nome text, lat double precision, lon double precision, sl int, so int) ON COMMIT DROP;
INSERT INTO _mun VALUES ('JUAZEIRO', -9.4216, -40.4986, -1, 0), ('SOBRADINHO', -9.4650, -40.8136, -1, 1), ('CURAÇÁ', -9.0003, -39.9197, -1, -1),
 ('CASA NOVA', -9.1517, -40.9711, 1, 0), ('SENTO SÉ', -9.7514, -41.8786, -1, 0), ('REMANSO', -9.6319, -42.0914, -1, -1), ('PILÃO ARCADO', -10.0139, -42.5036, -1, -1),
 ('SENHOR DO BONFIM', -10.4614, -40.1894, 0, 0), ('CAMPO FORMOSO', -10.5092, -40.3206, 0, 0), ('ANTÔNIO GONÇALVES', -10.5753, -40.2786, 0, 0),
 ('JACOBINA', -11.1806, -40.5181, 0, 0), ('MIGUEL CALMON', -11.4286, -40.5953, 0, 0);

UPDATE demo_seed_obra o SET
  numero = (1025900 + o.k * 211 + (o.k % 7) * 13)::text,
  status_nome = CASE o.perfil WHEN 'EXEC' THEN 'EM EXECUÇÃO' WHEN 'PARA' THEN 'PARALISADA' WHEN 'CONC' THEN 'CONCLUÍDA'
                              WHEN 'CANC' THEN 'CANCELADA' ELSE 'PLANEJADA' END,
  inicio = current_date + CASE o.perfil
     WHEN 'CAD' THEN 25 + (o.k * 7) % 40 WHEN 'LEV' THEN 15 + (o.k * 5) % 25 WHEN 'PRONTA' THEN 10 + (o.k * 3) % 20
     WHEN 'APROG' THEN 7 + (o.k * 3) % 18 WHEN 'FUT' THEN 2 + (o.k * 3) % 12
     WHEN 'EXEC' THEN -(14 + (o.k * 11) % 60) WHEN 'PARA' THEN -(40 + (o.k * 7) % 45)
     WHEN 'CONC' THEN -(55 + (o.k * 13) % 95) ELSE -(20 + (o.k * 9) % 60) END,
  lat = m.lat + CASE WHEN m.sl = 0 THEN random() - 0.5 ELSE m.sl * random() * 0.5 END * CASE WHEN o.tpl IN ('BT', 'REF', 'CORR', 'RAM') THEN 0.025 ELSE 0.22 END,
  lon = m.lon + CASE WHEN m.so = 0 THEN random() - 0.5 ELSE m.so * random() * 0.5 END * CASE WHEN o.tpl IN ('BT', 'REF', 'CORR', 'RAM') THEN 0.025 ELSE 0.22 END,
  id_base = CASE WHEN o.mun = 'CAMPO FORMOSO' THEN coalesce((SELECT id FROM bases_operacionais WHERE nome = 'CAMPO FORMOSO'), (SELECT id FROM bases_operacionais WHERE nome = 'BONFIM'))
                 ELSE (SELECT id FROM bases_operacionais WHERE nome = CASE o.reg WHEN 'JZR' THEN 'JUAZEIRO' WHEN 'JCB' THEN 'JACOBINA' WHEN 'BNF' THEN 'BONFIM' ELSE 'REMANSO' END) END
FROM _mun m WHERE m.nome = o.mun;

UPDATE demo_seed_obra SET fim_prev = inicio + greatest(20, npts * 3 + 15 + (k * 5) % 30),
  criada = CASE WHEN perfil IN ('CAD', 'LEV', 'PRONTA', 'APROG', 'FUT')
                THEN ((current_date - (4 + (k * 7) % 38))::timestamp + interval '11 hours' + (k % 6) * interval '47 minutes') AT TIME ZONE 'UTC'
                ELSE ((inicio - (12 + (k * 7) % 35))::timestamp + interval '11 hours' + (k % 6) * interval '47 minutes') AT TIME ZONE 'UTC' END;
-- Obras em execução com prazo já estourado, para os alertas de atraso
UPDATE demo_seed_obra SET fim_prev = current_date - (3 + k % 9) WHERE k IN (3, 13, 20);
UPDATE demo_seed_obra SET fim_efetiva = least(current_date - 2, inicio + greatest(8, npts * 2 + (k % 9))) WHERE perfil = 'CONC';
UPDATE demo_seed_obra SET fim_prev = greatest(fim_prev, fim_efetiva + (k % 5) - 2) WHERE perfil = 'CONC';

CREATE TEMP TABLE _sup ON COMMIT DROP AS
SELECT s.id, s.id_coordenador, row_number() OVER (ORDER BY s.data_criacao, s.id) - 1 n, count(*) OVER () t FROM supervisores s WHERE s.ativo;
CREATE TEMP TABLE _ag ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY nome) - 1 n, count(*) OVER () t FROM agentes_responsaveis_obras WHERE ativo;

INSERT INTO obras (id, numero, titulo, descricao, nota_obra, valor_projeto, data_inicio, data_previsao_fim, data_fim_efetiva, latitude, longitude,
  id_processo, id_base_operacional, id_municipio, id_centro_custo, id_status_obra, id_agente_responsavel, id_obra_pai, tipo_vinculo_pai,
  versao, data_criacao, data_ultima_alteracao, usuario_criacao, usuario_ultima_alteracao, ativo, id_supervisor, id_coordenador, tipo_obra, id_contrato,
  classe_tensao, classe_tensao_informada_por, classe_tensao_informada_em, prazo_regulado, prioridade, lote_previsto, observacao_status,
  distancia_base_km, tempo_deslocamento_min, deslocamento_estimado, deslocamento_calculado_em, id_base_deslocamento, latitude_deslocamento, longitude_deslocamento)
SELECT o.id, o.numero, o.titulo,
  CASE o.tpl
    WHEN 'BT' THEN 'Extensão de rede secundária para atendimento de novas unidades consumidoras, com implantação de postes, estruturas BT e ramais.'
    WHEN 'REF' THEN 'Reforma da rede de baixa tensão com substituição de postes deteriorados, troca de condutores nus por cabo multiplexado e regularização de ramais.'
    WHEN 'MT' THEN 'Extensão de rede primária 13,8 kV com estruturas de passagem e ancoragem, instalação de transformadores e proteção por chave fusível.'
    WHEN 'LPT' THEN 'Universalização rural: rede monofásica MRT com transformadores de 10 kVA para atendimento das famílias cadastradas no programa.'
    WHEN 'EQP' THEN 'Instalação de equipamento de proteção/regulação no tronco do alimentador, com estrutura dedicada e by-pass.'
    WHEN 'PREV' THEN 'Manutenção preventiva programada: poda, reaperto de conexões e substituição de isoladores e para-raios danificados.'
    WHEN 'CORR' THEN 'Manutenção corretiva para substituição de postes com risco de queda identificados em inspeção.'
    WHEN 'CORR_TR' THEN 'Substituição emergencial de transformador avariado após descarga atmosférica.'
    ELSE 'Instalação de ramais de ligação e padrões de entrada das unidades consumidoras do loteamento.' END,
  '091' || lpad((1017000 + o.k * 311)::text, 7, '0'),
  round((18000 + random() * 160000)::numeric, 2),
  o.inicio, o.fim_prev, o.fim_efetiva, round(o.lat::numeric, 6), round(o.lon::numeric, 6),
  (SELECT id FROM processos_negocio WHERE nome = CASE WHEN o.tipo IN ('CORRETIVA', 'PREVENTIVA') THEN 'MANUTENCAO' WHEN o.tpl = 'EQP' THEN 'LINHA VIVA'
                                                        WHEN o.tpl IN ('BT', 'RAM') THEN 'EXPANSAO' ELSE 'OBRAS' END),
  o.id_base, (SELECT id FROM municipios WHERE nome = o.mun), (SELECT id_centro_custo FROM bases_operacionais WHERE id = o.id_base),
  (SELECT id FROM status_obras WHERE nome = o.status_nome),
  CASE WHEN o.k % 4 <> 0 THEN (SELECT id FROM _ag WHERE n = o.k % (SELECT max(t) FROM _ag)) END,
  NULL, NULL,
  0, o.criada, o.criada + interval '1 day', 'CMENEZES', 'MALIMA', true,
  coalesce((SELECT s.id FROM supervisores s JOIN colaboradores c ON c.id = s.id_colaborador JOIN bases_operacionais b ON b.id = c.id_base_operacional
             WHERE s.ativo AND b.nome = CASE WHEN o.mun = 'CAMPO FORMOSO' THEN 'CAMPO FORMOSO' WHEN o.reg = 'JZR' THEN 'JUAZEIRO' WHEN o.reg = 'RMS' THEN 'REMANSO'
                                             WHEN o.reg = 'BNF' THEN 'BONFIM' ELSE 'JACOBINA' END LIMIT 1),
           (SELECT id FROM _sup WHERE n = 0)),
  (SELECT id_coordenador FROM _sup WHERE n = 0),
  o.tipo, (SELECT id FROM contratos WHERE ativo ORDER BY data_criacao LIMIT 1),
  CASE WHEN o.perfil <> 'CAD' OR o.k % 2 = 0 THEN o.classe END,
  CASE WHEN o.perfil <> 'CAD' OR o.k % 2 = 0 THEN 'CMENEZES' END,
  CASE WHEN o.perfil <> 'CAD' OR o.k % 2 = 0 THEN o.criada + interval '1 day' END,
  CASE WHEN o.tipo IN ('LPT', 'CORRETIVA') OR o.k % 3 = 0 THEN o.fim_prev + (o.k % 4) * 7 - 7 END,
  o.prio,
  CASE WHEN o.perfil IN ('CAD', 'CANC') THEN NULL ELSE 'LOTE 2026-0' || (1 + o.k % 4) END,
  o.obs,
  NULL, NULL, NULL, NULL, NULL, NULL, NULL
FROM demo_seed_obra o;

-- Subprojetos
UPDATE obras f SET id_obra_pai = p.id, tipo_vinculo_pai = s.vinc
  FROM demo_seed_obra s JOIN demo_seed_obra p ON p.k = s.pai
 WHERE f.id = s.id AND s.pai IS NOT NULL;

-- Deslocamento base -> obra (distância rodoviária estimada)
UPDATE obras o SET
  distancia_base_km = round((2 * 6371 * asin(sqrt(power(sin(radians(o.latitude - b.latitude) / 2), 2)
                      + cos(radians(b.latitude)) * cos(radians(o.latitude)) * power(sin(radians(o.longitude - b.longitude) / 2), 2))) * 1.28)::numeric, 2),
  deslocamento_estimado = true, deslocamento_calculado_em = o.data_criacao + interval '5 minutes',
  id_base_deslocamento = b.id, latitude_deslocamento = o.latitude, longitude_deslocamento = o.longitude
  FROM bases_operacionais b WHERE b.id = o.id_base_operacional AND o.id IN (SELECT id FROM demo_seed_obra);
UPDATE obras SET tempo_deslocamento_min = round(distancia_base_km / 52.0 * 60 + 4) WHERE id IN (SELECT id FROM demo_seed_obra);

-- Histórico de status coerente com o status atual -------------------------------------------------------
CREATE TEMP TABLE _st ON COMMIT DROP AS SELECT id, nome FROM status_obras;
CREATE TEMP TABLE _h (k int, ordem int, de text, para text, quando timestamptz, quem text, obs text) ON COMMIT DROP;
INSERT INTO _h SELECT k, 1, NULL, 'PLANEJADA', criada, 'CMENEZES', 'Obra cadastrada a partir da carteira recebida da distribuidora.' FROM demo_seed_obra;
INSERT INTO _h SELECT k, 2, 'PLANEJADA', 'EM EXECUÇÃO', (inicio::timestamp + interval '10 hours') AT TIME ZONE 'UTC', 'MALIMA', 'Início da execução com a primeira programação em campo.'
  FROM demo_seed_obra WHERE perfil IN ('EXEC', 'PARA', 'CONC');
INSERT INTO _h SELECT k, 3, 'EM EXECUÇÃO', 'PARALISADA', ((current_date - 6 - k % 8)::timestamp + interval '18 hours') AT TIME ZONE 'UTC', 'MALIMA', obs
  FROM demo_seed_obra WHERE perfil = 'PARA';
INSERT INTO _h SELECT k, 3, 'EM EXECUÇÃO', 'PARALISADA', ((inicio + 8)::timestamp + interval '17 hours') AT TIME ZONE 'UTC', 'JCSANTOS', 'Chuva contínua impediu o acesso das equipes ao trecho.'
  FROM demo_seed_obra WHERE perfil = 'CONC' AND k IN (12, 27);
INSERT INTO _h SELECT k, 4, 'PARALISADA', 'EM EXECUÇÃO', ((inicio + 12)::timestamp + interval '9 hours') AT TIME ZONE 'UTC', 'MALIMA', 'Condições de acesso normalizadas; obra retomada.'
  FROM demo_seed_obra WHERE perfil = 'CONC' AND k IN (12, 27);
INSERT INTO _h SELECT k, 5, 'EM EXECUÇÃO', 'CONCLUÍDA', (fim_efetiva::timestamp + interval '19 hours') AT TIME ZONE 'UTC', 'JCSANTOS', obs
  FROM demo_seed_obra WHERE perfil = 'CONC';
INSERT INTO _h SELECT k, 2, 'PLANEJADA', 'CANCELADA', criada + interval '9 days', 'JCSANTOS', obs FROM demo_seed_obra WHERE perfil = 'CANC';
INSERT INTO _h SELECT k, 2, 'PLANEJADA', 'PLANEJADA', criada + interval '3 days', 'CMENEZES', 'Classe de tensão e prioridade confirmadas com o fiscal.'
  FROM demo_seed_obra WHERE perfil IN ('LEV', 'PRONTA', 'APROG') AND k % 2 = 0;

INSERT INTO historico_status_obras (id, id_obra, id_status_anterior, id_status_novo, observacao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), o.id, (SELECT id FROM _st WHERE nome = h.de), (SELECT id FROM _st WHERE nome = h.para), h.obs, 0, h.quando, h.quem, true
  FROM _h h JOIN demo_seed_obra o ON o.k = h.k;

-- Ocorrências das corretivas e preventivas (exigidas para material técnico)
INSERT INTO ocorrencias_obras (id, id_obra, codigo_normalizado, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), o.id, 'OC-' || to_char(o.criada, 'YYYY') || '-' || lpad((4100 + o.k * 37 + g)::text, 6, '0'), 0, o.criada, 'CMENEZES', true
  FROM demo_seed_obra o, generate_series(1, 1 + o.k % 3) g WHERE o.tipo IN ('CORRETIVA', 'PREVENTIVA');

-- Projetos relacionados (mesma região atendida)
INSERT INTO obras_relacionamentos (id, id_projeto_a, id_projeto_b, tipo, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), least(a.id, b.id), greatest(a.id, b.id), r.tipo, 0, greatest(a.criada, b.criada) + interval '2 days', 'CMENEZES', true
  FROM (VALUES (3, 10, 'KIT'), (15, 51, 'KIT'), (8, 11, 'MEDIDOR'), (25, 31, 'KIT'), (36, 41, 'KIT'), (13, 53, 'MEDIDOR')) r(a, b, tipo)
  JOIN demo_seed_obra a ON a.k = r.a JOIN demo_seed_obra b ON b.k = r.b;

-- Importações de carteira registradas
INSERT INTO importacoes_obras (id, tipo, id_contrato, nome_arquivo, status, total_linhas, inseridos, atualizados, erros, detalhe_erros, mensagem, data_conclusao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), x.tipo, (SELECT id FROM contratos WHERE ativo ORDER BY data_criacao LIMIT 1), x.arq, 'CONCLUIDA', x.tot, x.ins, x.atu, x.err, x.det::jsonb, NULL,
       now() - (x.dias || ' days')::interval + interval '40 seconds', 0, now() - (x.dias || ' days')::interval, x.quem, true
  FROM (VALUES
   ('CARTEIRA', 'carteira-obras-ago-2026.xlsx', 22, 20, 0, 2, '[{"linha": 9, "motivo": "Município não cadastrado: UAUÁ.", "referencia": "1027514"}, {"linha": 17, "motivo": "Data de previsão anterior ao início.", "referencia": "1027902"}]', 96, 'CMENEZES'),
   ('CARTEIRA', 'carteira-obras-set-2026.xlsx', 18, 14, 3, 1, '[{"linha": 12, "motivo": "Obra nova sem processo de negócio.", "referencia": "1028317"}]', 64, 'CMENEZES'),
   ('CARTEIRA', 'carteira-obras-out-2026.xlsx', 24, 19, 5, 0, '[]', 31, 'CMENEZES'),
   ('ORCAMENTO', 'orcamento-lote-2026-03.xlsx', 186, 186, 0, 0, '[]', 45, 'PNOVAES'),
   ('ORCAMENTO', 'orcamento-lote-2026-04.xlsx', 241, 238, 0, 3, '[{"linha": 77, "motivo": "Serviço SV-0999 não existe no contrato.", "referencia": "1031077 / SV-0999"}, {"linha": 102, "motivo": "Quantidade inválida.", "referencia": "1031288 / SV-0302"}, {"linha": 188, "motivo": "Obra não encontrada.", "referencia": "1039990"}]', 18, 'PNOVAES'),
   ('KITS', 'kits-contrato-2026.xlsx', 64, 64, 0, 0, '[]', 120, 'CMENEZES'),
   ('KITS', 'kits-revisao-out-2026.xlsx', 12, 2, 9, 1, '[{"linha": 6, "motivo": "Material 300999 não encontrado ou inativo.", "referencia": "TR-112T / 300999"}]', 27, 'CMENEZES')
  ) x(tipo, arq, tot, ins, atu, err, det, dias, quem);
COMMIT;
