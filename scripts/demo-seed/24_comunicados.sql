-- Comunicações: 22 comunicados (novidades, avisos, dicas, manutenções e urgentes) com segmentação, leituras,
-- confirmações, adiamentos e dispensas dos usuários. Idempotente (refaz só os comunicados desta carga).
-- Pré-requisito: usuários do 15_usuarios_operacao.py.
BEGIN;
SELECT setseed(0.24);

DELETE FROM interacoes_comunicado WHERE id_comunicado IN (SELECT id FROM comunicados WHERE usuario_criacao LIKE '%' AND resumo LIKE '%·%');
DELETE FROM segmentos_comunicado WHERE id_comunicado IN (SELECT id FROM comunicados WHERE resumo LIKE '%·%');
DELETE FROM comunicados WHERE resumo LIKE '%·%';

CREATE TEMP TABLE _c (n int, titulo text, resumo text, conteudo text, tipo text, apres text, status text, dias numeric, dias_fim numeric,
                      fixado boolean, confirma boolean, sino boolean, prio text, email boolean, acao text, link text, autor text, alvo text,
                      video text) ON COMMIT DROP;
INSERT INTO _c VALUES
 (1, 'Bloqueio e etiquetagem obrigatórios em toda intervenção com desligamento',
  'Segurança · Nova regra vale a partir de hoje para todas as equipes de campo',
  E'## O que muda\n\nA partir de hoje, **toda intervenção com desligamento** só começa depois do bloqueio e da etiquetagem do equipamento de manobra, registrados na APR do turno.\n\n### Passo a passo\n\n1. Confirme a ordem de desligamento com o centro de operação.\n2. Instale o cadeado e a etiqueta com nome, equipe e horário.\n3. Teste a ausência de tensão e instale o aterramento temporário.\n4. Registre tudo na APR antes de liberar a equipe.\n\n> Sem o registro na APR, o serviço do dia aparece como **impedido** no boletim.\n\nDúvidas: fale com o técnico de segurança da sua base.',
  'URGENTE', 'MODAL', 'PUBLICADO', 2.2, NULL, true, true, true, 'CRITICA', true, 'Ver procedimento', '/manual-sst', 'LREIS', 'TODOS', NULL),
 (2, 'Novidade: boletim diário das obras',
  'Obras · Acompanhe turnos, APR, execução e meta de cada equipe em uma única tela',
  E'## Boletim diário das obras\n\nO novo **boletim** reúne, por equipe, tudo o que aconteceu no dia:\n\n- turno aberto ou encerrado, com horário e membros;\n- APR concluída e liberação para execução;\n- serviços executados e valor do dia comparado com a meta;\n- ocorrências registradas pela equipe.\n\nUse o seletor de data para comparar com o dia anterior. O boletim é atualizado automaticamente enquanto as equipes trabalham.',
  'CHANGELOG', 'MODAL', 'PUBLICADO', 0.05, NULL, false, false, true, 'NORMAL', true, 'Abrir boletim', '/obras/boletim', 'FBRAGA', 'TODOS', NULL),
 (3, 'Programação de obras com linha do tempo por equipe',
  'Obras · Arraste para reprogramar e veja o histórico de cada mudança',
  E'A tela de **programação** agora mostra a agenda de cada equipe em uma linha do tempo.\n\n- Arraste uma programação para outra data ou equipe: o sistema pede o motivo e guarda no histórico.\n- O percentual da meta mensal da equipe aparece ao lado do nome.\n- Programações atrasadas ficam destacadas em vermelho.\n\nNo **histórico** você encontra todas as edições, reprogramações e cancelamentos, com quem fez e quando.',
  'CHANGELOG', 'CARD', 'PUBLICADO', 9.3, NULL, false, false, true, 'NORMAL', true, 'Ver programação', '/obras/programacao', 'FBRAGA', 'TODOS', NULL),
 (4, 'Medições por ciclo mensal e estorno com justificativa',
  'Obras · Feche o ciclo do mês a partir do realizado apontado pelas equipes',
  E'A medição passa a ser gerada a partir dos **apontamentos de execução**, com o valor congelado na programação.\n\n- **Ciclo**: mede tudo o que foi concluído até o fim da competência.\n- **Parcial**: mede serviços escolhidos, por exemplo na entrega da obra.\n- **Estorno**: desfaz uma medição gerada por engano; a justificativa fica registrada.\n\nA lista **A medir** mostra, por obra, o valor pronto para medição.',
  'CHANGELOG', 'CARD', 'PUBLICADO', 16.4, NULL, false, false, false, 'NORMAL', true, 'Abrir medições', '/obras/medicoes', 'PNOVAES', 'PERFIL:COORDENADOR_TECNICO,BACKOFFICE_TECNICO,ADMINISTRADOR', NULL),
 (5, 'Como registrar a pré-vistoria pelo checklist',
  'Dica · Respostas padronizadas e PDF pronto para enviar ao fiscal',
  E'Na aba **Documentação** da obra, escolha o modelo *Pré-vistoria de rede de distribuição* e responda as perguntas em campo.\n\n**Dicas rápidas**\n\n- Marque *Não se aplica* quando a pergunta não fizer sentido para a obra.\n- Use o campo de observações para orientar a equipe de construção.\n- O PDF da vistoria pode ser baixado e enviado ao fiscal da distribuidora.',
  'DICA', 'CARD', 'PUBLICADO', 6.1, NULL, false, false, false, 'BAIXA', false, NULL, NULL, 'CMENEZES', 'TODOS', NULL),
 (6, 'Use o Copiloto para ler o projeto e marcar os pontos',
  'Dica · O Copiloto sugere pontos, vãos e metragens a partir do PDF do projeto',
  E'No **planejamento** da obra, clique em *Ler com o Copiloto*. Ele lê a folha do projeto e sugere:\n\n- pontos com número e barramento;\n- vãos com a metragem indicada no desenho;\n- avisos quando algum trecho não pôde ser interpretado.\n\nRevise as sugestões antes de aceitar: você pode arrastar os pontos para ajustar a posição.',
  'DICA', 'CARD', 'PUBLICADO', 12.2, NULL, false, false, false, 'BAIXA', false, NULL, NULL, 'CMENEZES', 'PERFIL:BACKOFFICE_TECNICO,COORDENADOR_TECNICO,ADMINISTRADOR', NULL),
 (7, 'Inventário rotativo no almoxarifado de Juazeiro',
  'Almoxarifado · Separações de sexta-feira serão concentradas no período da manhã',
  E'Nesta semana faremos o **inventário rotativo** das famílias de condutores e transformadores no almoxarifado de Juazeiro.\n\n- Sexta-feira: separações somente até as 11h.\n- Pedidos com retirada na sexta devem estar **separados até quinta**.\n- Divergências serão ajustadas no sistema até segunda-feira.',
  'AVISO', 'BANNER', 'PUBLICADO', 3.1, -5, false, false, true, 'ALTA', true, 'Ver solicitações', '/almoxarifado', 'GALMEIDA', 'PERFIL:BACKOFFICE_ALMOXARIFADO,COORDENADOR_TECNICO,ADMINISTRADOR', NULL),
 (8, 'Manutenção programada do sistema no sábado',
  'Sistema · Sábado, das 22h às 23h30, o acesso ficará indisponível',
  E'Faremos uma atualização de infraestrutura no **sábado, das 22h às 23h30**.\n\n- O aplicativo de campo continua funcionando sem conexão e sincroniza depois.\n- Evite iniciar importações de planilhas nesse período.\n\nObrigado pela compreensão.',
  'MANUTENCAO', 'BANNER', 'PUBLICADO', 1.2, -6, false, false, true, 'NORMAL', true, NULL, NULL, 'FBRAGA', 'TODOS', NULL),
 (9, 'Calendário de fechamento da medição de novembro',
  'Medição · Envio dos ciclos até o 5º dia útil; confirme a leitura',
  E'## Prazos do ciclo\n\n| Etapa | Prazo |\n|---|---|\n| Apontamentos conferidos pelas bases | 2º dia útil |\n| Ciclos gerados no sistema | 4º dia útil |\n| Envio ao fiscal da distribuidora | 5º dia útil |\n\nObras com pendência de As Built ficam fora do ciclo até a regularização.',
  'AVISO', 'CARD', 'PUBLICADO', 4.4, NULL, true, true, true, 'ALTA', true, 'Abrir pré-fechamento', '/obras/pre-fechamento', 'PNOVAES', 'PERFIL:COORDENADOR_TECNICO,BACKOFFICE_TECNICO,ADMINISTRADOR', NULL),
 (10, 'Alerta de chuvas fortes no norte da Bahia',
  'Clima · Previsão de temporais nas regiões de Jacobina e Senhor do Bonfim',
  E'O serviço de meteorologia emitiu **alerta laranja** de chuvas fortes para os próximos dois dias.\n\n- Não realize trabalho em altura sob chuva ou com descargas atmosféricas visíveis.\n- Registre a parada como **ocorrência de clima** no turno.\n- Em estradas de terra, avalie o acesso antes de deslocar o caminhão.\n\nA segurança da equipe vem antes do prazo da obra.',
  'URGENTE', 'CARD', 'PUBLICADO', 0.9, -2, true, false, true, 'CRITICA', true, NULL, NULL, 'LREIS', 'TIPO_USUARIO:CAMPO;PERFIL:COORDENADOR_TECNICO,ADMINISTRADOR,COORDENADOR_SESMT', NULL),
 (11, 'Abastecimento: foto do hodômetro passa a ser obrigatória',
  'Frota · Registros sem foto ficam pendentes de conferência',
  E'Para reduzir divergências nas faturas dos postos, **todo abastecimento** precisa da foto do hodômetro e do cupom.\n\nRegistros sem foto ficam com status *pendente de conferência* e não entram no fechamento quinzenal.',
  'AVISO', 'CARD', 'PUBLICADO', 20.5, NULL, false, false, false, 'NORMAL', true, 'Ir para a frota', '/frota', 'RPIRES', 'PERFIL:GESTOR_FROTA,OPERACAO_FROTA,OFICINA_FROTA,ADMINISTRADOR;TIPO_USUARIO:CAMPO', NULL),
 (12, 'Atalhos de teclado na tela de planejamento',
  'Dica · Marque pontos e vãos sem tirar a mão do teclado',
  E'- **P**: lançar ponto\n- **V**: lançar vão\n- **N**: anotar na folha\n- **S**: selecionar vários pontos\n- **M**: mover a folha\n\nCom vários pontos selecionados, aplique o mesmo kit a todos de uma vez.',
  'DICA', 'CARD', 'PUBLICADO', 25.3, NULL, false, false, false, 'BAIXA', false, NULL, NULL, 'CMENEZES', 'PERFIL:BACKOFFICE_TECNICO,COORDENADOR_TECNICO,ADMINISTRADOR', NULL),
 (13, 'Solicitações técnicas mostram reserva e separação',
  'Almoxarifado · Acompanhe o pedido da obra do agendamento à entrega',
  E'O quadro de solicitações técnicas agora mostra em que etapa cada pedido está: **aguardando agendamento**, **pronto para separação**, **em separação**, **separado** e **entregue**.\n\nO número da reserva informado pelo almoxarifado aparece no pedido e na entrega assinada.',
  'CHANGELOG', 'CARD', 'PUBLICADO', 30.2, NULL, false, false, false, 'NORMAL', true, 'Ver quadro', '/almoxarifado', 'GALMEIDA', 'TODOS', NULL),
 (14, 'Reciclagem NR-10 e NR-35: turmas de novembro',
  'Treinamento · Inscrições abertas; confirme a leitura e procure seu supervisor',
  E'Estão abertas as turmas de reciclagem de **NR-10 (SEP)** e **NR-35**.\n\n| Base | Data | Local |\n|---|---|---|\n| Juazeiro | 12 e 13/11 | Auditório da base |\n| Jacobina | 19 e 20/11 | Sala de treinamento |\n| Senhor do Bonfim | 26 e 27/11 | Auditório da base |\n\nColaboradores com certificado vencendo em até 60 dias têm prioridade.',
  'AVISO', 'CARD', 'PUBLICADO', 8.2, -24, false, true, true, 'ALTA', true, NULL, NULL, 'LREIS', 'TIPO_USUARIO:CAMPO;PERFIL:COORDENADOR_SESMT,BACKOFFICE_SESMT,COORDENADOR_TECNICO,ADMINISTRADOR', NULL),
 (15, 'Falha de sincronização do aplicativo de campo (resolvida)',
  'Sistema · Os apontamentos do período foram reprocessados',
  E'Entre 14h e 15h20 o aplicativo não sincronizou os apontamentos. **O problema foi resolvido** e todos os registros feitos sem conexão foram reprocessados.\n\nSe algum serviço não aparecer no boletim, abra um chamado.',
  'URGENTE', 'BANNER', 'ARQUIVADO', 41.1, 40, false, false, true, 'ALTA', true, NULL, NULL, 'FBRAGA', 'TODOS', NULL),
 (16, 'Atualização do servidor concluída',
  'Sistema · Mais velocidade nas listas e nos relatórios',
  E'A atualização de infraestrutura foi concluída. As listas de obras e de solicitações ficaram até **3x mais rápidas**.',
  'MANUTENCAO', 'BANNER', 'ARQUIVADO', 45.3, 43, false, false, false, 'BAIXA', false, NULL, NULL, 'FBRAGA', 'TODOS', NULL),
 (17, 'Campanha de vacinação contra a gripe nas bases',
  'Saúde · Vacinação gratuita para colaboradores e dependentes',
  E'A campanha de vacinação acontece nas bases entre os dias 10 e 14. Leve um documento com foto. Dependentes podem ser vacinados mediante agendamento.',
  'AVISO', 'CARD', 'ARQUIVADO', 52.0, 38, false, false, false, 'NORMAL', true, NULL, NULL, 'MVIANA', 'TODOS', NULL),
 (18, 'Resultados do trimestre: obras entregues e indicadores',
  'Resultados · Rascunho para revisão da coordenação',
  E'## Destaques do trimestre\n\n- Obras concluídas dentro do prazo regulado\n- Valor medido por base\n- Redução de reprogramações por falta de material\n\n*Números finais serão incluídos após o fechamento de novembro.*',
  'AVISO', 'MODAL', 'RASCUNHO', -0.4, NULL, false, false, false, 'NORMAL', true, NULL, NULL, 'JCSANTOS', 'TODOS', NULL),
 (19, 'Novo fluxo de aprovação de compras',
  'Financeiro · Rascunho do comunicado da nova alçada de aprovação',
  E'A partir do próximo mês, compras acima de **R$ 5.000,00** passam a exigir aprovação da coordenação regional antes do envio ao fornecedor.',
  'AVISO', 'CARD', 'RASCUNHO', -1.2, NULL, false, false, false, 'NORMAL', true, NULL, NULL, 'FBRAGA', 'TODOS', NULL),
 (20, 'Semana Interna de Prevenção de Acidentes 2026',
  'SIPAT · Programação com palestras, simulados e premiação das equipes',
  E'## Programação\n\n- **Segunda**: abertura e palestra sobre riscos elétricos\n- **Terça**: simulado de resgate em poste\n- **Quarta**: saúde mental e ergonomia\n- **Quinta**: direção defensiva\n- **Sexta**: premiação das equipes com zero acidente no ano',
  'AVISO', 'MODAL', 'PUBLICADO', -6.0, -11, false, false, true, 'NORMAL', true, NULL, NULL, 'LREIS', 'TODOS', NULL),
 (21, 'Como acompanhar o desempenho da sua equipe no boletim',
  'Dica · Veja a meta do dia e o que falta executar na frente',
  E'No boletim, toque no nome da sua equipe para ver:\n\n1. a meta do dia e o valor já executado;\n2. as programações do dia e a situação da APR;\n3. as ocorrências registradas no turno.\n\nEncerrar o turno com o **relatório preenchido** ajuda o planejamento a reprogramar o que ficou pendente.',
  'DICA', 'CARD', 'PUBLICADO', 4.0, NULL, false, false, false, 'BAIXA', false, 'Abrir boletim', '/obras/boletim', 'MALIMA', 'TIPO_USUARIO:CAMPO;PERFIL:COORDENADOR_TECNICO,ADMINISTRADOR', NULL),
 (22, 'Frota: checklist de saída com fotos',
  'Frota · Inspeção do veículo antes do primeiro deslocamento do dia',
  E'O checklist de saída do veículo agora aceita **fotos por item** e gera pendência automática para a oficina quando algum item é reprovado.\n\nPendências críticas bloqueiam a saída do veículo até a liberação do gestor da frota.',
  'CHANGELOG', 'CARD', 'PUBLICADO', 22.6, NULL, false, false, false, 'NORMAL', true, 'Ir para a frota', '/frota', 'RPIRES', 'PERFIL:GESTOR_FROTA,OPERACAO_FROTA,OFICINA_FROTA,ADMINISTRADOR;TIPO_USUARIO:CAMPO', NULL);

CREATE TEMP TABLE _cid ON COMMIT DROP AS SELECT n, gen_random_uuid() id FROM _c;

INSERT INTO comunicados (id, titulo, resumo, conteudo, tipo, apresentacao, status, video_url, acao_rotulo, acao_deeplink, data_inicio, data_fim, publicado_em,
                         fixado, exige_confirmacao, notificar_no_sininho, prioridade_notificacao, notificar_por_email,
                         versao, data_criacao, data_ultima_alteracao, usuario_criacao, usuario_ultima_alteracao, ativo)
SELECT i.id, c.titulo, c.resumo, c.conteudo, c.tipo, c.apres, c.status, c.video, c.acao, c.link,
       CASE WHEN c.status = 'RASCUNHO' THEN now() + (abs(c.dias) || ' days')::interval ELSE now() - (c.dias || ' days')::interval END,
       CASE WHEN c.dias_fim IS NOT NULL THEN now() - (c.dias_fim || ' days')::interval END,
       CASE WHEN c.status <> 'RASCUNHO' THEN now() - (greatest(c.dias, 0.02) || ' days')::interval - CASE WHEN c.dias < 0 THEN interval '1 day' ELSE interval '0' END END,
       c.fixado, c.confirma, c.sino, c.prio, c.email,
       CASE WHEN c.status = 'ARQUIVADO' THEN 2 ELSE 1 END,
       now() - (greatest(c.dias, 0) + 1.1 || ' days')::interval,
       CASE WHEN c.status = 'ARQUIVADO' THEN now() - (c.dias_fim || ' days')::interval ELSE now() - (greatest(c.dias, 0) || ' days')::interval END,
       c.autor, c.autor, true
  FROM _c c JOIN _cid i ON i.n = c.n;

-- Segmentos: TODOS, PERFIL:<nomes> e TIPO_USUARIO:<valor>, separados por ';'
INSERT INTO segmentos_comunicado (id, id_comunicado, tipo_alvo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), i.id, 'TODOS', NULL, NULL, 0, now(), c.autor, true
  FROM _c c JOIN _cid i ON i.n = c.n WHERE c.alvo = 'TODOS';
INSERT INTO segmentos_comunicado (id, id_comunicado, tipo_alvo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), i.id, 'PERFIL', p.id, NULL, 0, now(), c.autor, true
  FROM _c c JOIN _cid i ON i.n = c.n, unnest(string_to_array(c.alvo, ';')) parte,
       unnest(string_to_array(split_part(parte, ':', 2), ',')) perfil JOIN perfis_acesso p ON p.nome = perfil
 WHERE split_part(parte, ':', 1) = 'PERFIL';
INSERT INTO segmentos_comunicado (id, id_comunicado, tipo_alvo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), i.id, 'TIPO_USUARIO', NULL, split_part(parte, ':', 2), 0, now(), c.autor, true
  FROM _c c JOIN _cid i ON i.n = c.n, unnest(string_to_array(c.alvo, ';')) parte
 WHERE split_part(parte, ':', 1) = 'TIPO_USUARIO';

-- Leituras: quem é alvo e já teve tempo de ler; os mais antigos têm mais leituras
CREATE TEMP TABLE _dest ON COMMIT DROP AS
SELECT DISTINCT i.id id_com, c.n, c.dias, c.confirma, c.apres, c.status, u.id id_usuario, u.login
  FROM _c c JOIN _cid i ON i.n = c.n
  JOIN usuarios u ON u.ativo
 WHERE c.status IN ('PUBLICADO', 'ARQUIVADO') AND c.dias > 0
   AND (c.alvo = 'TODOS'
        OR EXISTS (SELECT 1 FROM segmentos_comunicado s WHERE s.id_comunicado = i.id AND s.tipo_alvo = 'PERFIL' AND s.id_alvo = u.id_perfil)
        OR EXISTS (SELECT 1 FROM segmentos_comunicado s WHERE s.id_comunicado = i.id AND s.tipo_alvo = 'TIPO_USUARIO' AND s.valor_alvo = u.tipo_usuario));

INSERT INTO interacoes_comunicado (id, id_comunicado, id_usuario, visualizado_em, dispensado_em, adiado_ate, confirmado_em, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), d.id_com, d.id_usuario, x.viu,
       CASE WHEN d.apres = 'BANNER' AND x.r < 0.45 THEN x.viu + interval '2 minutes' END,
       CASE WHEN d.confirma AND x.r BETWEEN 0.80 AND 0.88 THEN now() + interval '1 day' END,
       CASE WHEN d.confirma AND x.r < 0.80 THEN x.viu + (x.r * 40 || ' minutes')::interval END,
       0, x.viu, d.login, true
  FROM _dest d
  CROSS JOIN LATERAL (SELECT random() + 0 * length(d.login) r) rr
  CROSS JOIN LATERAL (SELECT rr.r, now() - (d.dias || ' days')::interval + (rr.r * least(d.dias, 3) || ' days')::interval + interval '25 minutes' viu) x
 WHERE rr.r < CASE WHEN d.dias > 7 THEN 0.92 WHEN d.dias > 2 THEN 0.8 ELSE 0.62 END
   AND NOT (d.login = 'USRADMIN' AND d.n IN (2, 8))
   AND x.viu < now();
-- O administrador já leu os comunicados antigos (o modal e o banner novos ficam para a apresentação)
INSERT INTO interacoes_comunicado (id, id_comunicado, id_usuario, visualizado_em, confirmado_em, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), d.id_com, d.id_usuario, now() - (d.dias || ' days')::interval + interval '3 hours',
       CASE WHEN d.confirma THEN now() - (d.dias || ' days')::interval + interval '3 hours 4 minutes' END, 0, now(), 'USRADMIN', true
  FROM _dest d WHERE d.login = 'USRADMIN' AND d.n NOT IN (2, 8)
ON CONFLICT (id_comunicado, id_usuario) DO NOTHING;
COMMIT;
