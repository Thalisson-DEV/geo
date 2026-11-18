BEGIN;
WITH t AS (SELECT id, id_equipe_padrao, sla_primeira_resposta_horas sr, sla_resolucao_horas sl, prazo_reabertura_horas pr, pausar_sla_aguardando_solicitante ps, row_number() over (order by ordem_exibicao) rn, count(*) over () tot FROM topicos_chamado WHERE ativo),
u AS (SELECT id FROM usuarios WHERE login='USRADMIN'),
g AS (SELECT gs n, (ARRAY['ABERTO','EM_ATENDIMENTO','RESOLVIDO','FECHADO','FECHADO','AGUARDANDO_SOLICITANTE','RESOLVIDO','CANCELADO'])[1+gs%8] st,
   now()-((gs*3.7)||' days')::interval - ((gs*7)%24||' hours')::interval dt FROM generate_series(1,28) gs)
INSERT INTO chamados (id, protocolo, id_topico, assunto, descricao, prioridade, status, usuario_solicitante_id, usuario_responsavel_id, solucao, data_abertura,
 data_inicio_atendimento, data_resolucao, data_fechamento, versao, data_criacao, usuario_criacao, ativo, id_equipe_atendimento, data_limite_primeira_resposta,
 data_limite_resolucao, pausar_sla_aguardando_solicitante, prazo_reabertura_horas, data_primeira_resposta, total_segundos_pausa_sla, data_ultima_interacao)
SELECT gen_random_uuid(), 'CH-'||to_char(g.dt,'YYYYMM')||'-'||lpad((1000+g.n)::text,5,'0'), t.id,
 (ARRAY['Erro ao sincronizar app da equipe','Solicitação de acesso ao módulo de estoque','Relatório de faturamento não carrega','Ajuste de cadastro de colaborador','Impressora da base sem conexão','Senha bloqueada após tentativas','Divergência de saldo no estoque','Inclusão de novo veículo na equipe'])[1+g.n%8],
 'Ocorrência registrada pela base operacional. Favor verificar e retornar com orientação.',
 (ARRAY['BAIXA','NORMAL','ALTA','CRITICA','NORMAL'])[1+g.n%5], g.st, u.id,
 CASE WHEN g.st<>'ABERTO' THEN u.id END,
 CASE WHEN g.st IN ('RESOLVIDO','FECHADO') THEN 'Ajuste aplicado e validado com o solicitante.' END,
 g.dt, CASE WHEN g.st<>'ABERTO' THEN g.dt+interval '2 hours' END,
 CASE WHEN g.st IN ('RESOLVIDO','FECHADO') THEN g.dt+interval '20 hours' END,
 CASE WHEN g.st IN ('FECHADO','CANCELADO') THEN g.dt+interval '30 hours' END,
 0, g.dt, 'USRADMIN', true, t.id_equipe_padrao, g.dt+(t.sr||' hours')::interval, g.dt+(t.sl||' hours')::interval, t.ps, t.pr,
 CASE WHEN g.st<>'ABERTO' THEN g.dt+interval '2 hours' END, 0, g.dt+interval '3 hours'
FROM g JOIN t ON t.rn = 1+(g.n % t.tot), u;

WITH u AS (SELECT id FROM usuarios WHERE login='USRADMIN'),
g AS (SELECT gs n, now()-((gs*19)||' hours')::interval dt FROM generate_series(1,24) gs)
INSERT INTO notificacoes (id, id_usuario, origem, categoria, prioridade, titulo, corpo, deeplink, chave_idempotencia, lida_em, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), u.id, (ARRAY['REGRA','SISTEMA','AUTOMACAO','REGRA'])[1+g.n%4],
 (ARRAY['APROVACAO','SEGURANCA','OPERACIONAL','CHAMADO','APROVACAO','SISTEMA'])[1+g.n%6],
 (ARRAY['NORMAL','ALTA','BAIXA','CRITICA','NORMAL'])[1+g.n%5],
 (ARRAY['Solicitação de pagamento aguardando aprovação','Desvio de segurança com prazo vencendo','Meta de faturamento da equipe atingida','Chamado atualizado pelo suporte','Desconto aguardando validação','Backup diário concluído'])[1+g.n%6],
 (ARRAY['Há uma solicitação de pagamento pendente da sua decisão.','Um desvio grave vence em 2 dias na base de Jacobina.','A equipe atingiu 100% da meta mensal.','O suporte respondeu ao seu chamado.','Um desconto em folha foi registrado e aguarda validação.','A rotina noturna terminou sem erros.'])[1+g.n%6],
 (ARRAY['/financeiro','/sst','/execucao','/chamados','/descontos','/'])[1+g.n%6],
 'seed-notif-'||g.n, CASE WHEN g.n>6 THEN g.dt+interval '1 hour' END, 0, g.dt, 'SISTEMA', true
FROM g, u
ON CONFLICT DO NOTHING;
COMMIT;
