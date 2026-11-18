-- Medições (ciclos mensais, parciais e estornos), pré-vistorias, fichas As Built e equipamentos instalados.
-- Pré-requisito: 19_obras_programacao_execucao.sql. Use o mesmo demo.hoje do 19.
BEGIN;
SELECT setseed(0.20);
CREATE TEMP TABLE _cfg ON COMMIT DROP AS
SELECT coalesce(nullif(current_setting('demo.hoje', true), '')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS hoje;

-- Serviços concluídos com o realizado (soma dos apontamentos) ---------------------------------------------
CREATE TEMP TABLE _srv ON COMMIT DROP AS
SELECT ip.id, ka.id_obra, ka.id id_kit, ka.id_ponto, ka.id_vao, ka.codigo_kit, ip.codigo, ip.descricao, ip.operacao, ip.unidade,
       sum(a.quantidade) qtd, sum(a.valor_total) valor, max(a.data) concluido_em,
       (SELECT pi.valor_unitario FROM programacao_itens pi WHERE pi.id_item_planejado = ip.id AND pi.ativo LIMIT 1) vu,
       date_trunc('month', max(a.data))::date competencia
  FROM itens_planejados ip
  JOIN kits_aplicados ka ON ka.id = ip.id_kit_aplicado
  JOIN apontamentos_execucao a ON a.id_item_planejado = ip.id AND a.ativo
 WHERE ip.tipo = 'SERVICO' AND ip.status = 'CONCLUIDO'
 GROUP BY ip.id, ka.id_obra, ka.id, ka.id_ponto, ka.id_vao, ka.codigo_kit, ip.codigo, ip.descricao, ip.operacao, ip.unidade;

-- Quais ciclos (obra x competência) viram medição, e quando
CREATE TEMP TABLE _med ON COMMIT DROP AS
SELECT x.*, gen_random_uuid() id, 'CICLO'::text tipo,
       ((x.competencia + interval '1 month')::date + 1 + abs(hashtext(x.id_obra::text)) % 2) gerada_em
  FROM (SELECT s.id_obra, s.competencia, o.k, o.perfil, o.med,
               max(s.competencia) OVER (PARTITION BY s.id_obra) ultima
          FROM _srv s JOIN demo_seed_obra o ON o.id = s.id_obra
         GROUP BY s.id_obra, s.competencia, o.k, o.perfil, o.med) x
 WHERE x.med IN ('T', 'P')
   AND x.competencia < date_trunc('month', (SELECT hoje FROM _cfg))::date
   AND NOT (x.med = 'P' AND x.perfil = 'CONC' AND x.competencia = x.ultima);
DELETE FROM _med WHERE gerada_em > (SELECT hoje FROM _cfg);
-- O ciclo do mês passado ainda está sendo fechado: só parte das obras já foi medida
DELETE FROM _med WHERE competencia = (date_trunc('month', (SELECT hoje FROM _cfg)) - interval '1 month')::date AND abs(hashtext(id_obra::text)) % 2 = 1;
-- Obras concluídas no mês corrente e já medidas: medição parcial logo após a conclusão
INSERT INTO _med (id_obra, competencia, k, perfil, med, ultima, id, tipo, gerada_em)
SELECT o.id, date_trunc('month', (SELECT hoje FROM _cfg))::date, o.k, o.perfil, o.med, NULL, gen_random_uuid(), 'PARCIAL', o.fim_efetiva + 2
  FROM demo_seed_obra o
 WHERE o.perfil = 'CONC' AND o.med = 'T' AND o.fim_efetiva >= date_trunc('month', (SELECT hoje FROM _cfg))::date AND o.fim_efetiva + 2 <= (SELECT hoje FROM _cfg);

-- Dois ciclos estornados (competência errada) e refeitos em seguida
CREATE TEMP TABLE _est ON COMMIT DROP AS
SELECT gen_random_uuid() id, m.id id_refeita, m.id_obra, m.competencia, m.gerada_em
  FROM _med m WHERE m.tipo = 'CICLO' ORDER BY abs(hashtext(m.id_obra::text || m.competencia)) LIMIT 2;

CREATE TEMP TABLE _num ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY quando, id) numero FROM (
  SELECT id, (gerada_em::timestamp + interval '9 hours') quando FROM _est
  UNION ALL SELECT id, (gerada_em::timestamp + interval '15 hours') FROM _med) z;

INSERT INTO medicoes_obras (id, numero, id_obra, tipo, competencia, status, valor_total, observacao, justificativa_estorno, data_estorno, usuario_estorno,
                            versao, data_criacao, data_ultima_alteracao, usuario_criacao, usuario_ultima_alteracao, ativo)
SELECT m.id, n.numero, m.id_obra, m.tipo, m.competencia, 'GERADA',
       coalesce((SELECT sum(s.valor) FROM _srv s WHERE s.id_obra = m.id_obra AND (m.tipo = 'PARCIAL' OR s.competencia = m.competencia)), 0),
       CASE WHEN m.tipo = 'PARCIAL' THEN 'Medição final após a conclusão da obra.'
            ELSE 'Ciclo de ' || to_char(m.competencia, 'MM/YYYY') || ' conferido com o fiscal.' END,
       NULL, NULL, NULL, 0, (m.gerada_em::timestamp + interval '15 hours') AT TIME ZONE 'America/Sao_Paulo',
       (m.gerada_em::timestamp + interval '15 hours') AT TIME ZONE 'America/Sao_Paulo', 'PNOVAES', 'PNOVAES', true
  FROM _med m JOIN _num n ON n.id = m.id;

INSERT INTO medicoes_obras (id, numero, id_obra, tipo, competencia, status, valor_total, observacao, justificativa_estorno, data_estorno, usuario_estorno,
                            versao, data_criacao, data_ultima_alteracao, usuario_criacao, usuario_ultima_alteracao, ativo)
SELECT e.id, n.numero, e.id_obra, 'CICLO', (e.competencia - interval '1 month')::date, 'ESTORNADA',
       (SELECT sum(s.valor) FROM _srv s WHERE s.id_obra = e.id_obra AND s.competencia = e.competencia),
       NULL, 'Ciclo gerado na competência errada; refeito na competência correta.',
       (e.gerada_em::timestamp + interval '11 hours') AT TIME ZONE 'America/Sao_Paulo', 'PNOVAES',
       1, (e.gerada_em::timestamp + interval '9 hours') AT TIME ZONE 'America/Sao_Paulo',
       (e.gerada_em::timestamp + interval '11 hours') AT TIME ZONE 'America/Sao_Paulo', 'PNOVAES', 'PNOVAES', true
  FROM _est e JOIN _num n ON n.id = e.id;
SELECT setval('medicoes_obras_numero_seq', (SELECT coalesce(max(numero), 0) + 1 FROM medicoes_obras), false);

INSERT INTO medicao_itens (id, id_medicao, id_item_planejado, id_kit_aplicado, id_ponto, id_vao, codigo_kit, codigo, descricao, operacao, unidade,
                           quantidade, valor_unitario, valor_total, concluido_em, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), m.id, s.id, s.id_kit, s.id_ponto, s.id_vao, s.codigo_kit, s.codigo, s.descricao, s.operacao, s.unidade,
       s.qtd, s.vu, s.valor, s.concluido_em, 0, (m.gerada_em::timestamp + interval '15 hours') AT TIME ZONE 'America/Sao_Paulo', 'PNOVAES', true
  FROM _med m JOIN _srv s ON s.id_obra = m.id_obra AND (m.tipo = 'PARCIAL' OR s.competencia = m.competencia);
INSERT INTO medicao_itens (id, id_medicao, id_item_planejado, id_kit_aplicado, id_ponto, id_vao, codigo_kit, codigo, descricao, operacao, unidade,
                           quantidade, valor_unitario, valor_total, concluido_em, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), e.id, s.id, s.id_kit, s.id_ponto, s.id_vao, s.codigo_kit, s.codigo, s.descricao, s.operacao, s.unidade,
       s.qtd, s.vu, s.valor, s.concluido_em, 0, (e.gerada_em::timestamp + interval '9 hours') AT TIME ZONE 'America/Sao_Paulo', 'PNOVAES', false
  FROM _est e JOIN _srv s ON s.id_obra = e.id_obra AND s.competencia = e.competencia;

UPDATE itens_planejados ip SET status = 'MEDIDO', data_ultima_alteracao = mo.data_criacao, usuario_ultima_alteracao = 'PNOVAES'
  FROM medicao_itens mi JOIN medicoes_obras mo ON mo.id = mi.id_medicao
 WHERE mi.id_item_planejado = ip.id AND mi.ativo AND mo.status = 'GERADA';

-- Pré-vistorias ---------------------------------------------------------------------------------------
CREATE TEMP TABLE _mv ON COMMIT DROP AS
SELECT id, titulo FROM modelos_checklist_obra WHERE finalidade = 'VISITA_PREVIA' AND ativo AND titulo = 'Pré-vistoria de rede de distribuição';

INSERT INTO visitas_previas_obra (id, id_obra, id_modelo, titulo_modelo, data_visita, responsavel, observacoes, respostas, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), o.id, mv.id, mv.titulo, v.dia,
       (ARRAY['MARIA APARECIDA LIMA', 'PAULO ROBERTO ALMEIDA', 'FÁBIO JÚNIOR CARVALHO', 'ADRIANO MOREIRA LOPES', 'SANDRA REGINA CAMPOS', 'UBIRATAN MACEDO'])[1 + (o.k + g) % 6],
       (ARRAY['Trecho com acesso por estrada vicinal; caminhão chega até o último ponto.',
              'Necessária poda em três pontos antes da implantação. Proprietários avisados.',
              'Rede de telecom compartilhando postes existentes; avisar a operadora.',
              'Solo rochoso nos pontos finais; prever perfuratriz e escavação manual.',
              'Cliente acompanhou a vistoria e confirmou a localização do padrão.',
              'Travessia sobre a estrada estadual; solicitar autorização ao órgão de trânsito.'])[1 + (o.k * 3 + g) % 6],
       jsonb_build_object('itens', jsonb_build_array(
         jsonb_build_object('tipo', 'ESCOLHA_UNICA', 'grupo', 'Acesso e logística', 'valor', NULL, 'enunciado', 'Condição de acesso ao trecho', 'idPergunta', 'pv-acesso',
                            'naoSeAplica', false, 'obrigatoria', true, 'selecionadas', jsonb_build_array((ARRAY['Livre', 'Livre', 'Restrito', 'Somente com autorização'])[1 + o.k % 4])),
         jsonb_build_object('tipo', 'ESCOLHA_UNICA', 'grupo', 'Acesso e logística', 'valor', NULL, 'enunciado', 'Veículo que chega até os pontos', 'idPergunta', 'pv-veiculo',
                            'naoSeAplica', false, 'obrigatoria', true, 'selecionadas', jsonb_build_array((ARRAY['Caminhão com guindauto', 'Caminhão com guindauto', 'Picape', 'Somente a pé'])[1 + (o.k + g) % 4])),
         jsonb_build_object('tipo', 'NUMERO', 'grupo', 'Acesso e logística', 'valor', CASE WHEN o.tpl IN ('BT', 'REF', 'RAM', 'CORR') THEN NULL ELSE (40 + (o.k * 37) % 900)::text END,
                            'enunciado', 'Distância da via principal até o primeiro ponto (m)', 'idPergunta', 'pv-distancia',
                            'naoSeAplica', o.tpl IN ('BT', 'REF', 'RAM', 'CORR'), 'obrigatoria', true, 'selecionadas', '[]'::jsonb),
         jsonb_build_object('tipo', 'ESCOLHA_UNICA', 'grupo', 'Rede existente', 'valor', NULL, 'enunciado', 'Será necessário desligamento?', 'idPergunta', 'pv-desligamento',
                            'naoSeAplica', false, 'obrigatoria', true, 'selecionadas', jsonb_build_array(CASE WHEN o.tpl IN ('REF', 'CORR', 'CORR_TR') OR o.k % 3 = 0 THEN 'Sim' ELSE 'Não' END)),
         jsonb_build_object('tipo', 'NUMERO', 'grupo', 'Rede existente', 'valor', CASE WHEN o.tpl IN ('REF', 'CORR') THEN (2 + o.k % 9)::text END,
                            'enunciado', 'Postes existentes a substituir', 'idPergunta', 'pv-postes',
                            'naoSeAplica', o.tpl NOT IN ('REF', 'CORR'), 'obrigatoria', true, 'selecionadas', '[]'::jsonb),
         jsonb_build_object('tipo', 'MULTIPLA_ESCOLHA', 'grupo', 'Rede existente', 'valor', NULL, 'enunciado', 'Interferências encontradas', 'idPergunta', 'pv-interferencias',
                            'naoSeAplica', false, 'obrigatoria', true,
                            'selecionadas', (ARRAY['["Vegetação"]', '["Vegetação", "Muro ou cerca"]', '["Calçada", "Rede de telecom"]', '["Nenhuma"]', '["Curso d''água", "Vegetação"]'])[1 + (o.k + g) % 5]::jsonb),
         jsonb_build_object('tipo', 'ESCOLHA_UNICA', 'grupo', 'Solo e segurança', 'valor', NULL, 'enunciado', 'Tipo de solo predominante', 'idPergunta', 'pv-solo',
                            'naoSeAplica', false, 'obrigatoria', true, 'selecionadas', jsonb_build_array((ARRAY['Areia', 'Argila', 'Rocha', 'Misto'])[1 + o.k % 4])),
         jsonb_build_object('tipo', 'ESCOLHA_UNICA', 'grupo', 'Solo e segurança', 'valor', NULL, 'enunciado', 'Há necessidade de poda?', 'idPergunta', 'pv-poda',
                            'naoSeAplica', false, 'obrigatoria', true, 'selecionadas', jsonb_build_array(CASE WHEN (o.k + g) % 3 = 0 THEN 'Sim' ELSE 'Não' END)),
         jsonb_build_object('tipo', 'TEXTO', 'grupo', 'Solo e segurança', 'valor', CASE WHEN o.k % 2 = 0 THEN 'Combinar horário com os moradores para a interrupção.' END,
                            'enunciado', 'Observações para a equipe', 'idPergunta', 'pv-obs', 'naoSeAplica', false, 'obrigatoria', false, 'selecionadas', '[]'::jsonb))),
       0, (v.dia::timestamp + interval '17 hours') AT TIME ZONE 'America/Sao_Paulo', CASE WHEN o.k % 3 = 0 THEN 'MALIMA' ELSE 'CMENEZES' END, true
  FROM demo_seed_obra o CROSS JOIN _mv mv
  CROSS JOIN LATERAL generate_series(1, CASE WHEN o.k % 5 = 0 AND o.perfil NOT IN ('LEV') THEN 2 ELSE 1 END) g
  CROSS JOIN LATERAL (SELECT least((SELECT hoje FROM _cfg) - 1, (o.criada AT TIME ZONE 'America/Sao_Paulo')::date + 1 + (o.k % 4) + (g - 1) * 9) dia) v
 WHERE o.perfil IN ('LEV', 'PRONTA', 'APROG', 'FUT', 'EXEC', 'PARA', 'CONC') AND (o.perfil <> 'LEV' OR o.k % 2 = 0);

-- Fichas As Built dos pontos com execução ------------------------------------------------------------------
CREATE TEMP TABLE _ma ON COMMIT DROP AS
SELECT id, titulo FROM modelos_checklist_obra WHERE finalidade = 'AS_BUILT' AND ativo AND titulo = 'Ficha As Built de ponto';
CREATE TEMP TABLE _pe ON COMMIT DROP AS
SELECT p.id, p.id_obra, p.numero, o.k, o.perfil,
       bool_or(ka.codigo_kit = 'PT-12') pt12, bool_or(ka.codigo_kit IN ('PT-11', 'PT-12')) poste, bool_or(ka.codigo_kit = 'AT-01') aterr,
       max(a.data) ultimo
  FROM pontos_planejamento p JOIN demo_seed_obra o ON o.id = p.id_obra
  JOIN kits_aplicados ka ON ka.id_ponto = p.id JOIN itens_planejados ip ON ip.id_kit_aplicado = ka.id AND ip.quantidade_executada > 0
  LEFT JOIN apontamentos_execucao a ON a.id_item_planejado = ip.id
 GROUP BY p.id, p.id_obra, p.numero, o.k, o.perfil;

INSERT INTO fichas_as_built (id, id_obra, id_ponto, id_modelo, titulo_modelo, respostas, completa, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), pe.id_obra, pe.id, ma.id, ma.titulo,
       jsonb_build_object('itens', jsonb_build_array(
         jsonb_build_object('tipo', 'NUMERO', 'grupo', 'Estrutura', 'valor', CASE WHEN pe.poste THEN CASE WHEN pe.pt12 THEN '12' ELSE '11' END END,
                            'enunciado', 'Altura do poste (m)', 'idPergunta', 'ab-altura', 'naoSeAplica', NOT pe.poste, 'obrigatoria', true, 'selecionadas', '[]'::jsonb),
         jsonb_build_object('tipo', 'ESCOLHA_UNICA', 'grupo', 'Estrutura', 'valor', NULL, 'enunciado', 'Esforço nominal do poste', 'idPergunta', 'ab-esforco',
                            'naoSeAplica', NOT pe.poste, 'obrigatoria', true,
                            'selecionadas', CASE WHEN pe.poste THEN jsonb_build_array(CASE WHEN pe.pt12 THEN '600 daN' ELSE '300 daN' END) ELSE '[]'::jsonb END),
         jsonb_build_object('tipo', 'NUMERO', 'grupo', 'Estrutura', 'valor', CASE WHEN pe.poste THEN CASE WHEN pe.pt12 THEN '1.8' ELSE '1.7' END END,
                            'enunciado', 'Engastamento (m)', 'idPergunta', 'ab-engastamento', 'naoSeAplica', NOT pe.poste, 'obrigatoria', true, 'selecionadas', '[]'::jsonb),
         jsonb_build_object('tipo', 'ESCOLHA_UNICA', 'grupo', 'Conferência', 'valor', NULL, 'enunciado', 'Aterramento executado conforme projeto', 'idPergunta', 'ab-aterramento',
                            'naoSeAplica', NOT pe.aterr, 'obrigatoria', true, 'selecionadas', CASE WHEN pe.aterr THEN '["Sim"]'::jsonb ELSE '[]'::jsonb END),
         jsonb_build_object('tipo', 'ESCOLHA_UNICA', 'grupo', 'Conferência', 'valor', NULL, 'enunciado', 'Placa de identificação instalada', 'idPergunta', 'ab-placa',
                            'naoSeAplica', false, 'obrigatoria', true, 'selecionadas', CASE WHEN x.incompleta THEN '[]'::jsonb ELSE '["Sim"]'::jsonb END),
         jsonb_build_object('tipo', 'TEXTO', 'grupo', 'Conferência', 'valor', CASE WHEN abs(hashtext(pe.id::text)) % 5 = 0 THEN 'Ponto deslocado 2 m em relação ao projeto por causa da calçada.' END,
                            'enunciado', 'Observações', 'idPergunta', 'ab-obs', 'naoSeAplica', false, 'obrigatoria', false, 'selecionadas', '[]'::jsonb))),
       NOT x.incompleta, 0, (coalesce(pe.ultimo, (SELECT hoje FROM _cfg))::timestamp + interval '18 hours') AT TIME ZONE 'America/Sao_Paulo', 'MALIMA', true
  FROM _pe pe CROSS JOIN _ma ma
  CROSS JOIN LATERAL (SELECT pe.perfil <> 'CONC' AND abs(hashtext(pe.id::text)) % 100 < 15 incompleta) x
 WHERE pe.perfil = 'CONC' OR abs(hashtext(pe.id::text || 'f')) % 100 < 80;

-- Equipamentos instalados (religador / regulador)
INSERT INTO equipamentos_obra (id, id_obra, id_ponto, tipo, trafo_auxiliar, observacao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), ka.id_obra, ka.id_ponto, CASE WHEN ka.codigo_kit = 'RG-01' THEN 'RELIGADOR' ELSE 'REGULADOR' END,
       ka.codigo_kit = 'RG-01' AND abs(hashtext(ka.id::text)) % 2 = 0,
       CASE WHEN ka.codigo_kit = 'RG-01' THEN 'Religador trifásico com controle eletrônico; ajuste de proteção enviado pelo COD.'
            ELSE 'Banco com três reguladores monofásicos 100 A em delta aberto.' END,
       0, ka.data_criacao + interval '1 day', 'CMENEZES', true
  FROM kits_aplicados ka WHERE ka.codigo_kit IN ('RG-01', 'RV-01') AND ka.id_obra IN (SELECT id FROM demo_seed_obra);
COMMIT;
