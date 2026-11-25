## 1. Backend
- [x] 1.1 V274: matrícula, estoque_parametros, atendimentos_balcao, permissões
- [x] 1.2 Balcão: painel, atendimento, retirada (multi-solicitação, separação opcional, excedente), devolução por obra
- [x] 1.3 Regras do balcão e comprovantes (assinatura/foto no armazenamento)
- [x] 1.4 Estoque das equipes e caminhão por obra
- [x] 1.5 Nomenclatura Retirada/Devolução nas mensagens e importações
- [x] 1.6 Testes (BalcaoUseCasesTest)

## 2. Web
- [x] 2.1 Balcão (quadro do dia + atendimento em 3 passos) e termo
- [x] 2.2 Estoque das equipes, regras do balcão, matrícula no colaborador
- [x] 2.3 Ficha da obra enxuta + página Material da obra + movimentações agrupadas
- [x] 2.4 Nomenclatura e menu

## 3. App
- [x] 3.1 Aba Material = caminhão por obra; lembrete no fechar o dia; nomenclatura

## 4. Avaliação
- [x] 4.1 Chrome: retirada com excedente, devolução parcial, termo, estoque das equipes, ficha, app
- [x] 4.2 ui-reviewer

## 5. Revisão 25/11 (pedidos da reunião e telas)
- [x] 5.1 Balcão no app do almoxarifado (aba Balcão em /almox: quadro do dia + atendimento em 3 passos; precisa de internet)
- [x] 5.2 Trava de fotos: o modelo As Built tem "Fotos obrigatórias travam a execução" (V275, padrão ligado); no app o "Tudo feito" exige todas as obrigatórias e o "Parcial", as de antes
- [x] 5.3 Ocorrências "Obra já executada por terceiros" e "Alteração de projeto" (já semeadas em V273) agora exigem foto no app
- [x] 5.4 Balcão web: panorama do dia (faixa de situação que filtra), atalhos com contagem, busca e três visões (Quadro, Fila, Registrados com qualquer dia)
- [x] 5.5 Estoque das equipes: panorama, atalhos, filtro de base e três visões (Por equipe, Por material, Por obra) em geo-data-table, com CSV
- [x] 5.6 Design system: geo-segmented; geo-number-input align="end"

## 6. Critério de conclusão e quem retira (25/11, tarde)
- [x] 6.1 Obra conclui só com serviços executados, fotos obrigatórias recebidas (modelo que trava) e sem ocorrência de alteração de projeto ou obra feita por terceiros em aberto; reavalia a cada foto que chega e a cada decisão (V276, ConclusaoObraUseCases, GET/POST /v1/obras/{id}/conclusao)
- [x] 6.2 Ficha da obra: bloco "Para concluir a obra" com fotos que faltam e "Resolver" ocorrência (decisão registrada)
- [x] 6.3 Balcão (web e app): escolhe quem retira (da equipe ou de fora); matrícula vem do cadastro e sai no termo; regra "exige matrícula" = matrícula cadastrada

## 7. App acompanha o web (25/11, noite)
- [x] 7.1 Balcão no app: barra de abas não some mais; números do resumo filtram; "Atendidos" de hoje com comprovante (quem retirou, matrícula, itens, assinatura/foto)
- [x] 7.2 Estoque das equipes no app (aba Equipes em /almox): por equipe e por material, atalhos com contagem, busca, caminhão por obra numa folha com atalho para o balcão
- [x] 7.3 Hoje do administrativo: "Balcão hoje" (para retirar, atrasadas, para devolver, negativos, atendidos), abre o quadro no recorte
- [x] 7.4 Supervisão no app: bloco "Para concluir a obra" (fotos que faltam, ocorrências) e "Resolver" para quem tem obras:obra:write
- [x] 7.5 Permissões do app iguais às do web: balcão também com estoque:solicitacao:deliver; estoque das equipes com estoque:saldo:read
- [ ] 7.6 Avaliar no Chrome com usuário administrativo (precisa de login)
