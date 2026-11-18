-- Cadastros de apoio de Obras: ajustes de rótulos das bases/municípios/tipos de equipe, supervisores e
-- coordenadores, fiscais da distribuidora, catálogo de serviços (ações) com preço do contrato, materiais,
-- kits construtivos e modelos de checklist. Idempotente: só insere o que ainda não existe.
BEGIN;

-- Bases e municípios -------------------------------------------------------------------------------
UPDATE bases_operacionais SET nome = 'CAMPO FORMOSO', latitude = -10.5092, longitude = -40.3206, uf = 'BA',
       endereco = 'Rua Coronel Bento Pereira, 310 - Centro'
 WHERE nome = 'BASE SENHOR DO BONFIM' AND NOT EXISTS (SELECT 1 FROM bases_operacionais WHERE nome = 'CAMPO FORMOSO');
UPDATE bases_operacionais SET uf = 'BA' WHERE uf IS NULL;
UPDATE bases_operacionais SET endereco = 'Av. Adolfo Viana, 1450 - Centro' WHERE nome = 'JUAZEIRO' AND endereco IS NULL;
UPDATE bases_operacionais SET endereco = 'Rua Senador Pedro Lago, 88 - Centro' WHERE nome = 'JACOBINA' AND endereco IS NULL;
UPDATE bases_operacionais SET endereco = 'Av. Lomanto Júnior, 215 - Rodoviária' WHERE nome = 'BONFIM' AND endereco IS NULL;
UPDATE bases_operacionais SET endereco = 'Rua Rui Barbosa, 540 - Centro' WHERE nome = 'REMANSO' AND endereco IS NULL;

UPDATE municipios SET nome = 'SENTO SÉ', id_base_operacional = (SELECT id FROM bases_operacionais WHERE nome = 'JUAZEIRO')
 WHERE nome = 'MUNICIPIO TESTE' AND NOT EXISTS (SELECT 1 FROM municipios WHERE nome = 'SENTO SÉ');
UPDATE municipios SET id_base_operacional = (SELECT id FROM bases_operacionais WHERE nome = 'JUAZEIRO') WHERE nome = 'CASA NOVA';
UPDATE municipios SET id_base_operacional = (SELECT id FROM bases_operacionais WHERE nome = 'CAMPO FORMOSO')
 WHERE nome = 'CAMPO FORMOSO' AND EXISTS (SELECT 1 FROM bases_operacionais WHERE nome = 'CAMPO FORMOSO');

UPDATE tipos_equipe SET nome = 'LINHA VIVA' WHERE nome = 'LINHA VIVA FIC' AND NOT EXISTS (SELECT 1 FROM tipos_equipe WHERE nome = 'LINHA VIVA');
UPDATE tipos_equipe SET nome = 'APOIO COM RETROESCAVADEIRA' WHERE nome = 'RETROESCAVADEIRA FIC' AND NOT EXISTS (SELECT 1 FROM tipos_equipe WHERE nome = 'APOIO COM RETROESCAVADEIRA');
UPDATE tipos_equipe SET nome = 'CONSTRUÇÃO E MANUTENÇÃO' WHERE nome = 'CONSTRUCAO FIC' AND NOT EXISTS (SELECT 1 FROM tipos_equipe WHERE nome = 'CONSTRUÇÃO E MANUTENÇÃO');

-- Equipes na base que o código indica
UPDATE equipes e SET id_base_operacional = b.id
  FROM bases_operacionais b
 WHERE b.nome = CASE substring(e.cod_equipe FROM '-(\w{3})-')
                  WHEN 'JZR' THEN 'JUAZEIRO' WHEN 'JCB' THEN 'JACOBINA' WHEN 'BNF' THEN 'BONFIM' WHEN 'RMS' THEN 'REMANSO' END
   AND e.id_base_operacional IS DISTINCT FROM b.id;

-- Cada equipe com a sua viatura (preferindo uma da mesma base) quando várias equipes dividem o mesmo veículo
DO $$ DECLARE e record; v uuid; BEGIN
  IF (SELECT count(DISTINCT id_veiculo_vinculado) FROM equipes WHERE ativo) < (SELECT count(*) FROM equipes WHERE ativo) / 2 THEN
    UPDATE equipes SET id_veiculo_vinculado = NULL WHERE ativo;
    FOR e IN SELECT id, id_base_operacional FROM equipes WHERE ativo ORDER BY cod_equipe LOOP
      SELECT x.id INTO v FROM veiculos x WHERE x.ativo AND NOT EXISTS (SELECT 1 FROM equipes q WHERE q.id_veiculo_vinculado = x.id)
       ORDER BY (x.id_base_operacional = e.id_base_operacional) DESC NULLS LAST, x.placa LIMIT 1;
      UPDATE equipes SET id_veiculo_vinculado = v WHERE id = e.id;
    END LOOP;
  END IF;
END $$;

-- Coordenador e supervisores (colaboradores encarregados que ainda não têm o papel) ---------------
INSERT INTO coordenadores (id, id_colaborador, data_inicio, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), c.id, date '2024-03-01', 0, now(), 'USRADMIN', true
  FROM colaboradores c JOIN funcoes f ON f.id = c.id_funcao
 WHERE f.nome = 'ENCARREGADO' AND c.ativo
   AND NOT EXISTS (SELECT 1 FROM coordenadores x WHERE x.id_colaborador = c.id)
   AND NOT EXISTS (SELECT 1 FROM supervisores x WHERE x.id_colaborador = c.id)
   AND NOT EXISTS (SELECT 1 FROM equipe_membros m WHERE m.id_colaborador = c.id)
   AND (SELECT count(*) FROM coordenadores WHERE ativo) < 2
 ORDER BY c.id LIMIT 1;

WITH cand AS (
  SELECT c.id, c.id_base_operacional, row_number() OVER (PARTITION BY c.id_base_operacional ORDER BY c.id) rn
    FROM colaboradores c JOIN funcoes f ON f.id = c.id_funcao
   WHERE f.nome = 'ENCARREGADO' AND c.ativo
     AND NOT EXISTS (SELECT 1 FROM coordenadores x WHERE x.id_colaborador = c.id)
     AND NOT EXISTS (SELECT 1 FROM supervisores x WHERE x.id_colaborador = c.id)
), co AS (SELECT id, row_number() OVER (ORDER BY data_criacao) rn FROM coordenadores WHERE ativo)
INSERT INTO supervisores (id, id_colaborador, id_coordenador, data_inicio, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), cand.id, (SELECT id FROM co WHERE rn = 1 + (r.n % (SELECT count(*) FROM co))), date '2024-06-01', 0, now(), 'USRADMIN', true
  FROM (SELECT cand.*, row_number() OVER (ORDER BY id_base_operacional, id) n FROM cand WHERE rn = 1) r
  JOIN cand ON cand.id = r.id
 WHERE (SELECT count(*) FROM supervisores WHERE ativo) < 4
 LIMIT 3;

-- Cada equipe com supervisor e coordenador
WITH s AS (SELECT s.id, s.id_coordenador, row_number() OVER (ORDER BY s.data_criacao, s.id) - 1 n, count(*) OVER () t FROM supervisores s WHERE s.ativo),
     e AS (SELECT id, row_number() OVER (ORDER BY id_base_operacional, cod_equipe) - 1 n FROM equipes WHERE ativo)
UPDATE equipes q SET id_supervisor = s.id, id_coordenador = s.id_coordenador
  FROM e JOIN s ON s.n = e.n % s.t
 WHERE q.id = e.id AND q.id_supervisor IS NULL;

-- Fiscais da distribuidora (agentes responsáveis) ---------------------------------------------------
INSERT INTO agentes_responsaveis_obras (id, nome, email, telefone, empresa_orgao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), x.nome, x.email, x.tel, 'Distribuidora de Energia do Nordeste', 0, now(), 'USRADMIN', true
  FROM (VALUES ('RICARDO PEIXOTO LIMA', 'ricardo.peixoto@distribuidora.com.br', '(74) 99915-3301'),
               ('CAMILA ANDRADE SOUTO', 'camila.souto@distribuidora.com.br', '(74) 99820-4417'),
               ('HÉLIO BARRETO NUNES', 'helio.nunes@distribuidora.com.br', '(74) 98831-2290'),
               ('JULIANA PRADO MOTA', 'juliana.mota@distribuidora.com.br', '(75) 99107-6624'),
               ('MÁRCIO TOURINHO', 'marcio.tourinho@distribuidora.com.br', '(74) 99644-1983')) x(nome, email, tel)
 WHERE NOT EXISTS (SELECT 1 FROM agentes_responsaveis_obras a WHERE a.nome = x.nome);

-- Serviços (ações) e preço vigente no contrato ------------------------------------------------------
INSERT INTO acoes (id, cod_acao, nome, ativo, data_criacao, versao, usuario_criacao)
SELECT gen_random_uuid(), x.cod, x.nome, true, now(), 0, 'USRADMIN'
  FROM (VALUES
   ('SV-0101', 'IMPLANTAR POSTE DE CONCRETO ATÉ 11M'),
   ('SV-0102', 'IMPLANTAR POSTE DE CONCRETO 12M A 14M'),
   ('SV-0103', 'RETIRAR POSTE DE CONCRETO'),
   ('SV-0201', 'INSTALAR ESTRUTURA PRIMÁRIA DE PASSAGEM'),
   ('SV-0202', 'INSTALAR ESTRUTURA PRIMÁRIA DE ANCORAGEM'),
   ('SV-0203', 'INSTALAR ESTRUTURA SECUNDÁRIA'),
   ('SV-0301', 'LANÇAR E REGULAR CONDUTOR PRIMÁRIO'),
   ('SV-0302', 'LANÇAR CABO MULTIPLEXADO BT'),
   ('SV-0303', 'RETIRAR CONDUTOR'),
   ('SV-0401', 'INSTALAR TRANSFORMADOR MONOFÁSICO'),
   ('SV-0402', 'INSTALAR TRANSFORMADOR TRIFÁSICO'),
   ('SV-0403', 'RETIRAR TRANSFORMADOR'),
   ('SV-0501', 'INSTALAR CHAVE FUSÍVEL'),
   ('SV-0502', 'INSTALAR PARA-RAIOS'),
   ('SV-0601', 'INSTALAR ATERRAMENTO'),
   ('SV-0701', 'INSTALAR RAMAL DE LIGAÇÃO'),
   ('SV-0801', 'PODA DE ÁRVORE EM REDE'),
   ('SV-0901', 'INSTALAR RELIGADOR AUTOMÁTICO'),
   ('SV-0902', 'INSTALAR BANCO REGULADOR DE TENSÃO'),
   ('SV-1001', 'INSTALAR ESTAI DE ÂNCORA')) x(cod, nome)
 WHERE NOT EXISTS (SELECT 1 FROM acoes a WHERE a.cod_acao = x.cod);

INSERT INTO acoes_valores (id, id_acao, id_contrato, valor_base, data_vigencia, ativo, data_criacao, versao, usuario_criacao)
SELECT gen_random_uuid(), a.id, ct.id, x.valor, date '2026-01-01', true, now(), 0, 'USRADMIN'
  FROM (VALUES ('SV-0101', 980.00), ('SV-0102', 1350.00), ('SV-0103', 520.00), ('SV-0201', 410.00), ('SV-0202', 640.00),
               ('SV-0203', 185.00), ('SV-0301', 6.80), ('SV-0302', 4.90), ('SV-0303', 2.10), ('SV-0401', 1450.00),
               ('SV-0402', 2380.00), ('SV-0403', 760.00), ('SV-0501', 310.00), ('SV-0502', 140.00), ('SV-0601', 260.00),
               ('SV-0701', 180.00), ('SV-0801', 230.00), ('SV-0901', 3900.00), ('SV-0902', 5200.00), ('SV-1001', 210.00),
               ('SRV-004', 5.20)) x(cod, valor)
  JOIN acoes a ON a.cod_acao = x.cod
  CROSS JOIN (SELECT id FROM contratos WHERE ativo ORDER BY data_criacao LIMIT 1) ct
 WHERE NOT EXISTS (SELECT 1 FROM acoes_valores v WHERE v.id_acao = a.id AND v.id_contrato = ct.id);

-- Materiais de rede ----------------------------------------------------------------------------------
INSERT INTO materiais (id, cod_material, descricao, unidade_medida, ativo, data_criacao, versao, usuario_criacao, catalogo, grupo, id_processo)
SELECT gen_random_uuid(), x.cod, x.descr, x.un, true, now(), 0, 'USRADMIN', 'OPERACIONAL', x.grupo, (SELECT id FROM processos_negocio WHERE nome = 'OBRAS')
  FROM (VALUES
   ('300116', 'POSTE CONCRETO DUPLO T 12M 600DAN', 'UN', 'POSTES'),
   ('300201', 'CABO ALUMINIO CAA 4 AWG', 'M', 'CONDUTORES'),
   ('300202', 'CABO ALUMINIO CAA 1/0 AWG', 'M', 'CONDUTORES'),
   ('300210', 'TRANSFORMADOR MONOFASICO 10KVA 13,8KV', 'UN', 'TRANSFORMADORES'),
   ('300211', 'TRANSFORMADOR TRIFASICO 45KVA 13,8KV', 'UN', 'TRANSFORMADORES'),
   ('300212', 'TRANSFORMADOR TRIFASICO 75KVA 13,8KV', 'UN', 'TRANSFORMADORES'),
   ('300220', 'ISOLADOR DE ANCORAGEM POLIMERICO 15KV', 'UN', 'ISOLADORES'),
   ('300230', 'CABO DE COBRE NU 25MM2', 'M', 'ATERRAMENTO'),
   ('300240', 'ALCA PREFORMADA DE SERVICO', 'UN', 'FERRAGENS'),
   ('300250', 'RELIGADOR AUTOMATICO 15KV 630A', 'UN', 'EQUIPAMENTOS'),
   ('300251', 'REGULADOR DE TENSAO MONOFASICO 15KV 100A', 'UN', 'EQUIPAMENTOS'),
   ('300260', 'CORDOALHA DE ACO 6,4MM PARA ESTAI', 'M', 'FERRAGENS')) x(cod, descr, un, grupo)
 WHERE NOT EXISTS (SELECT 1 FROM materiais m WHERE m.cod_material = x.cod);

-- Kits construtivos -----------------------------------------------------------------------------------
CREATE TEMP TABLE _kit (codigo text, descricao text, grupo text, tensoes text[]) ON COMMIT DROP;
INSERT INTO _kit VALUES
 ('PT-11', 'Poste DT 11m/300daN implantado', 'POSTE', '{BT,MT_15}'),
 ('PT-12', 'Poste DT 12m/600daN implantado', 'POSTE', '{MT_15,MT_36}'),
 ('RT-PT', 'Retirada de poste de concreto', 'POSTE', '{BT,MT_15}'),
 ('N1', 'Estrutura primária N1 (passagem)', 'ESTRUTURA MT', '{MT_15,MT_36}'),
 ('N3', 'Estrutura primária N3 (ancoragem)', 'ESTRUTURA MT', '{MT_15,MT_36}'),
 ('S1', 'Estrutura secundária S1', 'ESTRUTURA BT', '{BT}'),
 ('CBT-35', 'Rede BT multiplexada 3x1x35+35 mm²', 'VÃO BT', '{BT}'),
 ('CMT-4', 'Rede primária CAA 4 AWG', 'VÃO MT', '{MT_15}'),
 ('CMT-10', 'Rede primária CAA 1/0 AWG', 'VÃO MT', '{MT_15,MT_36}'),
 ('RT-COND', 'Retirada de condutor existente', 'VÃO BT', '{BT,MT_15}'),
 ('TR-10M', 'Transformador monofásico 10 kVA', 'TRANSFORMADOR', '{MT_15}'),
 ('TR-45T', 'Transformador trifásico 45 kVA', 'TRANSFORMADOR', '{MT_15}'),
 ('TR-75T', 'Transformador trifásico 75 kVA', 'TRANSFORMADOR', '{MT_15}'),
 ('CF-15', 'Chave fusível 15 kV com elo', 'PROTEÇÃO', '{MT_15}'),
 ('AT-01', 'Aterramento com 3 hastes', 'ATERRAMENTO', '{BT,MT_15}'),
 ('RL-01', 'Ramal de ligação BT', 'RAMAL', '{BT}'),
 ('ES-01', 'Estai de âncora', 'ESTAI', '{BT,MT_15}'),
 ('PD-01', 'Poda em rede de distribuição', 'PODA', '{BT,MT_15}'),
 ('RG-01', 'Religador automático 15 kV', 'EQUIPAMENTO', '{MT_15}'),
 ('RV-01', 'Banco regulador de tensão', 'EQUIPAMENTO', '{MT_15}');

CREATE TEMP TABLE _kit_item (kit text, tipo text, ref text, operacao text, unidade text, qtd numeric) ON COMMIT DROP;
INSERT INTO _kit_item VALUES
 ('PT-11','SERVICO','SV-0101','INSTALAR','UN',1), ('PT-11','MATERIAL','300115','INSTALAR','UN',1),
 ('PT-12','SERVICO','SV-0102','INSTALAR','UN',1), ('PT-12','MATERIAL','300116','INSTALAR','UN',1),
 ('RT-PT','SERVICO','SV-0103','RETIRAR','UN',1), ('RT-PT','MATERIAL','300115','RETIRAR','UN',1),
 ('N1','SERVICO','SV-0201','INSTALAR','UN',1), ('N1','MATERIAL','300101','INSTALAR','UN',1), ('N1','MATERIAL','300078','INSTALAR','UN',3),
 ('N3','SERVICO','SV-0202','INSTALAR','UN',1), ('N3','MATERIAL','300101','INSTALAR','UN',2), ('N3','MATERIAL','300220','INSTALAR','UN',6),
 ('S1','SERVICO','SV-0203','INSTALAR','UN',1), ('S1','MATERIAL','300172','INSTALAR','UN',1), ('S1','MATERIAL','300045','INSTALAR','UN',4),
 ('CBT-35','SERVICO','SV-0302','INSTALAR','M',1), ('CBT-35','MATERIAL','300012','INSTALAR','M',1.04),
 ('CMT-4','SERVICO','SV-0301','INSTALAR','M',3), ('CMT-4','MATERIAL','300201','INSTALAR','M',3.12),
 ('CMT-10','SERVICO','SV-0301','INSTALAR','M',3), ('CMT-10','MATERIAL','300202','INSTALAR','M',3.12),
 ('RT-COND','SERVICO','SV-0303','RETIRAR','M',1),
 ('TR-10M','SERVICO','SV-0401','INSTALAR','UN',1), ('TR-10M','MATERIAL','300210','INSTALAR','UN',1), ('TR-10M','MATERIAL','300144','INSTALAR','UN',1),
   ('TR-10M','MATERIAL','300158','INSTALAR','UN',1), ('TR-10M','MATERIAL','300130','INSTALAR','UN',1),
 ('TR-45T','SERVICO','SV-0402','INSTALAR','UN',1), ('TR-45T','MATERIAL','300211','INSTALAR','UN',1), ('TR-45T','MATERIAL','300144','INSTALAR','UN',3),
   ('TR-45T','MATERIAL','300158','INSTALAR','UN',3), ('TR-45T','MATERIAL','300130','INSTALAR','UN',3),
 ('TR-75T','SERVICO','SV-0402','INSTALAR','UN',1), ('TR-75T','MATERIAL','300212','INSTALAR','UN',1), ('TR-75T','MATERIAL','300144','INSTALAR','UN',3),
   ('TR-75T','MATERIAL','300158','INSTALAR','UN',3), ('TR-75T','MATERIAL','300130','INSTALAR','UN',3),
 ('CF-15','SERVICO','SV-0501','INSTALAR','UN',1), ('CF-15','MATERIAL','300144','INSTALAR','UN',1), ('CF-15','MATERIAL','300158','INSTALAR','UN',1),
 ('AT-01','SERVICO','SV-0601','INSTALAR','UN',1), ('AT-01','MATERIAL','300186','INSTALAR','UN',3), ('AT-01','MATERIAL','300230','INSTALAR','M',12),
 ('RL-01','SERVICO','SV-0701','INSTALAR','UN',1), ('RL-01','MATERIAL','300011','INSTALAR','M',25), ('RL-01','MATERIAL','300240','INSTALAR','UN',2),
 ('ES-01','SERVICO','SV-1001','INSTALAR','UN',1), ('ES-01','MATERIAL','300260','INSTALAR','M',12),
 ('PD-01','SERVICO','SV-0801','INSTALAR','UN',1),
 ('RG-01','SERVICO','SV-0901','INSTALAR','UN',1), ('RG-01','MATERIAL','300250','INSTALAR','UN',1),
 ('RV-01','SERVICO','SV-0902','INSTALAR','UN',1), ('RV-01','MATERIAL','300251','INSTALAR','UN',3);

INSERT INTO kits_construtivos (id, id_contrato, codigo, descricao, grupo, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), ct.id, k.codigo, k.descricao, k.grupo, 0, now(), 'USRADMIN', true
  FROM _kit k CROSS JOIN (SELECT id FROM contratos WHERE ativo ORDER BY data_criacao LIMIT 1) ct
 WHERE NOT EXISTS (SELECT 1 FROM kits_construtivos x WHERE x.id_contrato = ct.id AND x.codigo = k.codigo AND x.ativo);

INSERT INTO kits_construtivos_tensoes (id_kit, classe_tensao)
SELECT kc.id, t FROM _kit k JOIN kits_construtivos kc ON kc.codigo = k.codigo AND kc.ativo, unnest(k.tensoes) t
 WHERE NOT EXISTS (SELECT 1 FROM kits_construtivos_tensoes x WHERE x.id_kit = kc.id AND x.classe_tensao = t);

INSERT INTO itens_kits_construtivos (id, id_kit, tipo, id_acao, id_material, operacao, unidade, quantidade, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), kc.id, i.tipo,
       CASE WHEN i.tipo = 'SERVICO' THEN (SELECT id FROM acoes WHERE cod_acao = i.ref) END,
       CASE WHEN i.tipo = 'MATERIAL' THEN (SELECT id FROM materiais WHERE cod_material = i.ref) END,
       i.operacao, i.unidade, i.qtd, 0, now(), 'USRADMIN', true
  FROM _kit_item i JOIN kits_construtivos kc ON kc.codigo = i.kit AND kc.ativo
 WHERE NOT EXISTS (SELECT 1 FROM itens_kits_construtivos x WHERE x.id_kit = kc.id);

-- Modelos de checklist -------------------------------------------------------------------------------
INSERT INTO modelos_checklist_obra (id, finalidade, titulo, descricao, estrutura, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), 'VISITA_PREVIA', 'Pré-vistoria de rede de distribuição', 'Levantamento de campo antes da programação da obra',
 '{"grupos": [
   {"titulo": "Acesso e logística", "perguntas": [
     {"id": "pv-acesso", "tipo": "ESCOLHA_UNICA", "opcoes": ["Livre", "Restrito", "Somente com autorização"], "enunciado": "Condição de acesso ao trecho", "obrigatoria": true, "aceitaNaoSeAplica": false},
     {"id": "pv-veiculo", "tipo": "ESCOLHA_UNICA", "opcoes": ["Caminhão com guindauto", "Picape", "Somente a pé"], "enunciado": "Veículo que chega até os pontos", "obrigatoria": true, "aceitaNaoSeAplica": false},
     {"id": "pv-distancia", "tipo": "NUMERO", "opcoes": null, "enunciado": "Distância da via principal até o primeiro ponto (m)", "obrigatoria": true, "aceitaNaoSeAplica": true}]},
   {"titulo": "Rede existente", "perguntas": [
     {"id": "pv-desligamento", "tipo": "ESCOLHA_UNICA", "opcoes": ["Sim", "Não"], "enunciado": "Será necessário desligamento?", "obrigatoria": true, "aceitaNaoSeAplica": false},
     {"id": "pv-postes", "tipo": "NUMERO", "opcoes": null, "enunciado": "Postes existentes a substituir", "obrigatoria": true, "aceitaNaoSeAplica": true},
     {"id": "pv-interferencias", "tipo": "MULTIPLA_ESCOLHA", "opcoes": ["Vegetação", "Muro ou cerca", "Calçada", "Rede de telecom", "Curso d''água", "Nenhuma"], "enunciado": "Interferências encontradas", "obrigatoria": true, "aceitaNaoSeAplica": false}]},
   {"titulo": "Solo e segurança", "perguntas": [
     {"id": "pv-solo", "tipo": "ESCOLHA_UNICA", "opcoes": ["Areia", "Argila", "Rocha", "Misto"], "enunciado": "Tipo de solo predominante", "obrigatoria": true, "aceitaNaoSeAplica": false},
     {"id": "pv-poda", "tipo": "ESCOLHA_UNICA", "opcoes": ["Sim", "Não"], "enunciado": "Há necessidade de poda?", "obrigatoria": true, "aceitaNaoSeAplica": false},
     {"id": "pv-obs", "tipo": "TEXTO", "opcoes": null, "enunciado": "Observações para a equipe", "obrigatoria": false, "aceitaNaoSeAplica": false}]}]}'::jsonb,
 0, now(), 'USRADMIN', true
 WHERE NOT EXISTS (SELECT 1 FROM modelos_checklist_obra WHERE finalidade = 'VISITA_PREVIA' AND lower(titulo) = lower('Pré-vistoria de rede de distribuição') AND ativo);

INSERT INTO modelos_checklist_obra (id, finalidade, titulo, descricao, estrutura, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), 'AS_BUILT', 'Ficha As Built de ponto', 'Conferência do ponto executado com registro fotográfico',
 '{"grupos": [
   {"titulo": "Estrutura", "perguntas": [
     {"id": "ab-altura", "tipo": "NUMERO", "opcoes": null, "enunciado": "Altura do poste (m)", "obrigatoria": true, "aceitaNaoSeAplica": true},
     {"id": "ab-esforco", "tipo": "ESCOLHA_UNICA", "opcoes": ["300 daN", "600 daN", "1000 daN"], "enunciado": "Esforço nominal do poste", "obrigatoria": true, "aceitaNaoSeAplica": true},
     {"id": "ab-engastamento", "tipo": "NUMERO", "opcoes": null, "enunciado": "Engastamento (m)", "obrigatoria": true, "aceitaNaoSeAplica": true}]},
   {"titulo": "Conferência", "perguntas": [
     {"id": "ab-aterramento", "tipo": "ESCOLHA_UNICA", "opcoes": ["Sim", "Não"], "enunciado": "Aterramento executado conforme projeto", "obrigatoria": true, "aceitaNaoSeAplica": true},
     {"id": "ab-placa", "tipo": "ESCOLHA_UNICA", "opcoes": ["Sim", "Não"], "enunciado": "Placa de identificação instalada", "obrigatoria": true, "aceitaNaoSeAplica": false},
     {"id": "ab-obs", "tipo": "TEXTO", "opcoes": null, "enunciado": "Observações", "obrigatoria": false, "aceitaNaoSeAplica": false}]}],
  "evidencias": [
   {"id": "foto-geral", "titulo": "Vista geral do ponto", "obrigatoria": true},
   {"id": "foto-estrutura", "titulo": "Estrutura montada", "obrigatoria": true},
   {"id": "foto-aterramento", "titulo": "Aterramento", "obrigatoria": false}]}'::jsonb,
 0, now(), 'USRADMIN', true
 WHERE NOT EXISTS (SELECT 1 FROM modelos_checklist_obra WHERE finalidade = 'AS_BUILT' AND lower(titulo) = lower('Ficha As Built de ponto') AND ativo);
COMMIT;
