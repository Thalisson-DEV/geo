-- Complementos dos módulos com pouca massa: conversa dos chamados (equipes de atendimento, interações),
-- respostas e participantes das inspeções de SST, metas de inspeção, trilha das solicitações financeiras
-- e notificações dos usuários da operação. Pré-requisito: 04, 06, 03 e 15. Idempotente.
BEGIN;
SELECT setseed(0.25);

-- Chamados ------------------------------------------------------------------------------------------
INSERT INTO equipes_atendimento_chamado (id, codigo, nome, descricao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), x.cod, x.nome, x.descr, 0, now() - interval '120 days', 'FBRAGA', true
  FROM (VALUES ('SUPORTE_SISTEMAS', 'Suporte de Sistemas', 'Acessos, senhas, aplicativo de campo e integrações.'),
               ('ALMOXARIFADO', 'Almoxarifado', 'Saldos, divergências de estoque e solicitações de material.'),
               ('FROTA', 'Gestão de Frota', 'Veículos, abastecimento, manutenção e telemetria.')) x(cod, nome, descr)
 WHERE NOT EXISTS (SELECT 1 FROM equipes_atendimento_chamado e WHERE e.codigo = x.cod);

INSERT INTO equipe_atendimento_chamado_membros (id_equipe, usuario_id)
SELECT e.id, u.id FROM equipes_atendimento_chamado e JOIN usuarios u ON u.login = ANY (CASE e.codigo
    WHEN 'CENTRAL_ATENDIMENTO' THEN ARRAY['FBRAGA', 'USRADMIN'] WHEN 'SUPORTE_SISTEMAS' THEN ARRAY['FBRAGA', 'USRADMIN']
    WHEN 'ALMOXARIFADO' THEN ARRAY['GALMEIDA'] WHEN 'FROTA' THEN ARRAY['RPIRES', 'DLEAL'] END)
 WHERE NOT EXISTS (SELECT 1 FROM equipe_atendimento_chamado_membros m WHERE m.id_equipe = e.id AND m.usuario_id = u.id);

-- Solicitantes e responsáveis variados nos chamados da carga
CREATE TEMP TABLE _usr ON COMMIT DROP AS
SELECT id, login, row_number() OVER (ORDER BY login) - 1 n, count(*) OVER () t FROM usuarios
 WHERE login NOT IN ('USRADMIN', 'FBRAGA') AND ativo;
UPDATE chamados c SET
  usuario_solicitante_id = (SELECT id FROM _usr WHERE n = abs(hashtext(c.id::text)) % (SELECT max(t) FROM _usr)),
  usuario_responsavel_id = CASE WHEN c.status <> 'ABERTO' THEN (SELECT id FROM usuarios WHERE login = CASE WHEN abs(hashtext(c.protocolo)) % 3 = 0 THEN 'USRADMIN' ELSE 'FBRAGA' END) END
 WHERE c.usuario_criacao = 'USRADMIN' AND NOT EXISTS (SELECT 1 FROM interacoes_chamado i WHERE i.id_chamado = c.id);

CREATE TEMP TABLE _ch ON COMMIT DROP AS
SELECT c.* FROM chamados c WHERE NOT EXISTS (SELECT 1 FROM interacoes_chamado i WHERE i.id_chamado = c.id);

INSERT INTO interacoes_chamado (id, id_chamado, tipo, mensagem, interno, usuario_autor_id, status_anterior, status_novo, equipe_anterior_id, equipe_nova_id,
                                responsavel_anterior_id, responsavel_novo_id, data_evento, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), c.id, x.tipo, x.msg, x.interno, x.autor, x.de, x.para, NULL, NULL, NULL, x.resp, c.data_abertura + x.atraso, 0, c.data_abertura + x.atraso, 'SISTEMA', true
  FROM _ch c
  CROSS JOIN LATERAL (VALUES
    (1, 'ABERTURA', c.descricao, false, c.usuario_solicitante_id, NULL, 'ABERTO', NULL::uuid, interval '0'),
    (2, 'ATRIBUICAO', NULL, false, coalesce(c.usuario_responsavel_id, c.usuario_solicitante_id), NULL, NULL, c.usuario_responsavel_id, interval '50 minutes'),
    (3, 'ALTERACAO_STATUS', NULL, false, coalesce(c.usuario_responsavel_id, c.usuario_solicitante_id), 'ABERTO', 'EM_ATENDIMENTO', NULL, interval '2 hours'),
    (4, 'MENSAGEM_PUBLICA', (ARRAY['Olá! Já estamos verificando. Pode confirmar em qual tela o problema aparece?',
                                   'Recebido. Vou validar com a equipe responsável e retorno ainda hoje.',
                                   'Conseguimos reproduzir. A correção será aplicada no fim da tarde.'])[1 + abs(hashtext(c.id::text)) % 3],
        false, coalesce(c.usuario_responsavel_id, c.usuario_solicitante_id), NULL, NULL, NULL, interval '2 hours 10 minutes'),
    (5, 'COMENTARIO_INTERNO', 'Verificar se o perfil do usuário tem a permissão do módulo antes de escalar.', true,
        coalesce(c.usuario_responsavel_id, c.usuario_solicitante_id), NULL, NULL, NULL, interval '3 hours'),
    (6, 'MENSAGEM_PUBLICA', (ARRAY['Na tela de solicitações, ao salvar aparece uma mensagem de erro.', 'Segue o print. Aconteceu de novo hoje cedo.',
                                   'Obrigado pelo retorno, fico no aguardo.'])[1 + abs(hashtext(c.protocolo)) % 3],
        false, c.usuario_solicitante_id, NULL, NULL, NULL, interval '4 hours'),
    (7, 'ALTERACAO_STATUS', 'Aguardando retorno do solicitante com o print da tela.', false, coalesce(c.usuario_responsavel_id, c.usuario_solicitante_id),
        'EM_ATENDIMENTO', 'AGUARDANDO_SOLICITANTE', NULL, interval '5 hours'),
    (8, 'ALTERACAO_STATUS', coalesce(c.solucao, 'Ajuste aplicado e validado com o solicitante.'), false, coalesce(c.usuario_responsavel_id, c.usuario_solicitante_id),
        'EM_ATENDIMENTO', 'RESOLVIDO', NULL, interval '20 hours'),
    (9, 'ALTERACAO_STATUS', 'Chamado encerrado após confirmação do solicitante.', false, c.usuario_solicitante_id, 'RESOLVIDO', 'FECHADO', NULL, interval '30 hours'),
    (10, 'CANCELAMENTO', 'Solicitante informou que o problema foi resolvido por outro canal.', false, c.usuario_solicitante_id, 'ABERTO', 'CANCELADO', NULL, interval '30 hours')
  ) x(ordem, tipo, msg, interno, autor, de, para, resp, atraso)
 WHERE (x.ordem = 1)
    OR (c.status IN ('EM_ATENDIMENTO', 'AGUARDANDO_SOLICITANTE', 'RESOLVIDO', 'FECHADO') AND x.ordem IN (2, 3, 4, 5, 6))
    OR (c.status = 'AGUARDANDO_SOLICITANTE' AND x.ordem = 7)
    OR (c.status IN ('RESOLVIDO', 'FECHADO') AND x.ordem = 8)
    OR (c.status = 'FECHADO' AND x.ordem = 9)
    OR (c.status = 'CANCELADO' AND x.ordem = 10);

-- SST: respostas das inspeções concluídas, participantes, metas ------------------------------------------
INSERT INTO respostas_inspecao (id, id_inspecao, id_pergunta, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), i.id, p.id, 0, i.data_realizacao, i.usuario_criacao, true
  FROM inspecoes_seguranca i JOIN grupos_pergunta g ON g.id_formulario = i.id_formulario JOIN perguntas_inspecao p ON p.id_grupo = g.id
 WHERE i.status = 'CONCLUIDA' AND p.tipo_resposta = 'MULTIPLA_ESCOLHA'
ON CONFLICT (id_inspecao, id_pergunta) DO NOTHING;
INSERT INTO respostas_opcoes (id, id_resposta, id_opcao_resposta, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), r.id,
       (SELECT o.id FROM opcoes_resposta o WHERE o.id_pergunta = r.id_pergunta
         ORDER BY CASE WHEN EXISTS (SELECT 1 FROM desvios_seguranca d WHERE d.id_inspecao = r.id_inspecao AND d.id_pergunta = r.id_pergunta) THEN NOT o.gera_desvio
                       WHEN abs(hashtext(r.id::text)) % 10 = 0 THEN o.texto <> 'Não aplicável' ELSE o.texto <> 'Conforme' END, o.ordem LIMIT 1),
       0, r.data_criacao, r.usuario_criacao, true
  FROM respostas_inspecao r WHERE NOT EXISTS (SELECT 1 FROM respostas_opcoes x WHERE x.id_resposta = r.id);

INSERT INTO inspecao_colaboradores (id, id_inspecao, id_colaborador, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), i.id, m.id_colaborador, 0, i.data_realizacao, i.usuario_criacao, true
  FROM inspecoes_seguranca i JOIN equipe_membros m ON m.id_equipe = i.id_equipe AND m.data_saida IS NULL
ON CONFLICT (id_inspecao, id_colaborador) DO NOTHING;
INSERT INTO desvio_colaboradores (id, id_desvio, id_colaborador, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), d.id, (SELECT ic.id_colaborador FROM inspecao_colaboradores ic WHERE ic.id_inspecao = d.id_inspecao ORDER BY md5(ic.id::text) LIMIT 1),
       0, d.data_criacao, d.usuario_criacao, true
  FROM desvios_seguranca d WHERE EXISTS (SELECT 1 FROM inspecao_colaboradores ic WHERE ic.id_inspecao = d.id_inspecao)
ON CONFLICT (id_desvio, id_colaborador) DO NOTHING;

INSERT INTO metas_inspecao (id, escopo, id_funcao, id_colaborador, quantidade, periodicidade, vigencia_inicio, vigencia_fim, descricao, id_tipo_inspecao,
                            versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), 'FUNCAO', f.id, NULL, x.qtd, 'MENSAL', date_trunc('year', current_date)::date, NULL, x.descr, t.id, 0, now() - interval '200 days', 'LREIS', true
  FROM (VALUES ('ENCARREGADO', 'Campo', 8, 'Inspeções de campo nas frentes da equipe'),
               ('ENCARREGADO', 'Veicular', 4, 'Inspeção veicular semanal da viatura'),
               ('COORDENADOR', 'Campo', 6, 'Inspeções de campo nas equipes da coordenação'),
               ('ANALISTA', 'Alojamento', 2, 'Inspeção das instalações das bases')) x(funcao, tipo, qtd, descr)
  JOIN funcoes f ON f.nome = x.funcao JOIN tipos_inspecao t ON t.nome = x.tipo
 WHERE NOT EXISTS (SELECT 1 FROM metas_inspecao m WHERE m.id_funcao = f.id AND m.id_tipo_inspecao = t.id);

-- Financeiro: trilha de cada solicitação conforme o status atual ----------------------------------------
INSERT INTO financeiro_solicitacao_evento (id, id_solicitacao, tipo_solicitacao, tipo, status_anterior, status_novo, id_usuario, valor, texto, ocorrido_em)
SELECT gen_random_uuid(), s.id, s.tp, e.tipo, e.de, e.para, e.usr, s.valor, e.txt, e.quando
  FROM (SELECT id, 'COMPRA' tp, status, valor, data_criacao, data_submissao, data_decisao, data_cancelamento, usuario_solicitante_id, usuario_decisao_id,
               usuario_cancelamento_id, observacao_decisao, motivo_rejeicao, motivo_cancelamento FROM financeiro_solicitacao_compra
        UNION ALL
        SELECT id, 'PAGAMENTO', status, valor, data_criacao, data_submissao, data_decisao, data_cancelamento, usuario_solicitante_id, usuario_decisao_id,
               usuario_cancelamento_id, observacao_decisao, motivo_rejeicao, motivo_cancelamento FROM financeiro_solicitacao_pagamento) s
  CROSS JOIN LATERAL (VALUES
    ('CRIADA', NULL, 'RASCUNHO', s.usuario_solicitante_id, NULL, s.data_criacao, true),
    ('SUBMETIDA', 'RASCUNHO', 'SOLICITADO', s.usuario_solicitante_id, NULL, coalesce(s.data_submissao, s.data_criacao + interval '2 hours'), s.status <> 'RASCUNHO'),
    ('APROVADA', 'SOLICITADO', 'APROVADO', coalesce(s.usuario_decisao_id, s.usuario_solicitante_id), coalesce(s.observacao_decisao, 'Aprovado conforme orçamento.'),
       coalesce(s.data_decisao, s.data_criacao + interval '1 day'), s.status = 'APROVADO'),
    ('REJEITADA', 'SOLICITADO', 'REJEITADO', coalesce(s.usuario_decisao_id, s.usuario_solicitante_id), coalesce(s.motivo_rejeicao, 'Fora da alçada da base.'),
       coalesce(s.data_decisao, s.data_criacao + interval '1 day'), s.status = 'REJEITADO'),
    ('CANCELADA', 'SOLICITADO', 'CANCELADO', coalesce(s.usuario_cancelamento_id, s.usuario_solicitante_id), coalesce(s.motivo_cancelamento, 'Compra não é mais necessária.'),
       coalesce(s.data_cancelamento, s.data_criacao + interval '1 day'), s.status = 'CANCELADO')
  ) e(tipo, de, para, usr, txt, quando, aplica)
 WHERE e.aplica AND e.usr IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM financeiro_solicitacao_evento x WHERE x.id_solicitacao = s.id);

-- Notificações dos usuários da operação (obras, material, segurança, comunicados) -------------------------
INSERT INTO notificacoes (id, id_usuario, origem, categoria, prioridade, titulo, corpo, deeplink, chave_idempotencia, lida_em, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), u.id, x.origem, x.cat, x.prio, x.titulo, x.corpo, x.link, 'seed-ops-' || x.n || '-' || u.login,
       CASE WHEN (x.n + length(u.login)) % 3 <> 0 THEN now() - (x.horas || ' hours')::interval + interval '40 minutes' END,
       0, now() - (x.horas || ' hours')::interval, 'SISTEMA', true
  FROM (VALUES
    (1, 'REGRA', 'OPERACIONAL', 'ALTA', 'Programação atrasada na sua carteira', 'A programação da obra de Juazeiro terminou ontem sem concluir todos os serviços.', '/obras/programacao', 9),
    (2, 'REGRA', 'OPERACIONAL', 'NORMAL', 'Programação reprogramada', 'Uma frente da sua obra foi reprogramada por falta de desligamento. Veja o histórico.', '/obras/programacao/historico', 20),
    (3, 'SISTEMA', 'OPERACIONAL', 'NORMAL', 'Medição do ciclo gerada', 'O ciclo de outubro foi gerado e está disponível para conferência.', '/obras/medicoes', 30),
    (4, 'REGRA', 'APROVACAO', 'ALTA', 'Material separado aguardando retirada', 'Há solicitações técnicas separadas para as frentes desta semana.', '/almoxarifado', 14),
    (5, 'REGRA', 'SEGURANCA', 'CRITICA', 'Ocorrência que impede execução', 'Uma equipe registrou impedimento no turno: acesso bloqueado à obra.', '/obras/boletim', 26),
    (6, 'COMUNICADO', 'COMUNICADO', 'CRITICA', 'Novo comunicado de segurança', 'Bloqueio e etiquetagem obrigatórios em toda intervenção com desligamento.', '/notificacoes', 50),
    (7, 'AUTOMACAO', 'OPERACIONAL', 'NORMAL', 'Resumo semanal das obras', '16 obras em execução, 5 paralisadas e 9 concluídas no período.', '/obras', 70),
    (8, 'SISTEMA', 'SISTEMA', 'BAIXA', 'As Built gerado', 'O documento As Built da obra concluída está pronto para download.', '/obras', 4)
  ) x(n, origem, cat, prio, titulo, corpo, link, horas)
  JOIN usuarios u ON u.login IN ('USRADMIN', 'FBRAGA', 'CMENEZES', 'RTAVARES', 'MALIMA', 'JCSANTOS', 'PNOVAES', 'GALMEIDA', 'LREIS')
ON CONFLICT (id_usuario, chave_idempotencia) DO NOTHING;
COMMIT;
