-- Programação e execução das obras: frentes de serviço por equipe (sem sobreposição na agenda da equipe),
-- itens programados com valor congelado, histórico de edições/reprogramações/cancelamentos, turnos de campo
-- (membros, atividades, APR, ocorrências, relatório) e apontamentos que movem o status dos itens.
-- "Hoje" é a data local (America/Sao_Paulo) ou a informada em demo.hoje (ex.: PGOPTIONS='-c demo.hoje=2026-11-04').
-- Pré-requisito: 18_obras_planejamento.sql.
BEGIN;
SELECT setseed(0.19);

CREATE TEMP TABLE _cfg ON COMMIT DROP AS
SELECT coalesce(nullif(current_setting('demo.hoje', true), '')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS hoje;

-- Equipes de Obras com líder e veículo
CREATE TEMP TABLE _eq ON COMMIT DROP AS
SELECT e.id, e.cod_equipe cod, substring(e.cod_equipe FROM '-(\w{3})-') reg, split_part(e.cod_equipe, '-', 1) tipo,
       e.id_veiculo_vinculado id_veiculo,
       (SELECT m.id_colaborador FROM equipe_membros m JOIN colaboradores c ON c.id = m.id_colaborador JOIN funcoes f ON f.id = c.id_funcao
         WHERE m.id_equipe = e.id AND m.data_saida IS NULL ORDER BY (f.nome = 'ENCARREGADO') DESC, m.id LIMIT 1) id_lider
  FROM equipes e WHERE e.ativo;

CREATE TEMP TABLE _agenda (id_equipe uuid, dia date, PRIMARY KEY (id_equipe, dia)) ON COMMIT DROP;

-- Procura, a partir de "desejado", o primeiro período de "dur" dias seguidos (sem domingo) livre para alguma equipe do pool.
CREATE FUNCTION pg_temp.alocar(pool text[], desejado date, dur int, ate date, OUT id_equipe uuid, OUT ini date, OUT fim date) AS $$
DECLARE s date; v_cod text; eq uuid; livre boolean;
BEGIN
  s := desejado;
  WHILE s <= ate LOOP
    IF extract(isodow FROM s) <> 7 AND NOT EXISTS (SELECT 1 FROM generate_series(s, s + dur - 1, interval '1 day') d WHERE extract(isodow FROM d) = 7) THEN
      FOREACH v_cod IN ARRAY pool LOOP
        SELECT e.id INTO eq FROM _eq e WHERE e.cod = v_cod;
        IF eq IS NULL THEN CONTINUE; END IF;
        SELECT NOT EXISTS (SELECT 1 FROM _agenda a WHERE a.id_equipe = eq AND a.dia BETWEEN s AND s + dur - 1) INTO livre;
        IF livre THEN
          INSERT INTO _agenda SELECT eq, d::date FROM generate_series(s, s + dur - 1, interval '1 day') d;
          id_equipe := eq; ini := s; fim := s + dur - 1;
          RETURN;
        END IF;
      END LOOP;
    END IF;
    s := s + 1;
  END LOOP;
END $$ LANGUAGE plpgsql;

-- Pontos com a ordem de execução e a frente a que pertencem
CREATE TEMP TABLE _p ON COMMIT DROP AS
SELECT o.k, p.id_obra, p.id, p.numero::int i, p.tipo_execucao,
       row_number() OVER (PARTITION BY p.id_obra ORDER BY p.numero::int) pos,
       count(*) OVER (PARTITION BY p.id_obra) npts
  FROM pontos_planejamento p JOIN demo_seed_obra o ON o.id = p.id_obra
 WHERE o.perfil IN ('FUT', 'EXEC', 'PARA', 'CONC') OR o.k = 24;
ALTER TABLE _p ADD COLUMN f int;
UPDATE _p p SET f = 1 + (p.pos - 1) / (CASE o.tpl WHEN 'EQP' THEN 3 WHEN 'CORR' THEN 3 WHEN 'CORR_TR' THEN 2 WHEN 'PREV' THEN 3
                                                   WHEN 'MT' THEN 4 WHEN 'LPT' THEN 4 ELSE 4 END)
  FROM demo_seed_obra o WHERE o.k = p.k;

CREATE TEMP TABLE _fr ON COMMIT DROP AS
SELECT p.k, p.id_obra, p.f, count(*) n, min(p.i) pmin, max(p.i) pmax, bool_or(p.tipo_execucao = 'COM_DESLIGAMENTO') deslig,
       max(p.f) OVER (PARTITION BY p.k) nf
  FROM _p p GROUP BY p.k, p.id_obra, p.f;
ALTER TABLE _fr ADD COLUMN estado text, ADD COLUMN dur int, ADD COLUMN id_equipe uuid, ADD COLUMN ini date, ADD COLUMN fim date,
  ADD COLUMN id_prog uuid DEFAULT gen_random_uuid(), ADD COLUMN reprog boolean DEFAULT false, ADD COLUMN cancelada_antes boolean DEFAULT false;
UPDATE _fr f SET dur = least(3, greatest(1, ceil(f.n / CASE o.tpl WHEN 'PREV' THEN 3.0 WHEN 'CORR' THEN 2.0 WHEN 'EQP' THEN 1.5 ELSE 2.0 END)::int))
  FROM demo_seed_obra o WHERE o.k = f.k;

-- Agenda: frentes executadas no passado, frente atual, futuras (próximas 3 semanas) e atrasadas
DO $$
DECLARE
  o record; fr record; v_hoje date := (SELECT hoje FROM _cfg); pool text[]; cursor_d date; r record; e int; ultimo_exec date;
BEGIN
  FOR o IN SELECT * FROM demo_seed_obra WHERE id IN (SELECT id_obra FROM _fr) ORDER BY inicio, k LOOP
    pool := CASE
      WHEN o.tpl IN ('EQP', 'PREV') THEN ARRAY['LV-' || o.reg || '-02', 'LV-' || o.reg || '-01', 'CON-' || o.reg || '-01', 'CON-' || o.reg || '-02']
      WHEN o.tpl IN ('REF', 'CORR', 'CORR_TR') THEN ARRAY['RET-' || o.reg || '-01', 'CON-' || o.reg || '-01', 'CON-' || o.reg || '-02', 'LV-' || o.reg || '-02']
      ELSE ARRAY['CON-' || o.reg || '-01', 'CON-' || o.reg || '-02', 'RET-' || o.reg || '-01', 'LV-' || o.reg || '-02', 'LV-' || o.reg || '-01'] END;
    IF o.reg = 'RMS' THEN pool := pool || ARRAY['CON-JZR-02', 'RET-JZR-01']; END IF;
    IF o.reg = 'JCB' THEN pool := pool || ARRAY['LV-JCB-01', 'CON-JCB-01']; END IF;
    IF o.reg = 'BNF' THEN pool := pool || ARRAY['CON-BNF-01', 'RET-BNF-01']; END IF;
    cursor_d := o.inicio;
    e := CASE WHEN o.perfil = 'CONC' THEN 999 WHEN o.perfil IN ('EXEC', 'PARA') THEN greatest(1, floor(o.frac * (SELECT max(nf) FROM _fr WHERE k = o.k))::int) ELSE 0 END;
    ultimo_exec := NULL;
    FOR fr IN SELECT * FROM _fr WHERE k = o.k ORDER BY f LOOP
      IF o.k = 24 THEN
        SELECT * INTO r FROM pg_temp.alocar(pool, o.inicio + 5, fr.dur, o.inicio + 40);
        UPDATE _fr SET estado = 'CANC', id_equipe = r.id_equipe, ini = r.ini, fim = r.fim WHERE k = o.k AND f = fr.f;
        EXIT;
      END IF;
      IF fr.f <= e THEN
        -- executada: precisa terminar antes de v_hoje
        SELECT * INTO r FROM pg_temp.alocar(pool, cursor_d, fr.dur, v_hoje - fr.dur - CASE WHEN o.perfil = 'CONC' THEN 2 ELSE 1 END);
        IF r.id_equipe IS NOT NULL THEN
          UPDATE _fr SET estado = 'EXEC', id_equipe = r.id_equipe, ini = r.ini, fim = r.fim WHERE k = o.k AND f = fr.f;
          cursor_d := r.fim + 1 + (abs(hashtext(o.id::text || fr.f)) % 3);
          ultimo_exec := r.fim;
          CONTINUE;
        END IF;
        IF o.perfil = 'CONC' THEN
          -- sem agenda livre antes de v_hoje: a obra concluída fica com o que coube
          CONTINUE;
        END IF;
        e := fr.f - 1;
      END IF;
      IF o.perfil = 'EXEC' AND fr.f = e + 1 THEN
        -- frente em andamento (v_hoje dentro do período), exceto as obras com prazo estourado: terminou ontem sem concluir
        IF o.k IN (3, 13) THEN
          SELECT * INTO r FROM pg_temp.alocar(pool, v_hoje - 3, 3, v_hoje - 3);
        ELSE
          SELECT * INTO r FROM pg_temp.alocar(pool, v_hoje - least(fr.dur - 1, 1), greatest(fr.dur, 2), v_hoje);
        END IF;
        IF r.id_equipe IS NOT NULL THEN
          UPDATE _fr SET estado = 'ATUAL', id_equipe = r.id_equipe, ini = r.ini, fim = r.fim, dur = r.fim - r.ini + 1 WHERE k = o.k AND f = fr.f;
          CONTINUE;
        END IF;
      END IF;
      IF o.perfil = 'PARA' AND fr.f = e + 1 THEN
        SELECT * INTO r FROM pg_temp.alocar(pool, greatest(coalesce(ultimo_exec, o.inicio) + 2, v_hoje - 14 - o.k % 5), fr.dur, v_hoje - 4);
        IF r.id_equipe IS NOT NULL THEN
          UPDATE _fr SET estado = 'ATRAS', id_equipe = r.id_equipe, ini = r.ini, fim = r.fim WHERE k = o.k AND f = fr.f;
        END IF;
        EXIT;
      END IF;
      IF o.perfil = 'EXEC' OR (o.perfil = 'FUT' AND fr.f <= 3) THEN
        SELECT * INTO r FROM pg_temp.alocar(pool, greatest(v_hoje + 1, CASE WHEN o.perfil = 'FUT' THEN o.inicio ELSE v_hoje + 1 + (fr.f - e - 1) * 2 END), fr.dur, v_hoje + 20);
        IF r.id_equipe IS NOT NULL THEN
          UPDATE _fr SET estado = 'FUT', id_equipe = r.id_equipe, ini = r.ini, fim = r.fim WHERE k = o.k AND f = fr.f;
        END IF;
        CONTINUE;
      END IF;
      EXIT;
    END LOOP;
  END LOOP;
END $$;

DELETE FROM _fr WHERE estado IS NULL;

-- Obras concluídas: data de conclusão = último dia de execução
UPDATE demo_seed_obra o SET fim_efetiva = x.fim FROM (SELECT k, max(fim) fim FROM _fr GROUP BY k) x WHERE x.k = o.k AND o.perfil = 'CONC';
UPDATE obras b SET data_fim_efetiva = o.fim_efetiva, data_previsao_fim = greatest(b.data_previsao_fim, o.fim_efetiva - 3)
  FROM demo_seed_obra o WHERE o.id = b.id AND o.perfil = 'CONC';
UPDATE historico_status_obras h SET data_criacao = (o.fim_efetiva::timestamp + interval '19 hours') AT TIME ZONE 'UTC'
  FROM demo_seed_obra o, status_obras s WHERE h.id_obra = o.id AND s.id = h.id_status_novo AND s.nome = 'CONCLUÍDA' AND o.perfil = 'CONC';
-- Início real da execução no histórico
UPDATE historico_status_obras h SET data_criacao = (x.ini::timestamp + interval '10 hours 20 minutes') AT TIME ZONE 'UTC'
  FROM (SELECT id_obra, min(ini) ini FROM _fr WHERE estado IN ('EXEC', 'ATUAL', 'ATRAS') GROUP BY id_obra) x, status_obras s
 WHERE h.id_obra = x.id_obra AND s.id = h.id_status_novo AND s.nome = 'EM EXECUÇÃO' AND h.id_status_anterior = (SELECT id FROM status_obras WHERE nome = 'PLANEJADA');

-- Metas mensais das equipes de Obras compatíveis com a produção diária de uma frente (boletim e linha do tempo)
UPDATE metas_faturamento_equipe m SET valor = CASE e.tipo WHEN 'CON' THEN 45000 WHEN 'RET' THEN 35000 ELSE 30000 END, data_ultima_alteracao = now(), usuario_ultima_alteracao = 'FBRAGA'
  FROM _eq e WHERE e.id = m.id_equipe AND m.ativo;

-- Programações -----------------------------------------------------------------------------------------
UPDATE _fr SET reprog = (abs(hashtext(id_prog::text)) % 100) < 22 WHERE estado IN ('EXEC', 'ATUAL', 'FUT', 'ATRAS');

CREATE TEMP TABLE _prog ON COMMIT DROP AS
SELECT f.*, o.tpl, o.numero numero_obra, e.cod cod_equipe, e.tipo tipo_equipe,
       least(now() - interval '2 hours', ((f.ini - 4 - abs(hashtext(f.id_prog::text)) % 6)::timestamp + interval '14 hours' + (abs(hashtext(f.id_prog::text)) % 180) * interval '1 minute') AT TIME ZONE 'UTC') criado,
       (SELECT string_agg(c, ', ') FROM (SELECT DISTINCT ka.codigo_kit c FROM kits_aplicados ka JOIN _p p ON p.id = ka.id_ponto WHERE p.k = f.k AND p.f = f.f ORDER BY 1 LIMIT 5) z) kits
  FROM _fr f JOIN demo_seed_obra o ON o.k = f.k JOIN _eq e ON e.id = f.id_equipe;

-- Cancelamentos antes da execução: a frente tinha sido programada para outra data e foi cancelada
CREATE TEMP TABLE _canc ON COMMIT DROP AS
SELECT gen_random_uuid() id, f.id_prog id_substituta, f.k, f.id_obra, f.id_equipe, f.ini - 9 ini, f.ini - 9 + f.dur - 1 fim, f.criado - interval '6 days' criado
  FROM _prog f WHERE f.estado IN ('EXEC', 'ATUAL') AND abs(hashtext(f.id_prog::text || 'c')) % 100 < 9;

CREATE TEMP TABLE _num ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY criado, id) numero FROM (SELECT id_prog id, criado FROM _prog UNION ALL SELECT id, criado FROM _canc) x;

INSERT INTO programacoes (id, numero, id_obra, id_equipe, data_inicio, data_fim, descricao, linha_viva, desligamento, finaliza_obra, turno,
                          situacao_intervencao, observacao, status, versao, data_criacao, data_ultima_alteracao, usuario_criacao, usuario_ultima_alteracao, ativo)
SELECT f.id_prog, n.numero, f.id_obra, f.id_equipe, f.ini, f.fim,
       'P' || f.pmin || CASE WHEN f.pmax <> f.pmin THEN ' a P' || f.pmax ELSE '' END || ' — ' || coalesce(f.kits, 'serviços do ponto'),
       f.tpl IN ('EQP', 'PREV') OR f.tipo_equipe = 'LV', f.deslig AND f.tpl NOT IN ('EQP', 'PREV'), f.f = f.nf,
       CASE WHEN f.dur = 1 AND f.n <= 2 THEN (ARRAY['MANHA', 'TARDE'])[1 + f.f % 2] ELSE 'DIA_TODO' END,
       CASE WHEN NOT f.deslig OR f.tpl IN ('EQP', 'PREV') THEN 'NAO_SE_APLICA' WHEN f.estado = 'FUT' AND f.f % 2 = 0 THEN 'PENDENTE' ELSE 'CRIADO' END,
       CASE abs(hashtext(f.id_prog::text)) % 7
         WHEN 0 THEN 'Levar kit de aterramento temporário e detector de tensão.'
         WHEN 1 THEN 'Solicitar a ordem de desligamento ao COD com 72 horas de antecedência.'
         WHEN 2 THEN 'Material separado no almoxarifado; retirar até as 7h.'
         WHEN 3 THEN 'Cliente avisado sobre a interrupção programada.' END,
       CASE WHEN f.estado = 'CANC' THEN 'CANCELADA' ELSE 'PROGRAMADA' END,
       0, f.criado, f.criado + interval '1 hour', CASE WHEN f.k % 2 = 0 THEN 'RTAVARES' ELSE 'CMENEZES' END, 'RTAVARES', true
  FROM _prog f JOIN _num n ON n.id = f.id_prog;

INSERT INTO programacoes (id, numero, id_obra, id_equipe, data_inicio, data_fim, descricao, linha_viva, desligamento, finaliza_obra, turno,
                          situacao_intervencao, observacao, status, versao, data_criacao, usuario_criacao, usuario_ultima_alteracao, ativo)
SELECT c.id, n.numero, c.id_obra, c.id_equipe, c.ini, c.fim, p.descricao, p.linha_viva, p.desligamento, false, p.turno, p.situacao_intervencao, NULL,
       'CANCELADA', 1, c.criado, 'RTAVARES', 'RTAVARES', true
  FROM _canc c JOIN programacoes p ON p.id = c.id_substituta JOIN _num n ON n.id = c.id;
SELECT setval('programacoes_numero_seq', (SELECT coalesce(max(numero), 0) + 1 FROM programacoes), false);

-- Itens programados (valor do serviço congelado pelo preço vigente no início)
CREATE TEMP TABLE _it ON COMMIT DROP AS
SELECT ip.id, ip.tipo, ip.quantidade_prevista qtd, ip.unidade, f.id_prog, f.k, f.f, f.estado, f.ini, f.fim, f.dur, f.id_equipe,
       coalesce(pp.i, greatest(pa.i, pb.i)) ponto_i,
       CASE WHEN ip.tipo = 'SERVICO' THEN av.valor_base END vu
  FROM itens_planejados ip
  JOIN kits_aplicados ka ON ka.id = ip.id_kit_aplicado
  LEFT JOIN pontos_planejamento pp0 ON pp0.id = ka.id_ponto
  LEFT JOIN vaos_planejamento v ON v.id = ka.id_vao
  LEFT JOIN _p pp ON pp.id = ka.id_ponto
  LEFT JOIN _p pa ON pa.id = v.id_ponto_a
  LEFT JOIN _p pb ON pb.id = v.id_ponto_b
  JOIN _fr f ON f.id_obra = ka.id_obra AND f.f = coalesce(pp.f, CASE WHEN pa.i > pb.i THEN pa.f ELSE pb.f END)
  LEFT JOIN acoes_valores av ON av.id_acao = ip.id_acao AND av.ativo;

INSERT INTO programacao_itens (id, id_programacao, id_item_planejado, quantidade, valor_unitario, valor_total, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), i.id_prog, i.id, i.qtd, i.vu, round(i.qtd * i.vu, 2), 0, p.data_criacao, p.usuario_criacao, i.estado <> 'CANC'
  FROM _it i JOIN programacoes p ON p.id = i.id_prog;
-- As canceladas antes da execução guardam os itens que tinham (inativos: voltaram a pendente e foram reprogramados)
INSERT INTO programacao_itens (id, id_programacao, id_item_planejado, quantidade, valor_unitario, valor_total, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), c.id, i.id, i.qtd, i.vu, round(i.qtd * i.vu, 2), 0, c.criado, 'RTAVARES', false
  FROM _canc c JOIN _it i ON i.id_prog = c.id_substituta;

-- Execução: cada ponto da frente num dia do período; frente atual executa até hoje e para no meio
ALTER TABLE _it ADD COLUMN dia date, ADD COLUMN qtd_exec numeric DEFAULT 0;
UPDATE _it i SET dia = i.ini + least(i.dur - 1, ((i.ponto_i - x.pmin) * i.dur) / greatest(x.n, 1))::int
  FROM _fr x WHERE x.id_prog = i.id_prog;
UPDATE _it SET qtd_exec = qtd WHERE estado = 'EXEC';
UPDATE _it i SET qtd_exec = CASE WHEN i.dia < (SELECT hoje FROM _cfg) THEN i.qtd
                                 WHEN i.dia = (SELECT hoje FROM _cfg) AND i.k NOT IN (3, 13) THEN
                                      CASE WHEN i.unidade = 'M' THEN round(i.qtd * 0.5, 4) WHEN abs(hashtext(i.id::text)) % 2 = 0 THEN i.qtd ELSE 0 END
                                 ELSE 0 END
 WHERE i.estado = 'ATUAL';
-- Nas obras com prazo estourado a última frente ficou pela metade
UPDATE _it i SET qtd_exec = CASE WHEN abs(hashtext(i.id::text)) % 3 = 0 THEN i.qtd WHEN i.unidade = 'M' AND abs(hashtext(i.id::text)) % 3 = 1 THEN round(i.qtd * 0.4, 4) ELSE 0 END
 WHERE i.estado = 'ATUAL' AND i.k IN (3, 13);
UPDATE _it SET dia = least(dia, (SELECT hoje FROM _cfg)) WHERE estado = 'ATUAL';
-- Vãos medidos em campo um pouco maiores que o projeto (excedente justificado)
ALTER TABLE _it ADD COLUMN excedente numeric DEFAULT 0;
UPDATE _it SET excedente = round(qtd * 0.06, 4), qtd_exec = round(qtd * 1.06, 4)
 WHERE estado = 'EXEC' AND unidade = 'M' AND tipo = 'SERVICO' AND abs(hashtext(id::text)) % 100 < 5;

UPDATE itens_planejados ip SET
  quantidade_executada = i.qtd_exec,
  status = CASE WHEN i.estado = 'CANC' THEN 'PENDENTE' WHEN i.qtd_exec >= i.qtd THEN 'CONCLUIDO' WHEN i.qtd_exec > 0 THEN 'EM_ANDAMENTO' ELSE 'PROGRAMADO' END,
  data_ultima_alteracao = CASE WHEN i.qtd_exec > 0 THEN (i.dia::timestamp + interval '15 hours') AT TIME ZONE 'UTC' END,
  usuario_ultima_alteracao = CASE WHEN i.qtd_exec > 0 THEN 'SYSTEM' END
  FROM _it i WHERE i.id = ip.id;

-- Turnos: um por equipe e dia com execução, mais os dias em que a equipe foi impedida
CREATE TEMP TABLE _dia ON COMMIT DROP AS
SELECT DISTINCT i.id_equipe, i.dia FROM _it i WHERE i.qtd_exec > 0
UNION
SELECT f.id_equipe, f.ini FROM _fr f WHERE f.estado = 'ATRAS'
UNION
SELECT f.id_equipe, d::date FROM _fr f, generate_series(f.ini, least(f.fim, (SELECT hoje FROM _cfg)), interval '1 day') d WHERE f.estado = 'ATUAL';

CREATE TEMP TABLE _tur ON COMMIT DROP AS
SELECT gen_random_uuid() id, d.id_equipe, d.dia,
       ((d.dia::timestamp + interval '7 hours' + (abs(hashtext(d.id_equipe::text || d.dia)) % 45) * interval '1 minute') AT TIME ZONE 'America/Sao_Paulo') abertura,
       CASE WHEN d.dia < (SELECT hoje FROM _cfg)
            THEN ((d.dia::timestamp + interval '16 hours 10 minutes' + (abs(hashtext(d.dia || d.id_equipe::text)) % 95) * interval '1 minute') AT TIME ZONE 'America/Sao_Paulo') END fechamento,
       abs(hashtext(d.id_equipe::text || d.dia || 'x')) % 100 sorte
  FROM _dia d;

INSERT INTO turnos (id, id_equipe, id_usuario_abertura, data_inicio, data_fim, status, id_veiculo, encerrado_automaticamente, motivo_encerramento, id_lider,
                    versao, data_criacao, data_ultima_alteracao, usuario_criacao, usuario_ultima_alteracao, ativo)
SELECT t.id, t.id_equipe, (SELECT id FROM usuarios WHERE login = 'USRADMIN'), t.abertura,
       CASE WHEN t.fechamento IS NULL THEN NULL WHEN t.sorte < 3 THEN t.fechamento + interval '35 minutes' ELSE t.fechamento END,
       CASE WHEN t.fechamento IS NULL THEN 'ABERTO' ELSE 'FECHADO' END,
       coalesce(e.id_veiculo, (SELECT id FROM veiculos WHERE ativo ORDER BY placa LIMIT 1)),
       t.fechamento IS NOT NULL AND t.sorte < 3,
       CASE WHEN t.fechamento IS NOT NULL AND t.sorte < 3 THEN 'Turno não encerrado pela equipe. Encerrado automaticamente no corte das 22:00; o fim foi ajustado para o último lançamento ('
            || to_char((t.fechamento + interval '35 minutes') AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ').' END,
       e.id_lider, 0, t.abertura, coalesce(t.fechamento, t.abertura), e.cod, e.cod, true
  FROM _tur t JOIN _eq e ON e.id = t.id_equipe;

INSERT INTO turno_membros (id_turno, id_colaborador)
SELECT t.id, m.id_colaborador FROM _tur t JOIN equipe_membros m ON m.id_equipe = t.id_equipe AND m.data_saida IS NULL
 WHERE NOT (t.sorte BETWEEN 40 AND 47 AND m.id_colaborador <> (SELECT id_lider FROM _eq WHERE id = t.id_equipe)
            AND m.id_colaborador = (SELECT min(m2.id_colaborador::text)::uuid FROM equipe_membros m2 WHERE m2.id_equipe = t.id_equipe AND m2.id_colaborador <> (SELECT id_lider FROM _eq WHERE id = t.id_equipe)));
-- Folga coberta por colaborador de outra equipe
INSERT INTO turno_substitutos (id_turno, id_colaborador)
SELECT t.id, (SELECT m.id_colaborador FROM equipe_membros m WHERE m.id_equipe <> t.id_equipe AND m.data_saida IS NULL ORDER BY md5(m.id::text || t.id::text) LIMIT 1)
  FROM _tur t WHERE t.sorte BETWEEN 40 AND 44;
INSERT INTO turno_membros (id_turno, id_colaborador) SELECT s.id_turno, s.id_colaborador FROM turno_substitutos s JOIN _tur t ON t.id = s.id_turno
 ON CONFLICT DO NOTHING;

-- Atividades do turno (obra/programação trabalhada no dia)
CREATE TEMP TABLE _tp ON COMMIT DROP AS
SELECT DISTINCT t.id id_turno, t.dia, t.abertura, t.fechamento, f.id_obra, f.id_prog, f.estado, f.k
  FROM _tur t JOIN _fr f ON f.id_equipe = t.id_equipe AND t.dia BETWEEN f.ini AND f.fim AND f.estado IN ('EXEC', 'ATUAL', 'ATRAS');
INSERT INTO turno_atividades (id, id_turno, id_obra, id_programacao, observacao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), tp.id_turno, tp.id_obra, tp.id_prog,
       CASE WHEN tp.estado = 'ATRAS' THEN 'Equipe mobilizada, serviço não iniciado.' END, 0, tp.abertura + interval '25 minutes', 'APP', true
  FROM _tp tp;

-- APR por programação e dia (concluída antes de começar; hoje algumas ainda em preenchimento)
INSERT INTO turno_aprs (id, id_turno, id_obra, atividade, id_responsavel, status, data_conclusao, formulario, id_programacao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), tp.id_turno, tp.id_obra,
       (ARRAY['Implantação de postes e montagem de estruturas', 'Lançamento e regulação de condutores', 'Instalação de transformador e proteção',
              'Substituição de poste em rede desenergizada', 'Poda e manutenção em rede energizada'])[1 + abs(hashtext(tp.id_prog::text)) % 5],
       e.id_lider,
       CASE WHEN tp.dia = (SELECT hoje FROM _cfg) AND abs(hashtext(tp.id_turno::text)) % 3 = 0 THEN 'RASCUNHO' ELSE 'CONCLUIDA' END,
       CASE WHEN tp.dia = (SELECT hoje FROM _cfg) AND abs(hashtext(tp.id_turno::text)) % 3 = 0 THEN NULL ELSE tp.abertura + interval '38 minutes' END,
       jsonb_build_object(
         'local', 'Obra ' || o.numero || ' - ' || o.titulo,
         'riscos', to_jsonb(ARRAY['Choque elétrico', 'Queda de altura', 'Queda de materiais', 'Tráfego de veículos', 'Animais peçonhentos']),
         'outroRisco', CASE WHEN abs(hashtext(tp.id_turno::text)) % 4 = 0 THEN 'Solo irregular com pedras soltas' END,
         'medidas', to_jsonb(ARRAY['Bloqueio e sinalização da área', 'Aterramento temporário', 'Uso de cinto e talabarte', 'Isolamento com coberturas', 'EPI completo e inspecionado']),
         'medidasAdicionais', 'DDS realizado com toda a equipe antes do início.',
         'verificacoes', jsonb_build_array(
            jsonb_build_object('pergunta', 'Ferramentas e EPIs inspecionados?', 'resposta', 'SIM'),
            jsonb_build_object('pergunta', 'Ordem de desligamento confirmada com o COD?', 'resposta', CASE WHEN p.desligamento THEN 'SIM' ELSE 'NAO_SE_APLICA' END),
            jsonb_build_object('pergunta', 'Área sinalizada e isolada?', 'resposta', 'SIM'),
            jsonb_build_object('pergunta', 'Equipe ciente dos riscos e das medidas?', 'resposta', 'SIM')),
         'idsParticipantes', (SELECT to_jsonb(array_agg(tm.id_colaborador)) FROM turno_membros tm WHERE tm.id_turno = tp.id_turno)),
       tp.id_prog, 0, tp.abertura + interval '12 minutes', 'APP', true
  FROM _tp tp JOIN _tur t ON t.id = tp.id_turno JOIN _eq e ON e.id = t.id_equipe JOIN obras o ON o.id = tp.id_obra JOIN programacoes p ON p.id = tp.id_prog
 WHERE tp.estado <> 'ATRAS' OR abs(hashtext(tp.id_turno::text)) % 2 = 0;

-- Ocorrências: impedimentos nas frentes atrasadas e registros pontuais nos demais turnos
INSERT INTO turno_ocorrencias (id, id_turno, id_obra, tipo, descricao, impede_execucao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), tp.id_turno, tp.id_obra, x.tipo, x.descr, true, 0, tp.abertura + interval '2 hours', 'APP', true
  FROM _tp tp JOIN demo_seed_obra o ON o.id = tp.id_obra
  CROSS JOIN LATERAL (SELECT CASE o.k WHEN 5 THEN 'DESLIGAMENTO' WHEN 18 THEN 'MATERIAL' WHEN 30 THEN 'TERCEIROS' WHEN 40 THEN 'ACESSO' ELSE 'CLIMA' END tipo,
                             CASE o.k WHEN 5 THEN 'COD não autorizou o desligamento do trecho; manobra remarcada pela distribuidora.'
                                      WHEN 18 THEN 'Transformadores de 10 kVA não chegaram ao almoxarifado; equipe sem material para seguir.'
                                      WHEN 30 THEN 'Fiscalização municipal bloqueou a via central por causa dos festejos.'
                                      WHEN 40 THEN 'Proprietário não liberou a passagem pela fazenda; aguardando autorização ambiental.'
                                      ELSE 'Riacho transbordou e a estrada de acesso ficou intransitável.' END descr) x
 WHERE tp.estado = 'ATRAS';

INSERT INTO turno_ocorrencias (id, id_turno, id_obra, tipo, descricao, impede_execucao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), t.id, (SELECT tp.id_obra FROM _tp tp WHERE tp.id_turno = t.id LIMIT 1), x.tipo, x.descr, false, 0, t.abertura + interval '5 hours', 'APP', true
  FROM _tur t
  CROSS JOIN LATERAL (SELECT (ARRAY['CLIMA', 'EQUIPAMENTO', 'MATERIAL', 'ACESSO', 'SEGURANCA', 'TERCEIROS', 'OUTROS'])[1 + t.sorte % 7] tipo,
                             (ARRAY['Chuva forte das 14h às 15h; serviço parado por segurança e retomado em seguida.',
                                    'Guindauto com vazamento hidráulico; içamento feito com apoio da equipe vizinha.',
                                    'Faltaram 4 conectores perfurantes na entrega; completados com estoque da viatura.',
                                    'Porteira da propriedade trancada; acesso liberado pelo caseiro às 9h.',
                                    'Cliente se aproximou da área isolada; orientado e área reforçada com cones.',
                                    'Operadora de telecom com cabo no mesmo poste; equipe aguardou a retirada.',
                                    'Fiscal da distribuidora acompanhou a execução e aprovou os pontos.'])[1 + t.sorte % 7] descr) x
 WHERE t.sorte BETWEEN 10 AND 24 AND EXISTS (SELECT 1 FROM _tp tp WHERE tp.id_turno = t.id AND tp.estado <> 'ATRAS');

-- Relatório de fim de turno (alguns ficaram sem relatório)
INSERT INTO turno_relatorios (id, id_turno, observacao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), t.id,
       (ARRAY['Frente executada conforme programado. Pontos conferidos com o projeto e área limpa ao final.',
              'Postes implantados e estruturas montadas. Condutor lançado e regulado no trecho previsto.',
              'Serviço concluído sem intercorrências. Material excedente devolvido à base.',
              'Execução dentro do previsto; fiscal acompanhou parte do serviço e não fez apontamentos.',
              'Rede energizada após liberação do COD. Clientes do trecho avisados.',
              'Dia produtivo; restante da frente fica para amanhã cedo.'])[1 + t.sorte % 6],
       0, t.fechamento - interval '15 minutes', 'APP', true
  FROM _tur t WHERE t.fechamento IS NOT NULL AND t.sorte >= 8 AND EXISTS (SELECT 1 FROM _tp tp WHERE tp.id_turno = t.id AND tp.estado <> 'ATRAS');
INSERT INTO turno_relatorios (id, id_turno, observacao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), t.id, 'Equipe deslocada até a obra, mas o serviço não pôde ser iniciado. Retorno à base às 11h.', 0, t.fechamento - interval '10 minutes', 'APP', true
  FROM _tur t WHERE t.fechamento IS NOT NULL AND NOT EXISTS (SELECT 1 FROM turno_relatorios r WHERE r.id_turno = t.id)
   AND EXISTS (SELECT 1 FROM _tp tp WHERE tp.id_turno = t.id AND tp.estado = 'ATRAS');

-- Apontamentos (realizado), com o valor congelado da programação
INSERT INTO apontamentos_execucao (id, id_item_planejado, id_programacao, id_obra, id_equipe, id_turno, data, quantidade, excedente, valor_total, justificativa,
                                   versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), i.id, i.id_prog, f.id_obra, i.id_equipe, t.id, i.dia, i.qtd_exec, i.excedente,
       CASE WHEN i.vu IS NOT NULL THEN round(i.qtd_exec * i.vu, 2) END,
       CASE WHEN i.excedente > 0 THEN 'Vão medido em campo maior que o do projeto; diferença registrada com o fiscal.' END,
       0, least(now(), t.abertura + interval '3 hours' + (abs(hashtext(i.id::text)) % 300) * interval '1 minute'),
       (SELECT cod FROM _eq WHERE id = i.id_equipe), true
  FROM _it i JOIN _fr f ON f.id_prog = i.id_prog JOIN _tur t ON t.id_equipe = i.id_equipe AND t.dia = i.dia
 WHERE i.qtd_exec > 0;

-- Histórico das programações: reprogramações, edições e cancelamentos -------------------------------------
INSERT INTO eventos_programacao (id, id_programacao, numero_programacao, id_obra, numero_obra, tipo, id_equipe_origem, equipe_origem, id_equipe_destino, equipe_destino,
                                 inicio_original, fim_original, inicio_novo, fim_novo, observacao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), p.id, p.numero, p.id_obra, f.numero_obra, 'REPROGRAMADA',
       coalesce(eo.id, p.id_equipe), coalesce(eo.cod, f.cod_equipe), p.id_equipe, f.cod_equipe,
       p.data_inicio - x.desloc, p.data_fim - x.desloc, p.data_inicio, p.data_fim,
       (ARRAY['Chuva forte prevista para o período; frente remarcada.', 'Desligamento negado pelo COD na data original.',
              'Equipe deslocada para atendimento emergencial.', 'Material não entregue a tempo pelo almoxarifado.',
              'Remanejamento de equipe para equilibrar a carteira da base.', 'Fiscal da distribuidora indisponível na data original.'])[1 + abs(hashtext(p.id::text)) % 6],
       0, least(now() - interval '1 hour', greatest(p.data_criacao + interval '3 hours', (p.data_inicio - x.desloc - 1)::timestamp AT TIME ZONE 'America/Sao_Paulo' + interval '16 hours')),
       (ARRAY['RTAVARES', 'RTAVARES', 'CMENEZES', 'MALIMA'])[1 + abs(hashtext(p.id::text)) % 4], true
  FROM _prog f JOIN programacoes p ON p.id = f.id_prog
  CROSS JOIN LATERAL (SELECT (2 + abs(hashtext(p.id::text)) % 6) desloc) x
  LEFT JOIN LATERAL (SELECT e.id, e.cod FROM _eq e WHERE e.reg = (SELECT reg FROM _eq WHERE id = p.id_equipe) AND e.id <> p.id_equipe
                      AND abs(hashtext(p.id::text)) % 3 = 0 ORDER BY e.cod LIMIT 1) eo ON true
 WHERE f.reprog;

INSERT INTO eventos_programacao (id, id_programacao, numero_programacao, id_obra, numero_obra, tipo, id_equipe_origem, equipe_origem, id_equipe_destino, equipe_destino,
                                 inicio_original, fim_original, inicio_novo, fim_novo, observacao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), p.id, p.numero, p.id_obra, f.numero_obra, 'EDITADA', p.id_equipe, f.cod_equipe, p.id_equipe, f.cod_equipe,
       p.data_inicio, p.data_fim, p.data_inicio, p.data_fim,
       CASE WHEN abs(hashtext(p.id::text || 'e')) % 3 = 0 AND p.observacao IS NOT NULL THEN 'Observação: vazio → ' || p.observacao
            WHEN abs(hashtext(p.id::text || 'e')) % 3 = 1 AND p.situacao_intervencao = 'CRIADO' THEN 'Situação da intervenção: Pendente → Criado'
            WHEN p.turno = 'DIA_TODO' THEN 'Turno: Manhã → Dia todo'
            WHEN p.turno = 'MANHA' THEN 'Turno: Dia todo → Manhã'
            ELSE 'Turno: Dia todo → Tarde' END,
       0, least(now() - interval '30 minutes', p.data_criacao + interval '1 day 2 hours'), 'RTAVARES', true
  FROM _prog f JOIN programacoes p ON p.id = f.id_prog
 WHERE abs(hashtext(p.id::text || 'e')) % 100 < 14 AND f.estado <> 'CANC';

INSERT INTO eventos_programacao (id, id_programacao, numero_programacao, id_obra, numero_obra, tipo, id_equipe_origem, equipe_origem, id_equipe_destino, equipe_destino,
                                 inicio_original, fim_original, inicio_novo, fim_novo, observacao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), p.id, p.numero, p.id_obra, o.numero, 'CANCELADA', p.id_equipe, e.cod, p.id_equipe, e.cod, p.data_inicio, p.data_fim, p.data_inicio, p.data_fim,
       CASE WHEN c.id IS NULL THEN 'Obra cancelada pela distribuidora.'
            ELSE (ARRAY['Desligamento não confirmado pelo COD; frente será reprogramada.', 'Cliente solicitou adiamento por evento na propriedade.',
                        'Prioridade para obra urgente da base; frente reprogramada.'])[1 + abs(hashtext(p.id::text)) % 3] END,
       0, least(now() - interval '1 hour', (p.data_inicio - 1)::timestamp AT TIME ZONE 'America/Sao_Paulo' + interval '17 hours'), 'RTAVARES', true
  FROM programacoes p JOIN obras o ON o.id = p.id_obra JOIN _eq e ON e.id = p.id_equipe LEFT JOIN _canc c ON c.id = p.id
 WHERE p.status = 'CANCELADA';

-- Equipes vinculadas às obras (as que receberam programação)
INSERT INTO obras_equipes (id_obra, id_equipe)
SELECT DISTINCT id_obra, id_equipe FROM programacoes WHERE id_obra IN (SELECT id FROM demo_seed_obra) ON CONFLICT DO NOTHING;

-- Telemetria da frota para os turnos novos (mesma regra do 13_frota_complementos)
INSERT INTO frota_telemetria_turnos (id_turno, id_veiculo, id_equipe, id_base_operacional, inicio, fim, com_telemetria, km, minutos_movimento, minutos_parado_servico,
  minutos_parado_base, minutos_parado_sem_servico, minutos_ligado_parado, saida_base_em, chegada_base_em, notas, valor_faturado, notas_no_local, notas_fora_local, notas_sem_dado, calculado_em)
SELECT t.id, t.id_veiculo, t.id_equipe, e.id_base_operacional, t.data_inicio, coalesce(t.data_fim, t.data_inicio + interval '9 hours'), true,
  round((40 + random() * 140)::numeric, 1), 120 + floor(random() * 120), 150 + floor(random() * 120), 25 + floor(random() * 30),
  floor(random() * 50), 10 + floor(random() * 40), t.data_inicio + interval '25 minutes', coalesce(t.data_fim, t.data_inicio + interval '9 hours') - interval '20 minutes',
  0, 0, 0, 0, 0, now()
  FROM turnos t JOIN equipes e ON e.id = t.id_equipe
 WHERE t.id IN (SELECT id FROM _tur) AND t.status = 'FECHADO' AND t.id_veiculo IS NOT NULL
ON CONFLICT DO NOTHING;
COMMIT;
