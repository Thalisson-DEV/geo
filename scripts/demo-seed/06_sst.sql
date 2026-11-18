BEGIN;
WITH f AS (SELECT id FROM formularios_inspecao WHERE ativo ORDER BY data_criacao LIMIT 1),
ti AS (SELECT array_agg(id) a FROM tipos_inspecao),
eq AS (SELECT array_agg(id) a, array_agg(id_base_operacional) b FROM equipes WHERE id_base_operacional IS NOT NULL),
v AS (SELECT array_agg(id) a FROM veiculos),
p AS (SELECT array_agg(id) a FROM processos_negocio),
u AS (SELECT id FROM usuarios WHERE login='USRADMIN')
INSERT INTO inspecoes_seguranca (id, id_formulario, id_processo, id_inspetor, id_veiculo, id_equipe, data_realizacao, status, observacoes, latitude, longitude, id_base_operacional, id_tipo_inspecao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), f.id, p.a[1+gs%array_length(p.a,1)], u.id, v.a[1+gs%array_length(v.a,1)], eq.a[1+gs%array_length(eq.a,1)],
 now()-((gs*2.9)||' days')::interval, CASE WHEN gs%11=0 THEN 'CANCELADA' WHEN gs<3 THEN 'EM_ANDAMENTO' ELSE 'CONCLUIDA' END,
 (ARRAY['Equipe em conformidade com uso de EPI e sinalização','Viatura com extintor vencido','Aterramento temporário instalado corretamente','Cone de sinalização insuficiente na via'])[1+gs%4],
 -9.4-random()*2.0, -40.5+random()*0.9, eq.b[1+gs%array_length(eq.a,1)], ti.a[1+gs%array_length(ti.a,1)], 0, now()-((gs*2.9)||' days')::interval, 'USRADMIN', true
FROM generate_series(1,45) gs, f, ti, eq, v, p, u;

INSERT INTO desvios_seguranca (id, id_inspecao, id_pergunta, gravidade, descricao, acao_corretiva, prazo, status, versao, data_criacao, usuario_criacao, ativo, data_resolucao)
SELECT gen_random_uuid(), i.id, (SELECT pq.id FROM perguntas_inspecao pq JOIN grupos_pergunta gp ON gp.id=pq.id_grupo WHERE gp.id_formulario=i.id_formulario ORDER BY md5(pq.id::text||i.id::text) LIMIT 1),
 (ARRAY['BAIXA','MEDIA','ALTA','CRITICA'])[1+(rn%4)],
 (ARRAY['Extintor da viatura com carga vencida','Colaborador sem óculos de proteção','Sinalização de via incompleta','Luva isolante sem ensaio dielétrico válido','Escada sem amarração no poste'])[1+(rn%5)],
 (ARRAY['Substituir extintor na base','Orientação imediata e reciclagem de NR-10','Reforçar kit de sinalização da equipe','Encaminhar luvas para ensaio','DDS sobre trabalho em altura'])[1+(rn%5)],
 (i.data_realizacao + interval '10 days')::date,
 CASE WHEN rn%3=0 THEN 'RESOLVIDO' WHEN rn%3=1 THEN 'ABERTO' ELSE 'EM_TRATAMENTO' END, 0, i.data_realizacao, 'USRADMIN', true,
 CASE WHEN rn%3=0 THEN i.data_realizacao + interval '6 days' END
FROM (SELECT i.*, row_number() over (order by data_realizacao) rn FROM inspecoes_seguranca i WHERE status='CONCLUIDA' AND usuario_criacao='USRADMIN') i WHERE rn%2=0;

WITH a AS (SELECT id, nome, row_number() over () rn FROM atividades_sst WHERE ativo),
cl AS (SELECT array_agg(id) a FROM catalogos_sst WHERE tipo='CLASSIFICACAO_EVENTO'),
ll AS (SELECT array_agg(id) a FROM catalogos_sst WHERE tipo='LOCAL_LESAO'),
nl AS (SELECT array_agg(id) a FROM catalogos_sst WHERE tipo='NATUREZA_LESAO'),
ag AS (SELECT array_agg(id) a FROM catalogos_sst WHERE tipo='AGENTE_CAUSADOR'),
eq AS (SELECT e.id, e.cod_equipe, e.id_base_operacional, b.nome bnome, row_number() over () rn FROM equipes e JOIN bases_operacionais b ON b.id=e.id_base_operacional),
eqc AS (SELECT count(*) n FROM eq),
c AS (SELECT id, nome_completo FROM colaboradores LIMIT 1),
g AS (SELECT gs n, (ARRAY['INCIDENTE_SEM_LESAO','DANO_MATERIAL','ACIDENTE_TIPICO','INCIDENTE_SEM_LESAO','ACIDENTE_TRAJETO','DANO_MATERIAL'])[1+gs%6] tp,
  (ARRAY['REGISTRADO','EM_TRATATIVA','CONCLUIDO','CONCLUIDO'])[1+gs%4] st, now()-((gs*9)||' days')::interval dt FROM generate_series(1,14) gs)
INSERT INTO eventos_sst (id, numero_registro, tipo, status, data_ocorrencia, data_comunicacao, id_atividade, atividade_nome, id_gestor, gestor_nome, gestor_funcao, gestor_substituto,
 id_base_operacional, base_nome, id_equipe, equipe_codigo, id_classificacao, id_local_lesao, id_natureza_lesao, id_agente_causador, telemetria, filmagem, local_ocorrencia,
 latitude, longitude, descricao, dias_perdidos, possui_cat, tratativa, data_conclusao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), 'EV-'||to_char(g.dt,'YYYY')||'-'||lpad(g.n::text,4,'0'), g.tp, g.st, g.dt, g.dt+interval '3 hours', a.id, a.nome, c.id, c.nome_completo, 'Supervisor', false,
 eq.id_base_operacional, eq.bnome, eq.id, eq.cod_equipe, cl.a[1+g.n%array_length(cl.a,1)],
 CASE WHEN g.tp LIKE 'ACIDENTE%' THEN ll.a[1+g.n%array_length(ll.a,1)] END, CASE WHEN g.tp LIKE 'ACIDENTE%' THEN nl.a[1+g.n%array_length(nl.a,1)] END,
 ag.a[1+g.n%array_length(ag.a,1)], (ARRAY['SIM','NAO','NAO_APLICAVEL'])[1+g.n%3], (ARRAY['NAO','SIM','NAO_APLICAVEL'])[1+g.n%3],
 (ARRAY['Zona rural de Juazeiro','BR-407, km 12','Centro de Jacobina','Pátio da base de Senhor do Bonfim','Povoado em Remanso'])[1+g.n%5],
 -9.4-random()*2, -40.5+random()*0.9,
 (ARRAY['Colaborador sofreu corte superficial na mão ao manusear conector','Viatura colidiu com mourão ao manobrar em estrada vicinal','Queda de ferramenta do cesto aéreo sem atingir pessoas','Colaborador torceu o tornozelo ao descer de barranco','Retrovisor danificado em via estreita'])[1+g.n%5],
 CASE WHEN g.tp LIKE 'ACIDENTE%' THEN g.n%3 END, g.tp LIKE 'ACIDENTE%',
 CASE WHEN g.st IN ('EM_TRATATIVA','CONCLUIDO') THEN 'Análise de causa realizada e DDS aplicado com a equipe.' END,
 CASE WHEN g.st='CONCLUIDO' THEN g.dt+interval '7 days' END, 0, g.dt, 'USRADMIN', true
FROM g JOIN a ON a.rn=1+g.n, eqc, cl, ll, nl, ag, c, eq
WHERE eq.rn = 1+(g.n % eqc.n);
COMMIT;
