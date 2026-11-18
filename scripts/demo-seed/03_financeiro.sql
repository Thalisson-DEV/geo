BEGIN;
-- Solicitações de compra
WITH f AS (SELECT id, nome_fantasia, razao_social, row_number() over (order by nome_fantasia) rn FROM financeiro_fornecedor WHERE ativo LIMIT 40),
b AS (SELECT array_agg(id) a FROM bases_operacionais WHERE nome<>'BASE TESTE'),
p AS (SELECT array_agg(id) a FROM processos_negocio),
c AS (SELECT array_agg(id) a FROM colaboradores),
u AS (SELECT id FROM usuarios WHERE login='USRADMIN'),
g AS (SELECT gs n, (ARRAY['SOLICITADO','APROVADO','APROVADO','REJEITADO','CANCELADO','RASCUNHO','APROVADO','SOLICITADO'])[1+gs%8] st,
  round((150+random()*9000)::numeric,2) val, now()-((2+gs*4)||' days')::interval dt FROM generate_series(1,25) gs)
INSERT INTO financeiro_solicitacao_compra (id, formulario_id, solicitante_colaborador_id, base_id, processo_id, fornecedor_id, fornecedor_nome, fornecedor_razao_social,
 valor, quantidade, prioridade, local_aquisicao, forma_pagamento, quantidade_parcelas, vencimento, tem_nf, descricao, status, usuario_solicitante_id,
 data_submissao, usuario_decisao_id, data_decisao, valor_aprovado, observacao_decisao, motivo_rejeicao, usuario_cancelamento_id, data_cancelamento, motivo_cancelamento,
 versao, data_criacao, usuario_criacao, ativo, fornecedor_ordenacao)
SELECT gen_random_uuid(), 'cf186b73-fe24-42b7-987b-836b9cfc5f8a', c.a[1+g.n%array_length(c.a,1)], b.a[1+g.n%array_length(b.a,1)], p.a[1+g.n%array_length(p.a,1)],
 f.id, f.nome_fantasia, f.razao_social, g.val, 1+g.n%10,
 (ARRAY['BAIXA','NORMAL','ALTA','URGENTE'])[1+g.n%4], (ARRAY['LOCAL','CENTRAL'])[1+g.n%2],
 (ARRAY['PIX_TRANSFERENCIA','BOLETO','CARTAO_CREDITO'])[1+g.n%3], 1, (g.dt+interval '20 days')::date, g.n%3<>0,
 (ARRAY['Aquisição de cabos de cobre 16mm para manutenção de rede','Compra de luvas isolantes classe 2','Reposição de cruzetas de concreto','Ferramentas manuais para equipe de linha viva','Pneus para caminhão cesto aéreo','Material de escritório da base','Conectores perfurantes para ramal','Uniformes antichama'])[1+g.n%8],
 g.st, u.id, CASE WHEN g.st<>'RASCUNHO' THEN g.dt END,
 CASE WHEN g.st IN ('APROVADO','REJEITADO') THEN u.id END, CASE WHEN g.st IN ('APROVADO','REJEITADO') THEN g.dt+interval '1 day' END,
 CASE WHEN g.st='APROVADO' THEN g.val END, CASE WHEN g.st='APROVADO' THEN 'Aprovado conforme orçamento do mês' END,
 CASE WHEN g.st='REJEITADO' THEN 'Cotação acima da média dos fornecedores homologados' END,
 CASE WHEN g.st='CANCELADO' THEN u.id END, CASE WHEN g.st='CANCELADO' THEN g.dt+interval '2 days' END, CASE WHEN g.st='CANCELADO' THEN 'Material recebido por transferência entre bases' END,
 0, g.dt, 'USRADMIN', true, upper(f.nome_fantasia)
FROM g JOIN f ON f.rn=g.n, b, p, c, u;

-- Solicitações de pagamento
WITH f AS (SELECT id, nome_fantasia, razao_social, row_number() over (order by razao_social) rn FROM financeiro_fornecedor WHERE ativo LIMIT 40),
b AS (SELECT array_agg(id) a FROM bases_operacionais WHERE nome<>'BASE TESTE'),
p AS (SELECT array_agg(id) a FROM processos_negocio),
c AS (SELECT array_agg(id) a FROM colaboradores),
v AS (SELECT array_agg(id) a FROM veiculos),
u AS (SELECT id FROM usuarios WHERE login='USRADMIN'),
g AS (SELECT gs n, (ARRAY['SOLICITADO','APROVADO','APROVADO','REJEITADO','APROVADO','CANCELADO','SOLICITADO','APROVADO','RASCUNHO'])[1+gs%9] st,
  round((90+random()*6500)::numeric,2) val, now()-((1+gs*3)||' days')::interval dt FROM generate_series(1,35) gs)
INSERT INTO financeiro_solicitacao_pagamento (id, formulario_id, solicitante_colaborador_id, base_id, processo_id, fornecedor_id, fornecedor_nome, fornecedor_razao_social,
 valor, quantidade, prioridade, local_aquisicao, forma_pagamento, quantidade_parcelas, vencimento, tem_nf, numero_nf, justificativa_sem_nf, descricao, veiculo_id, status, usuario_solicitante_id,
 data_submissao, usuario_decisao_id, data_decisao, valor_aprovado, observacao_decisao, motivo_rejeicao, usuario_cancelamento_id, data_cancelamento, motivo_cancelamento,
 versao, data_criacao, usuario_criacao, ativo, fornecedor_ordenacao)
SELECT gen_random_uuid(), 'aee4b9c0-ec6c-42ce-b75b-2aca7949ad16', c.a[1+g.n%array_length(c.a,1)], b.a[1+g.n%array_length(b.a,1)], p.a[1+g.n%array_length(p.a,1)],
 f.id, f.nome_fantasia, f.razao_social, g.val, 1, (ARRAY['BAIXA','NORMAL','ALTA','URGENTE'])[1+g.n%4], (ARRAY['LOCAL','CENTRAL'])[1+g.n%2],
 (ARRAY['PIX_TRANSFERENCIA','BOLETO','CARTAO_CREDITO','PIX_TRANSFERENCIA'])[1+g.n%4], 1, (g.dt+interval '15 days')::date,
 g.n%4<>0, CASE WHEN g.n%4<>0 THEN (40000+g.n*137)::text END, CASE WHEN g.n%4=0 THEN 'Prestador autônomo emite apenas recibo' END,
 (ARRAY['Abastecimento de viatura em posto credenciado','Troca de pastilhas de freio','Hospedagem de equipe em deslocamento','Alimentação de equipe em plantão','Borracharia e alinhamento','Locação de gerador','Serviço de guincho','Lavagem de viaturas'])[1+g.n%8],
 CASE WHEN g.n%2=0 THEN v.a[1+g.n%array_length(v.a,1)] END,
 g.st, u.id, CASE WHEN g.st<>'RASCUNHO' THEN g.dt END,
 CASE WHEN g.st IN ('APROVADO','REJEITADO') THEN u.id END, CASE WHEN g.st IN ('APROVADO','REJEITADO') THEN g.dt+interval '1 day' END,
 CASE WHEN g.st='APROVADO' THEN g.val END, CASE WHEN g.st='APROVADO' THEN 'Liberado para pagamento' END,
 CASE WHEN g.st='REJEITADO' THEN 'Nota fiscal com CNPJ divergente do fornecedor' END,
 CASE WHEN g.st='CANCELADO' THEN u.id END, CASE WHEN g.st='CANCELADO' THEN g.dt+interval '1 day' END, CASE WHEN g.st='CANCELADO' THEN 'Lançamento em duplicidade' END,
 0, g.dt, 'USRADMIN', true, upper(f.nome_fantasia)
FROM g JOIN f ON f.rn=g.n, b, p, c, v, u;
COMMIT;
