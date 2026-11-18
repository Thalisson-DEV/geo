-- Planejamento das obras: pontos e vãos sobre a folha do projeto, kits aplicados, itens planejados,
-- levantamento (pré-fechamento), anotações, orçamento importado e valores previstos da carteira.
-- Pré-requisito: 17_obras_carteira.sql (tabela demo_seed_obra).
BEGIN;
SELECT setseed(0.18);

CREATE TEMP TABLE _pt (k int, id_obra uuid, id uuid DEFAULT gen_random_uuid(), i int, x numeric, y numeric, ramal boolean,
                       kits text[], mults numeric[], tipo text, tipo_exec text, poda boolean, aterr boolean, barramento text, origem text,
                       quem text, quando timestamptz) ON COMMIT DROP;
CREATE TEMP TABLE _vao (k int, id_obra uuid, id uuid DEFAULT gen_random_uuid(), a int, b int, metragem numeric, kits text[],
                        origem text, quem text, quando timestamptz) ON COMMIT DROP;

DO $$
DECLARE
  o record; n int; m int; j int; i int; t int; b int; x numeric; y numeric; v_kits text[]; v_mults numeric[];
  v_sem_kit_de int; v_quem text; v_quando timestamptz; v_origem text; v_tipo text; v_texec text; v_trafo text; v_cabo text; v_mt_vao boolean;
BEGIN
  FOR o IN SELECT * FROM demo_seed_obra WHERE npts > 0 ORDER BY k LOOP
    n := o.npts;
    m := CASE WHEN n <= 14 THEN n ELSE ceil(n * 0.62) END;
    j := greatest(1, ceil(m / 2.0)::int);
    b := n - m;
    v_sem_kit_de := CASE WHEN o.perfil = 'LEV' THEN ceil(n * 0.65)::int + 1 WHEN o.k = 51 THEN 7 ELSE n + 1 END;
    v_quem := CASE WHEN o.k % 3 = 0 THEN 'MALIMA' ELSE 'CMENEZES' END;
    v_origem := CASE WHEN o.k % 3 = 0 THEN 'COPILOTO' ELSE 'MANUAL' END;
    v_quando := least(now() - interval '1 day', o.criada + ((2 + o.k % 6) || ' days')::interval + interval '3 hours');
    v_trafo := CASE WHEN o.tpl = 'LPT' THEN 'TR-10M' WHEN o.classe = 'MT_36' OR o.k % 4 = 0 THEN 'TR-75T' ELSE 'TR-45T' END;
    v_cabo := CASE WHEN o.classe = 'MT_36' OR o.tpl = 'EQP' THEN 'CMT-10' ELSE 'CMT-4' END;
    v_mt_vao := o.tpl IN ('MT', 'LPT', 'EQP');

    FOR i IN 1..n LOOP
      IF i <= m THEN
        x := CASE WHEN m = 1 THEN 0.5 ELSE 0.07 + 0.86 * (i - 1) / (m - 1) END;
        y := 0.34 + 0.09 * sin(i * 0.55 + o.k);
      ELSE
        t := i - m;
        x := (0.07 + 0.86 * (j - 1) / greatest(m - 1, 1)) + 0.30 * t / b + 0.02 * sin(t);
        y := (0.34 + 0.09 * sin(j * 0.55 + o.k)) + 0.48 * t / b;
      END IF;
      v_kits := '{}'; v_mults := '{}';
      CASE o.tpl
        WHEN 'BT' THEN
          v_kits := ARRAY['PT-11', 'S1']; v_mults := ARRAY[1, 1];
          IF i % 5 = 1 OR i = n THEN v_kits := v_kits || 'AT-01'::text; v_mults := v_mults || 1::numeric; END IF;
          IF i % 3 = 0 THEN v_kits := v_kits || 'RL-01'::text; v_mults := v_mults || (1 + i % 3)::numeric; END IF;
          IF i = 1 OR i = m THEN v_kits := v_kits || 'ES-01'::text; v_mults := v_mults || 1::numeric; END IF;
        WHEN 'RAM' THEN
          v_kits := ARRAY['RL-01']; v_mults := ARRAY[(2 + i % 3)::numeric];
          IF i % 2 = 1 THEN v_kits := v_kits || 'S1'::text; v_mults := v_mults || 1::numeric; END IF;
        WHEN 'REF' THEN
          IF i % 10 < 7 THEN v_kits := ARRAY['RT-PT', 'PT-11', 'S1']; v_mults := ARRAY[1, 1, 1];
          ELSE v_kits := ARRAY['S1']; v_mults := ARRAY[1]; END IF;
          IF i % 6 = 2 THEN v_kits := v_kits || 'AT-01'::text; v_mults := v_mults || 1::numeric; END IF;
          IF i % 4 = 0 THEN v_kits := v_kits || 'RL-01'::text; v_mults := v_mults || 2::numeric; END IF;
          IF i % 7 = 3 THEN v_kits := v_kits || 'PD-01'::text; v_mults := v_mults || 1::numeric; END IF;
        WHEN 'MT', 'LPT' THEN
          IF i = 1 THEN v_kits := ARRAY['PT-12', 'N3', 'CF-15']; v_mults := ARRAY[1, 1, 1];
          ELSIF i = n OR i = m OR (o.tpl = 'LPT' AND i % 5 = 0) OR (o.tpl = 'MT' AND i % 8 = 0) THEN
            v_kits := ARRAY['PT-12', 'N3', v_trafo, 'AT-01']; v_mults := ARRAY[1, 1, 1, 1];
          ELSIF i % 6 = 0 THEN v_kits := ARRAY['PT-12', 'N3', 'ES-01']; v_mults := ARRAY[1, 1, 1];
          ELSE v_kits := ARRAY['PT-12', 'N1']; v_mults := ARRAY[1, 1]; END IF;
          IF i = m + 1 THEN v_kits := v_kits || 'CF-15'::text; v_mults := v_mults || 1::numeric; END IF;
        WHEN 'EQP' THEN
          IF i = 1 THEN v_kits := ARRAY['PT-12', 'N3', CASE WHEN o.k = 14 THEN 'RV-01' ELSE 'RG-01' END, 'AT-01']; v_mults := ARRAY[1, 1, 1, 1];
          ELSE v_kits := ARRAY['PT-12', 'N1']; v_mults := ARRAY[1, 1]; END IF;
        WHEN 'PREV' THEN
          IF i % 2 = 0 THEN v_kits := ARRAY['PD-01', 'N1']; v_mults := ARRAY[1, 1];
          ELSE v_kits := ARRAY['N1']; v_mults := ARRAY[1]; END IF;
          IF i % 4 = 1 THEN v_kits := v_kits || 'AT-01'::text; v_mults := v_mults || 1::numeric; END IF;
        WHEN 'CORR' THEN
          IF o.classe = 'BT' THEN v_kits := ARRAY['RT-PT', 'PT-11', 'S1']; ELSE v_kits := ARRAY['RT-PT', 'PT-12', 'N1']; END IF;
          v_mults := ARRAY[1, 1, 1];
          IF i = 1 THEN v_kits := v_kits || 'AT-01'::text; v_mults := v_mults || 1::numeric; END IF;
        WHEN 'CORR_TR' THEN
          IF i = 1 THEN v_kits := ARRAY['TR-45T', 'AT-01']; v_mults := ARRAY[1, 1]; ELSE v_kits := ARRAY['CF-15']; v_mults := ARRAY[1]; END IF;
        ELSE NULL;
      END CASE;
      IF i >= v_sem_kit_de THEN v_kits := '{}'; v_mults := '{}'; END IF;

      v_tipo := CASE WHEN v_kits && ARRAY['TR-10M', 'TR-45T', 'TR-75T'] THEN 'TRANSFORMADOR' WHEN v_kits && ARRAY['RG-01', 'RV-01'] THEN 'ESTRUTURA'
                   WHEN 'CF-15' = ANY(v_kits) THEN 'CHAVE' ELSE 'POSTE' END;
      v_texec := CASE WHEN i >= v_sem_kit_de AND i % 2 = 0 THEN 'NAO_DEFINIDO'
                    WHEN o.tpl IN ('EQP', 'PREV') THEN 'SEM_DESLIGAMENTO'
                    WHEN o.tpl IN ('MT', 'LPT') THEN CASE WHEN i = 1 THEN 'COM_DESLIGAMENTO' ELSE 'SEM_DESLIGAMENTO' END
                    WHEN 'RT-PT' = ANY(v_kits) OR o.tpl = 'CORR_TR' THEN 'COM_DESLIGAMENTO' ELSE 'SEM_DESLIGAMENTO' END;
      INSERT INTO _pt (k, id_obra, i, x, y, ramal, kits, mults, tipo, tipo_exec, poda, aterr, barramento, origem, quem, quando)
      VALUES (o.k, o.id, i, round(least(0.95, greatest(0.04, x)), 6), round(least(0.95, greatest(0.05, y)), 6), i > m, v_kits, v_mults, v_tipo, v_texec,
              'PD-01' = ANY(v_kits) OR random() < 0.06, 'AT-01' = ANY(v_kits),
              CASE WHEN 'RT-PT' = ANY(v_kits) OR o.tpl IN ('PREV', 'CORR_TR') OR (o.tpl IN ('MT', 'LPT', 'EQP') AND i = 1)
                   THEN (CASE WHEN o.classe = 'BT' THEN 'D' ELSE 'K' END) || lpad(((o.k * 7919 + i * 131) % 900000 + 100000)::text, 6, '0') END,
              CASE WHEN v_origem = 'COPILOTO' AND i % 4 <> 0 THEN 'COPILOTO' ELSE 'MANUAL' END,
              v_quem, v_quando + (i * interval '2 minutes'));
    END LOOP;

    IF o.tpl NOT IN ('PREV', 'CORR', 'CORR_TR') AND n > 1 THEN
      FOR i IN 1..n LOOP
        IF i < m THEN
          INSERT INTO _vao (k, id_obra, a, b) VALUES (o.k, o.id, i, i + 1);
        ELSIF i > m THEN
          INSERT INTO _vao (k, id_obra, a, b) VALUES (o.k, o.id, CASE WHEN i = m + 1 THEN j ELSE i - 1 END, i);
        END IF;
      END LOOP;
      UPDATE _vao v SET
        metragem = CASE WHEN v_mt_vao THEN 58 + floor(random() * 32) ELSE 27 + floor(random() * 12) END,
        kits = CASE WHEN greatest(v.a, v.b) >= v_sem_kit_de AND v.b % 2 = 0 THEN '{}'
                    WHEN v_mt_vao THEN ARRAY[v_cabo]
                    WHEN o.tpl = 'REF' THEN ARRAY['CBT-35', 'RT-COND']
                    ELSE ARRAY['CBT-35'] END,
        origem = CASE WHEN v_origem = 'COPILOTO' THEN 'COPILOTO' ELSE 'MANUAL' END,
        quem = v_quem, quando = v_quando + interval '40 minutes' + v.b * interval '1 minute'
      WHERE v.k = o.k;
    END IF;
  END LOOP;
END $$;

INSERT INTO pontos_planejamento (id, id_obra, numero, pagina, x, y, barramento, tipo, tipo_execucao, tem_poda, tem_aterramento, origem,
                                 versao, data_criacao, usuario_criacao, ativo)
SELECT id, id_obra, i::text, 1, x, y, barramento, tipo, tipo_exec, poda, aterr, origem, 0, quando, quem, true FROM _pt;

INSERT INTO vaos_planejamento (id, id_obra, id_ponto_a, id_ponto_b, metragem, origem, versao, data_criacao, usuario_criacao, ativo)
SELECT v.id, v.id_obra, pa.id, pb.id, v.metragem, v.origem, 0, v.quando, v.quem, true
  FROM _vao v JOIN _pt pa ON pa.k = v.k AND pa.i = v.a JOIN _pt pb ON pb.k = v.k AND pb.i = v.b;

-- Kits aplicados em pontos e vãos
CREATE TEMP TABLE _ka ON COMMIT DROP AS
SELECT gen_random_uuid() id, p.id_obra, p.id id_ponto, NULL::uuid id_vao, u.kit, u.mult, p.quem, p.quando + interval '20 minutes' quando
  FROM _pt p, unnest(p.kits, p.mults) u(kit, mult)
UNION ALL
SELECT gen_random_uuid(), v.id_obra, NULL, v.id, u.kit, v.metragem, v.quem, v.quando + interval '20 minutes'
  FROM _vao v, unnest(v.kits) u(kit);

INSERT INTO kits_aplicados (id, id_obra, id_ponto, id_vao, id_kit, id_contrato, codigo_kit, descricao_kit, grupo_kit, operacao, multiplicador,
                            executado_antes, versao, data_criacao, usuario_criacao, ativo)
SELECT ka.id, ka.id_obra, ka.id_ponto, ka.id_vao, kc.id, kc.id_contrato, kc.codigo, kc.descricao, kc.grupo,
       CASE WHEN kc.codigo LIKE 'RT-%' THEN 'RETIRAR' ELSE 'INSTALAR' END, ka.mult, false, 0, ka.quando, ka.quem, true
  FROM _ka ka JOIN kits_construtivos kc ON kc.codigo = ka.kit AND kc.ativo;

INSERT INTO itens_planejados (id, id_kit_aplicado, tipo, id_acao, id_material, codigo, descricao, operacao, unidade, quantidade_kit,
                              quantidade_prevista, quantidade_executada, status, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), ka.id, ik.tipo, ik.id_acao, ik.id_material, coalesce(a.cod_acao, mt.cod_material), coalesce(a.nome, mt.descricao),
       CASE WHEN ka.operacao = 'RETIRAR' THEN 'RETIRAR' ELSE ik.operacao END, upper(ik.unidade), ik.quantidade,
       round(ik.quantidade * CASE WHEN ka.id_vao IS NULL OR upper(ik.unidade) IN ('M', 'MT', 'MTS', 'METRO', 'METROS') THEN ka.multiplicador ELSE 1 END, 4),
       0, 'PENDENTE', 0, ka.data_criacao, ka.usuario_criacao, true
  FROM kits_aplicados ka
  JOIN itens_kits_construtivos ik ON ik.id_kit = ka.id_kit AND ik.ativo
  LEFT JOIN acoes a ON a.id = ik.id_acao
  LEFT JOIN materiais mt ON mt.id = ik.id_material
 WHERE ka.id_obra IN (SELECT id FROM demo_seed_obra);

-- Planejamento (o projeto mestre é anexado pelo 22_obras_arquivos.py) e levantamento concluído
INSERT INTO planejamentos_obras (id, id_obra, id_anexo_mestre, rotacoes, levantamento_concluido_em, levantamento_concluido_por,
                                 versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), o.id, NULL, '{}'::jsonb,
       CASE WHEN o.perfil IN ('APROG', 'FUT', 'EXEC', 'PARA', 'CONC') THEN least(now() - interval '20 hours', o.criada + ((6 + o.k % 7) || ' days')::interval + interval '5 hours') END,
       CASE WHEN o.perfil IN ('APROG', 'FUT', 'EXEC', 'PARA', 'CONC') THEN 'CMENEZES' END,
       0, o.criada + interval '2 days', 'CMENEZES', true
  FROM demo_seed_obra o WHERE o.npts > 0;

-- Anotações do planejador na folha
INSERT INTO anotacoes_planejamento (id, id_obra, pagina, x, y, texto, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), o.id, 1, round((0.15 + random() * 0.6)::numeric, 4), round((0.62 + random() * 0.3)::numeric, 4),
       (ARRAY['Confirmar travessia sobre a estrada vicinal com o fiscal.', 'Cliente pediu ramal pelo fundo do lote.',
              'Solo rochoso no trecho: prever perfuratriz.', 'Rede de telecom no mesmo poste, avisar a operadora.',
              'Árvores de grande porte; poda antes da equipe de construção.', 'Ponto de derivação depende de desligamento do alimentador.'])[1 + o.k % 6],
       0, o.criada + interval '3 days', CASE WHEN o.k % 3 = 0 THEN 'MALIMA' ELSE 'CMENEZES' END, true
  FROM demo_seed_obra o WHERE o.npts >= 8 AND o.k % 2 = 1;

-- Orçamento importado (serviços da obra com preço do contrato)
INSERT INTO itens_orcamento_obras (id, id_obra, id_importacao, codigo, descricao, unidade, quantidade, valor_unitario, valor_total, id_acao,
                                   versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), ka.id_obra,
       (SELECT id FROM importacoes_obras WHERE tipo = 'ORCAMENTO' ORDER BY data_criacao LIMIT 1 OFFSET (abs(hashtext(ka.id_obra::text)) % 2)),
       ip.codigo, ip.descricao, min(ip.unidade), round(sum(ip.quantidade_prevista) * 1.03, 4), av.valor_base,
       round(sum(ip.quantidade_prevista) * 1.03 * av.valor_base, 2), ip.id_acao, 0, min(ka.data_criacao) + interval '1 day', 'PNOVAES', true
  FROM itens_planejados ip JOIN kits_aplicados ka ON ka.id = ip.id_kit_aplicado
  JOIN acoes_valores av ON av.id_acao = ip.id_acao AND av.ativo
  JOIN demo_seed_obra o ON o.id = ka.id_obra AND o.perfil IN ('PRONTA', 'APROG', 'FUT', 'EXEC', 'PARA', 'CONC')
 WHERE ip.tipo = 'SERVICO'
 GROUP BY ka.id_obra, ip.codigo, ip.descricao, ip.id_acao, av.valor_base;

-- Valores previstos coerentes com o planejamento (material ~ 1,7 a 2,6x o serviço; MT 36 kV mais caro)
WITH s AS (
  SELECT ka.id_obra, sum(ip.quantidade_prevista * av.valor_base) servico
    FROM itens_planejados ip JOIN kits_aplicados ka ON ka.id = ip.id_kit_aplicado
    JOIN acoes_valores av ON av.id_acao = ip.id_acao AND av.ativo
   WHERE ip.tipo = 'SERVICO' GROUP BY ka.id_obra),
v AS (SELECT o.id, round(s.servico * 1.04, 2) srv,
             round(s.servico * (1.7 + (abs(hashtext(o.numero)) % 90) / 100.0 + CASE WHEN o.classe_tensao = 'MT_36' THEN 0.9 ELSE 0 END) + 9000, 2) mat
        FROM obras o JOIN s ON s.id_obra = o.id)
UPDATE obras o SET valor_servico_previsto = v.srv, valor_material_previsto = v.mat, valor_projeto = v.srv + v.mat
  FROM v WHERE v.id = o.id;
-- Obras ainda sem levantamento: valor estimado na carteira
UPDATE obras o SET valor_projeto = round((22000 + (abs(hashtext(o.numero)) % 170000))::numeric, 2),
       valor_servico_previsto = round((22000 + (abs(hashtext(o.numero)) % 170000)) * 0.38, 2),
       valor_material_previsto = round((22000 + (abs(hashtext(o.numero)) % 170000)) * 0.62, 2)
 WHERE o.id IN (SELECT id FROM demo_seed_obra WHERE npts = 0) AND o.valor_servico_previsto IS NULL;
COMMIT;
