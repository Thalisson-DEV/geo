# NEXO: roteiro do sistema

> Apresenta o sistema inteiro, com foco nas obras e em todos os seus processos. A Parte 1 mostra o que é o NEXO e como começar. A Parte 2 acompanha a obra do cadastro ao fechamento. A Parte 3 traz os módulos que apoiam a operação. A Parte 4 reúne glossário e dúvidas.
> Os nomes de telas, botões, abas e filtros aparecem **em negrito**, exatamente como estão no sistema. O caminho no menu usa setas: `Execução → Obras → Painel de Obras`.

## Sumário

**Parte 1: conheça o sistema**

- [1. Visão geral](#1-visão-geral)
- [2. Primeiro acesso](#2-primeiro-acesso)
- [3. Padrões que valem para todas as telas](#3-padrões-que-valem-para-todas-as-telas)
- [4. Preparar o sistema: o que conferir antes de operar](#4-preparar-o-sistema-o-que-conferir-antes-de-operar)

**Parte 2: a obra de ponta a ponta**

- [5. Cadastros de Obras](#5-cadastros-de-obras)
- [6. Carteira e ficha da obra](#6-carteira-e-ficha-da-obra)
- [7. Visita prévia](#7-visita-prévia)
- [8. Planejamento sobre o projeto](#8-planejamento-sobre-o-projeto)
- [9. Pré-fechamento do levantamento](#9-pré-fechamento-do-levantamento)
- [10. Materiais da obra](#10-materiais-da-obra)
- [11. Programação](#11-programação)
- [12. Campo: turnos, APR e acompanhamento](#12-campo-turnos-apr-e-acompanhamento)
- [13. Documentação técnica](#13-documentação-técnica)
- [14. Medição](#14-medição)
- [15. Fechamento e relatório detalhado](#15-fechamento-e-relatório-detalhado)

**Parte 3: módulos de apoio**

- [16. Almoxarifado](#16-almoxarifado)
- [17. Frota](#17-frota)
- [18. Segurança (SST)](#18-segurança-sst)
- [19. Financeiro](#19-financeiro)
- [20. Departamento Pessoal: descontos em folha](#20-departamento-pessoal-descontos-em-folha)
- [21. Chamados](#21-chamados)
- [22. Comunicação](#22-comunicação)
- [23. Copiloto (assistente de IA)](#23-copiloto-assistente-de-ia)
- [24. Administração](#24-administração)

**Parte 4: consulta rápida**

- [25. Glossário](#25-glossário)
- [26. Dúvidas frequentes](#26-dúvidas-frequentes)

# Parte 1: conheça o sistema

## 1. Visão geral

### 1.1 O que é o NEXO

O NEXO é a plataforma de gestão operacional de quem constrói e mantém redes elétricas. Ele reúne num só lugar a obra, as equipes, o material, a frota, a segurança, o dinheiro e as pessoas.

A obra é o centro. Quase tudo no sistema existe para que ela seja planejada, executada, documentada e medida com o menor retrabalho possível.

### 1.2 Os módulos e o papel de cada um na obra

| Módulo | O que faz | Papel na obra |
|---|---|---|
| **Execução** | Carteira, planejamento, programação, turnos, medição e fechamento | É onde a obra acontece (Parte 2) |
| **Almoxarifado** | Solicitações, entregas, devoluções e saldos | Leva o material à obra e controla o saldo em campo |
| **Frota** | Veículos, manutenção, abastecimento e condutores | Mantém disponíveis os veículos das equipes |
| **Segurança** | Inspeções, desvios e acidentalidade | Inspeciona as equipes que executam as obras |
| **Financeiro** | Contratos, compras, pagamentos e documentos | Define o valor de cada serviço por contrato e vigência |
| **Departamento Pessoal** | Colaboradores, funções e descontos em folha | Fornece o quadro de pessoal que forma as equipes |
| **Chamados** | Atendimento interno com prazos | Canal de suporte para quem opera |
| **Comunicação** | Mural, notificações e preferências | Avisa e registra quem leu |
| **Copiloto** | Assistente de IA | Lê o projeto em PDF e analisa dados da obra e dos painéis |
| **Admin** | Usuários, perfis e saúde do sistema | Define quem vê e faz cada etapa |

### 1.3 O caminho da obra

A obra percorre onze etapas, em quatro fases. A ordem abaixo é a da Parte 2.

| Fase | Etapa | Quem faz | Onde | O que sai dali |
|---|---|---|---|---|
| Preparar | Cadastros de Obras (seção 5) | Administrativo | `Execução → Cadastros de Obras` | Kits, status, agentes, tipos de anexo e checklists |
| Preparar | Carteira e ficha (seção 6) | Administrativo, gestor | `Execução → Obras` | A obra com responsáveis, prazo, valor e contrato |
| Planejar | Visita prévia (seção 7) | Supervisor | Ficha da obra | Checklist do local, com evidências e PDF |
| Planejar | Planejamento (seção 8) | Levantador | Ficha da obra → **PLANEJAR** | Pontos, vãos e kits sobre o PDF do projeto: o previsto da obra |
| Planejar | Pré-fechamento (seção 9) | Gestor | `Execução → Medição e Fechamento` | Levantamento conferido e concluído |
| Planejar | Materiais (seção 10) | Supervisor, almoxarife | Ficha da obra e Almoxarifado | Material entregue e saldo da obra |
| Executar | Programação (seção 11) | Programador, supervisor | `Execução → Programação e Campo` | Equipe, período, condições e valor congelado |
| Executar | Campo (seção 12) | Equipe, pelo app; gestor acompanha na web | App e `Execução → Programação e Campo` | Turno, APR, apontamentos, ocorrências e relatório diário |
| Executar | Documentação técnica (seção 13) | Equipe, supervisor, administrativo | Ficha da obra | Book de fotos, fichas As Built e equipamentos |
| Fechar | Medição (seção 14) | Medição | `Execução → Medição e Fechamento` | Serviços concluídos levados à cobrança |
| Fechar | Fechamento (seção 15) | Gestor, medição | `Execução → Medição e Fechamento` | Consolidado da obra e pacote orçado × faturado |

**Como cada serviço avança.** No planejamento, cada local mostra em que ponto está: **Sem kit** → **Pendente** → **Programado** → **Em andamento** → **Concluído**. **Atrasado** marca o que passou do período programado sem terminar. Depois de medido, o serviço sai da fila **A medir**.

### 1.4 Quem faz o quê

- **Supervisores e gestores programam e analisam pela web.** Não abrem turno, não preenchem APR e não apontam serviço.
- **A equipe de campo executa e registra pelo app:** abre e fecha o turno, informa a composição, preenche a APR antes de executar, aponta os serviços, tira as fotos do book e registra ocorrências e relatório diário.
- **A documentação técnica é compartilhada.** Visita prévia, ficha As Built e equipamentos são lançados pela web. No app, a equipe tira as fotos de cada ponto e lê a série dos equipamentos; o supervisor lança a visita prévia e pede o As Built e o book. O administrativo completa fichas e anexos pela web.

### 1.5 O que ainda está em desenvolvimento

A execução de Obras pelo app da equipe já está disponível: turno, chegada e saída da obra, APR, "Tudo feito" por ponto, fotos do book, ocorrências e relatório diário, tudo também sem sinal (veja a seção 12.4). A revisão das fotos pela web também (seção 13.4).

Ainda estão por vir:

- A tela do book com a entrega documental da obra: situação de cada obra, comparativo previsto × realizado e book fotográfico em PDF.
- Canteiros de postes e solicitação de material a partir da programação.
- Central de operações e mapa de obras.
- Relatórios gerenciais de Obras: carteira, prazos e produtividade.

## 2. Primeiro acesso

### 2.1 Como entrar no sistema

1. Abra o endereço do NEXO no navegador. Aparece a tela **Gestão Operacional**.
2. Em **Usuário**, digite seu login (formato parecido com `USR123456`). Em **Senha**, a senha que o administrador passou.
3. Clique em **ENTRAR NO SISTEMA**.

**Avisos comuns**
- "Acesso Negado": usuário ou senha incorretos, ou acesso desativado. Confira com o administrador.
- Se o sistema não responder, clique em **STATUS DO SISTEMA**, na própria tela de login. Ele mostra se algum serviço está fora do ar.
- Se a sessão expirar enquanto você trabalha, o sistema pede a senha de novo sem perder a tela em que você estava.

### 2.2 Como trocar a senha

1. No topo, à direita, clique no ícone de pessoa (**perfil**).
2. Clique em **Alterar Senha**.
3. Informe a senha atual, a nova senha e repita a nova senha.
4. Clique em **CONFIRMAR ALTERAÇÃO**.

> Troque a senha recebida no primeiro acesso. O sistema não obriga essa troca.

### 2.3 A tela inicial

Depois do login você cai na tela inicial, com o **Mapa do sistema**: atalhos numerados para Almoxarifado, Execução, Segurança, Departamento Pessoal, Financeiro, Admin e Chamados. Clique num atalho para ir à tela principal do módulo. Para voltar à tela inicial, clique no logotipo no canto superior esquerdo.

### 2.4 Como o menu é organizado

O menu lateral fica à esquerda (em celular ou tablet, abra pelo botão de menu no topo). Ele tem três níveis:

```
Módulo            →  Grupo                →  Tela
Execução          →  Programação e Campo  →  Agenda de Programação
```

| Módulo | Grupos |
|---|---|
| **Copiloto** (selo IA) | Abre direto o assistente |
| **Admin** | Controle de Acesso, Sistema |
| **Comunicação** | Avisos, Configurações, Cadastros |
| **Execução** | Obras, Programação e Campo, Medição e Fechamento, Relatórios, Cadastros de Obras, Cadastros |
| **Frota** | Manutenção, Operação, Frota e condutores, Relatórios, Cadastros |
| **Almoxarifado** | Solicitações Técnicas, Operações de Estoque, Relatórios, Cadastros |
| **Financeiro** | Minhas Solicitações, Aprovações, Gestão, Relatórios, Cadastros |
| **Departamento Pessoal** | Descontos em Folha, Pendências, Cadastros |
| **Segurança** | Minhas Ações, Gestão, Acidentalidade, Relatórios, Cadastros |
| **Chamados** | Autosserviço, Atendimento, Relatórios, Cadastros |

O menu mostra **só o que o seu perfil de acesso permite**. Se um colega vê uma tela que você não vê, a diferença está no perfil (ver 4.2).

### 2.5 Como achar uma tela rápido (Ctrl+K)

1. Pressione `Ctrl+K` ou clique em **Buscar telas** no topo.
2. Digite parte do nome (ex.: "medi", "abastec", "desvio").
3. Use as setas e Enter, ou clique no resultado. `Esc` fecha.

A busca só encontra telas que estão no seu menu.

### 2.6 Barra do topo

| Ícone | O que faz |
|---|---|
| **Buscar telas** | Busca de telas (Ctrl+K) |
| Lua / sol (selo Beta) | Alterna tema claro e escuro |
| Estrela | **Favoritos**: telas que você marcou para acesso rápido |
| Sino | **Notificações** (ver 2.7) |
| Pessoa | **Perfil** (ver 2.8) |

### 2.7 Notificações (sino)

1. O número vermelho no sino é a quantidade de avisos não lidos.
2. Clique no sino para ver os recentes. Clique num aviso para abrir o registro de origem (uma solicitação, uma OS, um desconto…).
3. **Marcar todas** marca todas como lidas; o ícone de arquivar tira o aviso da caixa sem apagá-lo.
4. **Ver todas** abre `Comunicação → Avisos → Minhas Notificações`. O ícone de ajustes leva às **Preferências de Notificação** (ver 22.3).

### 2.8 Perfil

No ícone de pessoa você encontra:
- **Cor** do tema e efeitos visuais ao clicar.
- **Atalhos de uma tecla**: liga `/` (busca na lista), `F` (abre os filtros) e `N` (novo registro).
- **Conectividade**: indica Online/Offline, permite sincronizar em 3G/4G e forçar o modo offline (útil em campo).
- **Meus Favoritos**, **Conectar sua IA** (ver 23.3), **Alterar Senha**, **Sair do Sistema**.

## 3. Padrões que valem para todas as telas

| Recurso | Como funciona |
|---|---|
| **Filtros** | Botão de filtros (ou tecla `F`). Cada filtro ativo vira um chip removível. O recorte fica no endereço da página: copie o link para mandar a um colega a mesma visão |
| **Indicadores do topo** | Cartões com números. Na maioria das telas, clicar no cartão filtra a lista |
| **Busca da lista** | Campo de busca da tabela (tecla `/`) |
| **Clique na linha** | Abre o detalhe, normalmente num painel lateral (drawer) |
| **Exportar** | CSV ou XLSX do recorte filtrado, inclusive a busca |
| **Importar** | Planilha CSV. O sistema confere linha a linha e mostra os erros antes de gravar |
| **Guia da tela** | Ícone de ajuda no cabeçalho. Explica regras de cálculo, filtros e botões |
| **Analisar com Copiloto** | Nos painéis, abre o assistente já com o período e os filtros da tela |
| **IMPRIMIR** | Relatórios de detalhe saem com cabeçalho da empresa, prontos para PDF ou papel |
| **Novo (tecla `N`)** | Abre o cadastro de um novo registro na tela em que você está |

## 4. Preparar o sistema: o que conferir antes de operar

Antes de lançar a primeira obra, confira os cadastros abaixo, **nesta ordem**. Quase todos têm **Importar** (planilha CSV conferida linha a linha antes de gravar), útil para trazer dados de planilhas antigas.

| # | O quê | Onde | Por que importa |
|---|---|---|---|
| 1 | Perfis de acesso | `Admin → Controle de Acesso → Perfis de Acesso` | Define o que cada grupo de pessoas vê e faz |
| 2 | Processos | `Departamento Pessoal → Cadastros → Processos` | Classificam equipes, contratos, obras e serviços |
| 3 | Funções | `Departamento Pessoal → Cadastros → Funções` | Usadas em colaboradores e metas de inspeção |
| 4 | Centros de custo | `Financeiro → Cadastros → Centros de Custo` | Obrigatório na base e na obra |
| 5 | Bases operacionais | `Execução → Cadastros → Bases Operacionais` | Centro de custo e área de atuação (coordenadas e raio) |
| 6 | Municípios | `Execução → Cadastros → Municípios` | Base responsável por cada município |
| 7 | Colaboradores | `Departamento Pessoal → Cadastros → Colaboradores` | Quadro de pessoal: base, processo, função |
| 8 | Usuários | `Admin → Controle de Acesso → Usuários` | Login de cada pessoa, ligado ao colaborador e ao perfil |
| 9 | Coordenadores e supervisores | `Execução → Cadastros → Coordenadores / Supervisores` | Hierarquia das equipes e das obras |
| 10 | Tipos de equipe | `Execução → Cadastros → Tipos de Equipe` | Ex.: linha viva, construção, emergência; jornada padrão |
| 11 | Veículos | `Frota → Frota e condutores → Veículos` | Necessário para vincular à equipe |
| 12 | Equipes | `Execução → Cadastros → Equipes` | Base, veículo, coordenador, supervisor, contrato e membros |
| 13 | Contratos, ações e valores | `Financeiro → Cadastros → Contratos / Ações / Ações x Valores` | Valor de cada serviço por contrato e vigência |
| 14 | Kits construtivos | `Execução → Cadastros de Obras → Kits Construtivos` | Base do planejamento e do valor da obra |
| 15 | Metas de faturamento | `Execução → Cadastros → Metas de faturamento` | Meta das equipes no boletim, nos turnos e na programação |
| 16 | Status de obras, agentes, tipos de anexo, checklists | `Execução → Cadastros de Obras` | Etapas da obra, fiscais, tipos de documento e modelos da documentação técnica |
| 17 | Materiais e estoques | `Almoxarifado → Cadastros` | Catálogo de materiais e almoxarifados de atendimento |

### 4.1 Como cadastrar um usuário

1. `Admin → Controle de Acesso → Usuários` → **Novo usuário**.
2. Bloco **Acesso**: **Login**, **Senha**, **Perfil de acesso**, **Tipo** (Administrativo ou Campo), **E-mail**, **Telefone**, **Acesso ativo**.
3. Bloco **Colaborador**: escolha **Colaborador já cadastrado** ou **Cadastrar novo colaborador** (primeiro e último nome, CPF, data de contratação, base, processo, função).
4. Bloco **Preferências** (opcional): tema, cor principal.
5. Salve. A pessoa já pode entrar.

**Avisos:** usuários de **Campo** são os que usam o app mobile. Na edição, **Nova senha** em branco mantém a senha atual.

### 4.2 Como montar um perfil de acesso

1. `Admin → Controle de Acesso → Perfis de Acesso` → **Novo perfil**.
2. Informe o **Nome** (ex.: SUPERVISOR OBRAS) e deixe **Perfil ativo** ligado.
3. Em **Permissões**, marque o que o perfil pode ver e fazer em cada módulo (leitura, escrita, execução, aprovação).
4. Salve e atribua o perfil aos usuários.

> As permissões avulsas ficam em `Admin → Controle de Acesso → Permissões`, no formato MÓDULO:RECURSO:AÇÃO. Normalmente não é preciso mexer nelas.

### 4.3 Como cadastrar uma equipe

1. `Execução → Cadastros → Equipes` → **Nova equipe**.
2. **Identificação**: **Código**, **Tipo**, **Base**, **Equipe ativa**.
3. **Operação**: **Veículo**, **Contrato** (só contratos vigentes), **Jornada** e **Tempo de plataforma** (em branco, usam os do tipo de equipe).
4. **Hierarquia**: **Coordenador** e **Supervisor**. O supervisor precisa responder ao coordenador da equipe.
5. **Membros**: escolha **Colaborador** e **Função na equipe** → **Adicionar membro**. A equipe precisa de um **Responsável**.
6. Salve.

### 4.4 Como cadastrar a meta de uma equipe

1. `Execução → Cadastros → Metas de faturamento` → **Nova meta**.
2. **Equipes**: pode escolher várias; a mesma meta é criada para cada uma.
3. **Meta por janela** (valor), **Apuração** (por mês ou pelo ciclo de 26 a 25), **A partir de** / **Até**, **Descrição**.
4. Ligue **Substituir a meta atual das equipes** para encerrar a meta anterior no fim do período anterior (o histórico continua nos relatórios).

# Parte 2: a obra de ponta a ponta

## 5. Cadastros de Obras

O que só a obra usa fica em `Execução → Cadastros de Obras`. Confira estes cadastros antes de lançar a primeira obra.

### 5.1 Como cadastrar um kit construtivo

1. `Execução → Cadastros de Obras → Kits Construtivos` → **Novo kit**.
2. **Código**, **Descrição**, **Contrato**, **Grupo**, **Classes de tensão** (sem seleção vale para todas).
3. Em **Itens**, adicione serviços (**Ação do contrato**) e materiais (**Material**), com **Operação** (Instalar/Retirar) e **Quantidade por kit**.
4. Salve.

**Avisos:** o valor do kit soma só os serviços. Kit sem itens fica cadastrado, mas não pode ser aplicado. "Sem valor vigente" indica serviço sem valor em `Ações x Valores` na data.

### 5.2 Status, agentes responsáveis e tipos de anexo

| Cadastro | Caminho | Campos |
|---|---|---|
| **Status de Obras** | `Execução → Cadastros de Obras → Status de Obras` → **Novo status** | **Nome**, **Ordem de exibição** (posição no painel) e **Este status conclui a obra** |
| **Agentes Responsáveis** | `Execução → Cadastros de Obras → Agentes Responsáveis` → **Novo agente** | **Nome**, **Empresa / órgão**, **Telefone / celular** e **E-mail** |
| **Tipos de Anexos** | `Execução → Cadastros de Obras → Tipos de Anexos` → **Novo tipo** | **Nome** e **Descrição / finalidade** (ex.: projeto, ART, licença) |

Status que concluem a obra também a encerram para a programação (ver 6.3).

### 5.3 Checklists da documentação

Os modelos definem as perguntas da visita prévia e da ficha As Built, e as fotos que o book pede em cada ponto.

1. `Execução → Cadastros de Obras → Checklists da Documentação` → **Novo modelo**.
2. Escolha a **Finalidade** (**Visita prévia** ou **Ficha As Built**) e preencha **Título** e **Descrição**.
3. **Adicionar grupo** organiza as perguntas. **Adicionar pergunta** cria cada item, com o tipo de resposta: Escolha única, Múltipla escolha, Texto, Número ou Data.
4. Em cada pergunta, defina se ela **Aceita "Não se aplica"** e qual é a **Resposta conforme**.
5. No modelo de Ficha As Built, **Adicionar foto pedida** lista as fotos de cada ponto. Marque as obrigatórias.
6. **Salvar modelo**.

**Aviso:** "Modelo em uso" indica que o modelo já tem lançamentos. Dá para mudar título e descrição. Para mudar perguntas e fotos, duplique o modelo: o que já foi lançado continua como foi respondido.

## 6. Carteira e ficha da obra

### 6.1 Como cadastrar uma obra

1. `Execução → Obras → Nova Obra`.
2. **Identificação**: **Número da obra** e **Título da obra** (obrigatórios), **Nota da obra**, **Descrição / escopo técnico**.
3. **Enquadramento**: **Processo de negócio**, **Base operacional**, **Município**, **Centro de custo** (obrigatórios).
4. **Responsáveis**: **Supervisor** e **Coordenador** (obrigatórios); **Agente responsável** (fiscal da concessionária).
5. **Prazo e valor**: **Data de início**, **Previsão de término**, **Status**, **Valor do projeto**.
6. **Execução**: **Equipes de campo**. Se for subprojeto, marque **Esta obra é de KIT ou medidor** e escolha **Obra principal** e **Tipo de vínculo**.
7. **Localização**: **Capturar GPS**, **Escolher no mapa** ou digite **Latitude** e **Longitude**.
8. Salve. A ficha da obra abre.

**Depois:** sem coordenadas, a ficha não mostra mapa, deslocamento nem obras próximas. Sem contrato na carteira (6.3), o planejamento mostra kits de todos os contratos.

**Para muitas obras de uma vez:** `Painel de Obras` → **Importar** → escolha **Cadastro de obras**, **Carteira do contrato** ou **Serviços e orçamento previstos**. Obras existentes são atualizadas pelo número (célula vazia mantém o valor atual). A importação não altera planejamento, programação nem medições.

### 6.2 Como encontrar e acompanhar obras

1. `Execução → Obras → Painel de Obras`.
2. Filtre por **Status**, **Base operacional**, **Município**, **Supervisor**, **Coordenador**, **Agente responsável**, datas de início e previsão de fim, valor. **Hierarquia** separa obras principais de subprojetos.
3. Os cartões **Obras no recorte**, **Valor de projeto**, **Material previsto** e **Serviço previsto** somam o recorte.
4. Clique na obra para abrir a ficha. O ícone de status na linha abre **Alterar status da obra**.
5. **Exportar CSV**: **Listagem resumida** ou **Relatório completo**.

### 6.3 A ficha da obra

Barra de ações no rodapé da ficha:

| Botão | O que faz |
|---|---|
| **VOLTAR** | Volta ao painel |
| **PLANEJAR** | Abre o planejamento sobre o projeto (seção 8) |
| **COPILOTO** | Abre o assistente com o contexto da obra |
| **DEVOLVER MATERIAIS** | Nova devolução de material desta obra |
| **SOLICITAR MATERIAIS** | Nova solicitação de material já com a obra preenchida |
| **IMPRIMIR** | Ficha da obra para impressão |
| **Atualizar obra** | Edita o cadastro |

O que a ficha mostra:
- **Prazo**: linha do tempo com início, previsão, prazo regulado, conclusão e hoje.
- **Indicadores**: valor de projeto, material e serviço previstos, **Deslocamento da base**, solicitações de material, **Pontos de atenção**.
- **Pontos de atenção**: avisos como **Visita prévia não realizada**, **Sem equipe alocada**, **Nenhum material solicitado**, **Obra sem contrato**, **Sem orçamento importado** e **Sem coordenadas**, além de alertas de prazo. Eles orientam, mas não bloqueiam nada.
- **Materiais da obra**: saldo em campo, solicitações e movimentações.
- **Programação**, **Orçamento previsto**, **Documentação técnica**, **Anexos**, **Subprojetos**, **Localização** (com **Obras próximas** num raio de 5 a 50 km), **Histórico do status** e **Equipes**.

**Como registrar a mudança de status:** **Registrar status** → **Novo status**, **Data de conclusão** (em branco vale hoje), **Observação** → **Registrar status**. A observação fica no histórico e pode ser registrada mesmo sem trocar o status.

**O que muda o status sozinho:** o primeiro apontamento de execução coloca a obra em **EM EXECUÇÃO**. As demais trocas são manuais. Obra em status que conclui não pode ser programada e sai da lista **Obras a programar**. A medição não depende do status.

**Como preencher a carteira:** **Editar carteira** → **Contrato** (define os kits disponíveis no planejamento), **Classe de tensão** (filtra os kits), **Prioridade**, **Prazo regulado**.

**Como anexar documentos:** **Adicionar anexo** → escolha o tipo (projeto, ART, licença…) e o arquivo.

## 7. Visita prévia

A visita prévia (pré-vistoria) é o checklist feito no local antes da execução, para levantar acesso, interferências e necessidades da obra. É recomendada e não impede programar nem executar.

### 7.1 Como registrar a visita

1. Na ficha da obra, em **Documentação técnica**, clique em **Registrar visita**.
2. Escolha o **Modelo**, a **Data da visita** e o **Responsável** (busca pelo nome do colaborador).
3. Responda o checklist. **Progresso do checklist** mostra o que falta e **Só pendentes** esconde o que já foi respondido.
4. Se ajudar, anexe evidências: em cada pergunta, **Adicionar evidência**; para o local como um todo, **Evidências gerais**. Aceita fotos (JPG ou PNG) e PDFs, por **Anexar** ou **Tirar foto**. Nenhuma pergunta exige evidência.
5. Use **Observações** para combinados e restrições. Clique em **Salvar visita**.

**O que acontece depois:** a visita aparece na ficha com data, responsável, modelo, não conformidades e evidências. O aviso **Visita prévia não realizada** some dos pontos de atenção.

**Ações de cada visita:** baixar o PDF, corrigir ou remover.

**Avisos:** "Nenhum modelo ativo" pede um modelo de visita prévia (ver 5.3). Se alguma evidência não for enviada, a visita fica salva e o aviso diz quantas faltaram: abra a visita e anexe de novo.

## 8. Planejamento sobre o projeto

O planejamento (levantamento) marca pontos, vãos e kits sobre o PDF do projeto. É ele que forma o previsto da obra e alimenta a programação.

### 8.1 Como planejar a obra sobre o projeto (levantamento)

1. Na ficha da obra, clique em **PLANEJAR**.
2. Se a obra não tem projeto, envie o PDF (**Tipo de documento**, **Arquivo PDF** até 50 MB → **Enviar projeto**) ou escolha **Usar um PDF já anexado**.
3. Em **Como quer começar?**:
   - **Marcar na folha**: com a ferramenta **Ponto**, clique em cada poste. O número segue a sequência; confirme com Enter.
   - **Planejar com Copiloto**: o assistente lê os pontos numerados da página. Em **Revisar leitura**, aceite ou descarte cada ponto e vão; informe a metragem dos vãos. **Ver última leitura** reabre a análise.
4. Ferramentas da folha: **Mão** (arrastar), **Ponto**, **Vão** (liga dois pontos), **Anotar**, **Selecionar**, **Área**, **Ler texto** (copia texto do PDF). Há troca de página, giro de 90°, zoom e **Esmaecer o desenho**.
5. Clique num ponto para ajustar **Número**, **Tipo**, **Barramento**, execução (**Sem deslig.** / **Com deslig.**), **Tem poda**, **Tem aterramento**. Botões **Mover**, **Conectar**, **Detalhes**, **Excluir ponto**. No vão, ajuste a **Metragem** (os itens em metro dos kits acompanham).
6. **Aplicar kit**: selecione pontos/vãos → **Aplicar kit** → busque o kit por código ou descrição, escolha **Instalar** ou **Retirar**, a **Quantidade** → **Aplicar**.
7. O painel lateral mostra a árvore **Pontos, kits e vãos** e as abas **Kits construtivos** e **Orçamento**.

**Cores dos locais:** **Sem kit**, **Pendente**, **Programado**, **Atrasado**, **Em andamento**, **Concluído**.

**Avisos:** item já programado ou executado não pode ser alterado nem removido. Kit aparece como **Já executado** quando foi feito antes do sistema. Se o PDF não abrir, o arquivo pode estar corrompido: substitua o projeto.

## 9. Pré-fechamento do levantamento

O pré-fechamento confere o levantamento de cada obra: uma obra só tem o levantamento concluído quando tem pontos e nenhum ponto ou vão sem kit. Assim o valor planejado fica completo. É uma conferência recomendada antes de programar e medir: o sistema não exige o levantamento concluído para isso.

### 9.1 Como conferir e concluir o levantamento

1. `Execução → Medição e Fechamento → Pré-fechamento`. A tela abre nas obras com levantamento pendente.
2. Indicadores: **Obras em aberto**, **Levantamento pendente**, **Prontas para concluir** (com pontos e nada sem kit), **Pontos sem kit** e **Vãos sem kit**. Os três primeiros filtram a lista.
3. Filtre por **Situação do levantamento** (**Pendente**, **Pronto para concluir**, **Sem levantamento**, **Concluído**), **Pendência**, **Base operacional**, **Município**, **Supervisor**, **Status da obra**, **Prioridade**, **Levantador** e **Tipo de execução**.
4. Colunas: pontos, vãos, **Pendências**, execução (com ou sem desligamento), **Levantadores** e situação do levantamento.
5. Clique na obra para abrir o planejamento e aplicar os kits que faltam.
6. Quando a obra estiver pronta, use **Concluir levantamento** na linha. O botão fica desativado enquanto houver pendência.
7. Precisa corrigir depois? **Reabrir levantamento** devolve a obra à conferência.

**Aviso:** "Ponto sem vão" só informa. Um poste novo sem rede pode estar correto.

## 10. Materiais da obra

O material da obra corre pelo Almoxarifado, mas nasce e é acompanhado na ficha.

1. **Pedir:** na ficha da obra, **SOLICITAR MATERIAIS** abre a solicitação já com a obra preenchida (ver 16.1). O recomendado é pedir com 48 horas de antecedência.
2. **Acompanhar:** o almoxarifado separa e entrega (ver 16.3). O bloco **Materiais da obra** na ficha mostra saldo em campo, solicitações e movimentações.
3. **Devolver:** **DEVOLVER MATERIAIS** registra o que voltou, como novo ou sucata (ver 16.4).

O **saldo da obra** é o material entregue menos o aplicado e o devolvido.

## 11. Programação

Programar é alocar os itens planejados a uma equipe num período. A partir daí a obra tem data, responsável e valor congelado.

### 11.1 Como programar uma equipe (Nova programação)

Há dois caminhos. Os dois abrem o mesmo painel **Programar**.

**A. Direto na agenda**
1. `Execução → Programação e Campo → Agenda de Programação` → **Nova programação**.
2. Em **Obra e pontos**, busque a obra pelo número ou título. As obras com serviço por programar aparecem primeiro, com o valor pendente.
3. Marque os pontos e vãos a programar (**Marcar todos** / **Desmarcar**). Para escolher item a item, use **Abrir o planejamento**.
4. Siga para o passo 4 do caminho B.

**B. Pelo planejamento da obra**
1. Na ficha da obra → **PLANEJAR**.
2. Selecione os pontos/vãos ou itens pendentes (dica: **Selecionar tudo o que está pendente** na árvore).
3. Clique em **Programar**.
4. Em **O que será programado**, confira os itens e a **Descrição do planejamento**.
5. **Período**: **Início** e **Fim**. O sistema avisa se o período não tem dia útil.
6. **Condições da intervenção** (obrigatórias a cada programação): **Linha viva**, **Desligamento**, **Finaliza obra**, **Turno**, **Situação da intervenção**, **Observação**.
7. **Equipe**: escolha a equipe. Para cada uma, o sistema mostra a projeção: capacidade por dia, dias úteis, meta por dia útil, meta do período, já programado, esta programação e **% da meta**.
8. Clique em **Programar**.

**O que acontece depois:** a programação aparece na agenda da equipe. Os itens passam a **Programado** no planejamento. O valor dos serviços fica **congelado**: é esse valor que conta no realizado e na medição. A equipe recebe a programação no app (aba **Obras**), também sem sinal, e é avisada quando ela muda. Informe o **horário do desligamento** e o **número da manobra** quando houver desligamento: a equipe vê na ficha da obra. Obra sem coordenada nem endereço gera o aviso "a equipe não terá Como chegar no app".

**Avisos comuns:** "Escolha a obra, os pontos do planejamento, o período e a equipe." e "Marque ao menos um ponto ou vão." aparecem quando falta algo. Na lista **Obras a programar** da agenda, o botão **Programar** de cada obra abre o mesmo painel já com a obra escolhida.

### 11.2 Como usar a Agenda de Programação

1. `Execução → Programação e Campo → Agenda de Programação`.
2. Escolha a forma de ver: **Tabela**, **Semana** ou **Mês**. **Hoje** volta para a data atual.
3. Use a busca (obra ou equipe) e os filtros: obra, município, **Prioridade da obra**, base, tipo de equipe, equipe, supervisor, coordenador, **Disponibilidade** (Todas / Com programação / Livres no período), **Situação**, turno, linha viva, desligamento, finaliza obra, situação da intervenção.
4. O atalho **Em aberto** mostra programadas, em execução e atrasadas, ou seja, o que ainda pede ação.
5. Na visão Semana/Mês, **arraste a barra** para mudar o dia ou a equipe e **estique pelas pontas** para mudar a duração. `Esc` cancela. Após mover, aparece **Desfazer**.
6. **Conflito** indica duas programações nos mesmos dias e turnos. **Livre no período** marca equipe sem programação.

**Indicadores:** **Programações no período**, **Atrasadas** (inclusive de períodos anteriores), **Equipes livres**, **Obras a programar** (as de prazo mais curto primeiro).

### 11.3 Como acompanhar, editar, reprogramar ou cancelar uma programação

1. Na agenda, clique na programação. Abre o painel de detalhe.
2. O topo resume **Equipe**, **Período**, **Valor congelado** e as condições da intervenção.
3. **Programado × realizado** mostra o que a equipe já apontou (ao valor congelado) e os serviços concluídos.
4. Atalhos: **Abrir obra**, **Planejamento**, **Histórico completo**, **Copiar para a equipe**.
5. Ações:
   - **Editar**: corrige descrição, condições e observação.
   - **Reprogramar**: **Novo período** e/ou nova **Equipe** com **Motivo da reprogramação** (ex.: desligamento negado na data original). O valor congelado não muda.
   - **Cancelar programação**: pede **Motivo do cancelamento**. Os itens sem execução voltam a pendentes e a obra volta para a lista do que falta programar.
   - **Excluir**: remove a programação.
   - Retirar um item: o item volta a pendente; sem serviço do kit, os materiais dele saem junto.
6. As seções **Notas** e **Histórico** mostram descrição, observação e todas as mudanças.

### 11.4 Como consultar o histórico de programação

1. `Execução → Programação e Campo → Histórico de Programação`.
2. Escolha **Linha do tempo** ou **Tabela**.
3. Filtre por **Tipo de evento** (criações, edições, reprogramações, cancelamentos, exclusões), **O que mudou** (Qualquer mudança / Trocou de equipe / Mudou o período), **Obra**, **Equipe** (de origem ou destino), **Usuário**, **Programação nº** e período da alteração.
4. A busca procura em obra, equipe, número da programação, usuário ou motivo.

Cada evento mostra data e hora, equipe de origem e de destino, período original e novo, quem alterou e o motivo.

### 11.5 Painel de Programação

`Execução → Relatórios → Painel de Programação`. Responde: o programado virou execução? O que mudou e por quê? Quem está livre? O que falta programar?

1. Escolha o período (**Este mês**, **Mês passado**, **Esta semana**, **Próximos 30 dias**, **Últimos 90 dias** ou **Até**), **Base operacional**, **Tipo de equipe**. **Atualizar** recarrega.
2. Leia o bloco **O que pede atenção na programação**.
3. Indicadores: **Cumprimento**, **Realizado × programado**, **Reprogramações**, **Ocupação das equipes**, **Obras a programar**.
4. Gráficos e listas:
   - **Programado e realizado no tempo** (clique numa barra para abrir a agenda) e **Programações por situação**.
   - **Próximos 14 dias**: equipes ocupadas e livres a cada dia, com marcação de desligamento e linha viva.
   - **Ocupação por equipe** (ordenar por ocupação, valor ou atrasos; **Programar** para equipe livre).
   - **Por que a agenda muda**: motivos informados em reprogramações e cancelamentos, e **Obras que mais mudaram** (botão **Histórico**).
   - **Atrasadas** (passaram do fim sem concluir) e **Planejadas sem programação**.
   - **Por base operacional** (clique numa base para filtrar o painel).
5. **Nova programação** está disponível no próprio painel.

## 12. Campo: turnos, APR e acompanhamento

Em campo, quem registra é a equipe. A web acompanha e analisa: as telas abaixo são de leitura.

Os registros chegam do app da equipe (seção 12.4). Sem sinal, eles ficam no aparelho e chegam quando a equipe volta a ter conexão, com a hora em que foram feitos.

**A regra da APR.** A APR é a análise preliminar de riscos, feita por quem vai executar, antes do serviço. Uma APR concluída no dia já libera todos os serviços da equipe naquele dia; a equipe pode fazer outras ao longo do dia (por exemplo, ao chegar a uma obra com outra condição). Sem nenhuma APR concluída no dia, nada pode ser apontado. Se a equipe registrar que não há condição de executar numa obra, aquela obra fica bloqueada até uma APR dela concluída depois.

### 12.1 Como acompanhar os turnos das equipes

1. `Execução → Programação e Campo → Turnos`.
2. Filtre por **Equipe**, **Obra**, **Base operacional**, **Status** (Em turno / Encerrado), **Meta do dia** (Bateu a meta / Não bateu a meta) e datas de abertura.
3. Indicadores: **Turnos**, **Em andamento**, **Bateu a meta**, **Sem relatório**, **Com ocorrências**, **Serviços executados**.
4. Clique num turno para ver:
   - **Realizado no turno** contra a meta, início, fim e duração.
   - **Serviços do dia**: o programado, a situação da **APR** (pendente, em preenchimento, concluída) e o executado com quantidade e valor. **Ver APR** mostra atividade, local, riscos, medidas de controle, participantes, verificações e documentos.
   - **Equipe** (líder, substituto e componentes), **Ocorrências**, **Relatório diário** e **Fotos do dia**.

**Avisos:** "Encerrado pelo sistema" (o turno ainda estava aberto no horário de corte), "Aberto desde outro dia" (quase sempre turno esquecido) e "Execução apontada neste turno sem APR concluída da obra".

### 12.4 O dia da equipe no app

O encarregado usa o app no tablet ou no celular. Tudo funciona sem sinal; o que foi lançado vai sozinho quando a conexão volta, uma vez só e na ordem.

1. **Hoje** mostra o **Próximo passo** num botão só e as obras do dia na ordem da programação, com as condições (desligamento com horário e manobra, linha viva, finaliza obra).
2. **Abrir turno**: veículo e pessoas vêm do último turno; confira e abra (também sem sinal).
3. Na ficha da obra: endereço, **Como chegar** (abre o app de mapas), **Cheguei**/**Saí** e o material previsto contra o saldo do caminhão ("faltam 2"). A equipe não pede material pelo app: se faltar, registra uma ocorrência de material.
4. **APR** em passos (uma no dia libera todos os serviços; outras são opcionais): os riscos e as medidas das condições já vêm marcados para conferir; todos assinam na tela do encarregado. Se não houver condição, **Sem condição de executar** registra o motivo e o Hoje passa para o próximo serviço.
5. **Pontos e projeto**: o projeto em PDF com os pontos coloridos (a fazer, parcial, feito). **Tudo feito** aponta o ponto inteiro; **Parcial** pede as quantidades. As fotos do modelo saem com carimbo (obra, ponto, data, GPS); foto faltando vira pendência e não bloqueia nada. A série do equipamento pode ser lida pelo QR.
6. **Fechar o dia**: o relatório vem montado com obras, pontos feitos, ocorrências e pendências; revise e feche o turno.

Se o servidor recusar um registro (por exemplo, a programação foi cancelada enquanto a equipe estava sem sinal), o Hoje mostra o motivo e o caso fica com o backoffice em **Sincronização**.

**O supervisor no app** tem a aba **Obras**: a situação de cada equipe agora (a caminho, na obra, executando, parada, sem condição), a visita prévia e o pedido de As Built e de book.

### 12.2 Como ver o boletim do dia

1. `Execução → Relatórios → Boletim das Equipes`.
2. Escolha o **Dia** (ou **Hoje**), **Base operacional** e **Tipo de equipe**. **Atualizar** recarrega.
3. Indicadores: **Turnos do dia**, **Executado no dia**, **APR pendente**, **Agendamento sem turno** (equipe programada que não abriu turno).
4. Gráfico **Executado × programado por equipe** e tabela **Programação do dia** (clique para ver os itens).
5. Cartões das equipes: agrupe por base, tipo de equipe ou meta do dia; veja como **Cartões** ou **Miniaturas**; filtre Todas / Em turno / Encerradas / Sem turno. Cada cartão mostra veículo, meta do dia ("Faltam…" ou "Meta do dia batida"), programado, executado e componentes, com **Analisar equipe** e **Ver turno**.

### 12.3 Dashboard Operacional

`Execução → Relatórios → Dashboard Operacional`: produção de cada equipe de obras no período, comparada à meta, e se o ritmo atual fecha o mês.

1. Período rápido (**Este mês**, **Mês anterior**, **Últimos 7 dias**) ou **Início/Fim**; **Base operacional**, **Processo**.
2. Indicadores: **Produção no período**, **Meta das equipes**, **Obras atendidas**, **Abaixo do ritmo**.
3. Gráficos **Produção × meta** (por dia ou mês) e **Produção × meta por equipe**; tabela **Obras do período** (clique para analisar a obra).
4. Lista de equipes ordenável por **Atenção primeiro**, **Maior produção** ou **Equipe**. **Boletim de hoje** leva ao boletim.

## 13. Documentação técnica

A documentação técnica fica na ficha da obra. A visita prévia está na seção 7. Aqui estão o book, o As Built e os equipamentos.

As fotos do book chegam pelo app da equipe e também podem ser lançadas pela web. Antes da medição, revise-as (seção 13.4). A área de **Book e As Built** está em reformulação; abaixo, como a tela se apresenta hoje.

### 13.1 Book: as fotos de cada ponto

1. Na ficha da obra, no bloco **Book e As Built**, cada ponto mostra a folha, a situação de execução, as miniaturas e o que falta: **Sem fotos**, **Falta 1 foto** ou o total de fotos. Com muitos pontos, use **Mostrar** (Todos os pontos / Executados / Com foto faltando).
2. Em cada ponto, **Abrir** mostra as **Evidências**: as fotos pedidas pelo modelo e as outras fotos do ponto.
3. **Adicionar foto** aceita JPG ou PNG de até 15 MB. As fotos podem ser lançadas antes da execução.
4. Clique na miniatura para ver a foto em tamanho real, com os dados dela: quando foi tirada e lançada, por quem, coordenadas, item, legenda e etapa (**Antes**, **Durante** ou **Depois**).

Falta de foto só avisa: ela não impede gerar o documento.

### 13.4 Revisão das fotos

1. `Execução → Medição e Fechamento → Revisão de Fotos`.
2. A aba **Para revisar** mostra as fotos que as equipes mandaram, das mais antigas para as mais novas. Toque na foto para ver maior.
3. **Aprovar** libera a foto para a medição e o book. **Reprovar** pede a inconformidade (fora de foco, item errado, ângulo, ponto errado, sem carimbo ou outra) e o motivo: a foto sai da medição e volta como pendência para a equipe, que vê o motivo no app.
4. A aba **Ranking por equipe** mostra a qualidade das fotos de cada equipe nos últimos 30 dias.

O **Relatório Detalhado** da medição usa só as fotos aprovadas.

### 13.2 As Built: ficha por ponto e documento

1. Em **Abrir**, preencha a **Ficha As Built** do ponto → **Salvar ficha**. A ficha só é preenchida depois que o ponto tem execução.
2. O topo do bloco conta as fichas completas sobre os pontos executados.
3. **Gerar versão** monta o documento e o guarda em **Versões geradas**, com data e usuário, pronto para baixar.

**Avisos:** "Anexe o projeto mestre da obra para gerar o As Built" pede o projeto mestre anexado. **Fichas pendentes** lista os pontos a completar antes de gerar.

### 13.3 Equipamentos

**Marcar equipamento** registra, no ponto, o equipamento (religador ou regulador), o trafo auxiliar e uma observação. Cada marcação pode ser corrigida ou retirada da lista.

## 14. Medição

A medição leva à cobrança o que foi concluído em campo, pelo valor congelado na programação.

### 14.1 Como gerar uma medição

1. `Execução → Medição e Fechamento → Medições`, aba **A medir**. Aparecem as obras com serviço concluído e ainda não medido, a mais valiosa primeiro.
2. Indicadores: **Obras a medir**, **Valor a medir**, **Esperando medição há mais tempo**.
3. Clique na obra. O painel mostra **Valor de projeto**, **Já medido**, **Saldo** e **Pendente de medição**.
4. Em **Tipo**, escolha:
   - **Parcial**: o que está concluído até hoje, na competência do mês corrente.
   - **Por ciclo**: escolha a **Competência**; entra só o que foi concluído até o último dia dela. O painel mostra saldo anterior, já medido no ciclo e saldo após a medição.
5. Confira os **Serviços** (local, quantidade, data de conclusão, valor), escreva a **Observação** se precisar.
6. Clique em **Gerar medição · R$ …**.

**O que acontece depois:** os serviços medidos saem da lista **A medir** e não entram em outra medição. A medição aparece na aba **Medições geradas**.

**Regras:** o valor é a soma dos apontamentos pelo valor congelado na programação. Material não é medido. Kit marcado como executado antes do sistema não entra.

### 14.2 Como estornar uma medição

1. `Medições` → aba **Medições geradas** → clique na medição.
2. Confira os **Serviços medidos** → **Estornar medição**.
3. Escreva a **Justificativa** (ex.: valor contestado pela fiscalização) → **Estornar**.

Os serviços voltam a concluídos e podem entrar em outra medição. A medição estornada continua no histórico.

## 15. Fechamento e relatório detalhado

### 15.1 Como gerar o fechamento de obras

1. `Execução → Medição e Fechamento → Fechamento de Obra`.
2. Em **Códigos das obras**, cole a coluna de códigos do Excel (um por linha ou separados por vírgula).
3. **Gerar fechamento**. O resumo traz, por obra: execução, kits concluídos, **Planejado** (valor vigente hoje, só para comparar), **Executado** e **Já medido** (valor congelado) e medições. Há abas **Serviços**, **Materiais** e **Kits**.
4. **Exportar XLSX** gera abas de resumo, serviços, materiais, kits e medições, com a obra em cada linha.

### 15.2 Como montar o relatório detalhado de medição

1. `Execução → Medição e Fechamento → Relatório Detalhado`.
2. **Baixar modelo** e preencha as abas **Materiais orçados**, **Mão de obra orçada** e **Faturado**.
3. Envie em **Planilha**. Ela é lida na hora e não fica gravada.
4. Confira o resultado: **Obras reconhecidas**, **Orçado de mão de obra**, **Faturado**, **Obras com pendência**.
5. Em **Dados do relatório**: **Data de corte**, **Fiscal**, **Responsável** (vão para as assinaturas do PDF) e **Incluir as fotos do book** (deixa o pacote mais pesado).
6. Gere o pacote (Excel, PDF e fotos).

**Leitura do relatório:** cada serviço mostra orçado, executado, faturado e o que falta faturar. Serviço executado acima do orçado ou fora dele sai marcado com `*`. Códigos com e sem zero à esquerda são o mesmo item.

# Parte 3: módulos de apoio

## 16. Almoxarifado

**Na obra:** As solicitações, entregas e devoluções formam o saldo que aparece na ficha (ver seção 10).

### 16.1 Como solicitar material para uma obra

1. `Almoxarifado → Solicitações Técnicas → Nova Solicitação` (ou **SOLICITAR MATERIAIS** na ficha da obra, ou `Execução → Obras → Solicitar Materiais`).
2. **Obra e atendimento**: **Obra**, **Almoxarifado de atendimento**, **Equipe responsável**, **Responsável pelo saque**. Para alguém de fora da equipe, ligue **Saque fora da equipe**.
3. **Data prevista**: o recomendado é 48 horas. Menos que isso fica sinalizado para o almoxarifado.
4. **Ocorrência (OC/OS)** e **Observação** quando houver.
5. **Materiais**: busque o **Material**, escolha o **Tipo**, informe a **Quantidade** → **Adicionar**. Repita.
6. Salve.

**O que acontece depois:** o sistema cria uma solicitação por tipo de movimentação, cada uma com andamento próprio. Ela entra na fila do almoxarifado em **Planejamento**.

**Avisos:** sem conexão, o sistema avisa que os dados podem estar desatualizados e que criar solicitações exige reconexão. Se a resposta do servidor não for confirmada, use **Tentar Novamente** com os mesmos dados para não duplicar.

### 16.2 Como acompanhar uma solicitação

1. `Almoxarifado → Solicitações Técnicas → Gerenciar Solicitações`.
2. Escolha **Tabela**, **Quadro** (kanban) ou **Calendário** (pela data prevista; solicitações sem data não aparecem).
3. Filtre por obra, almoxarifado, equipe, **Tipo de obra** (Obra, Corretiva, Preventiva, LPT), **Status do atendimento**, **Etapa de separação**, OC/OS, **Número da reserva**, número de série, datas. **Em aberto** mostra pendentes, aprovadas e entregues em parte.
4. Marcadores: **Atrasada**, **Com pendência**, **Sem reserva**, **Saque fora da equipe**.
5. Clique para o detalhe: fluxo em 4 etapas, dados da obra, atendimento, situação (**No prazo** / **Atrasada**, **Solicitada fora do prazo**), reserva externa, quantidade solicitada e saldo pendente.

### 16.3 Como atender uma solicitação (almoxarife)

1. **Planejamento**: confirme almoxarifado, equipe, responsável pelo saque, data de saque, OC/OS, reserva e materiais → avança para **Pronto para Separação** (ou **Aguardando Agendamento**, se não houver data).
2. **Separação**: acompanhe no **Quadro** (colunas **Planejamento**, **Separação**, **Entrega & Campo**, **Recusado**).
3. **Entrega**: escolha **Entregar Tudo** ou **Entrega Parcial**, informe quantidades e números de série → **Avançar para Retirada** → confirme equipe, colaborador que retira e reserva → **Confirmar Entrega**.
4. Faltou material? Use **Pendência** e escolha o motivo.
5. Para recusar: **Rejeitar** → motivo e descrição (mínimo 5 caracteres) → **Confirmar Rejeição**. A rejeição cancela a solicitação de vez.

**Aviso:** "Conflito de versão" indica que outra pessoa alterou a solicitação ao mesmo tempo. Clique em **Recarregar e atualizar** e refaça a ação.

### 16.4 Como registrar uma devolução de material da obra

1. `Almoxarifado → Solicitações Técnicas → Nova Devolução` (ou **DEVOLVER MATERIAIS** na obra).
2. **Obra**, **Equipe responsável**, **Almoxarifado de destino**, OC/OS.
3. Para cada material: **Tipo**, **Condição** (Novo ou Sucata), **Quantidade**, **Números de série** (um por linha). **Ver saldo da obra** ajuda a conferir.
4. **Guardar no almoxarifado**: desligado, o material é devolvido e baixado na mesma operação.
5. Salve e confirme.

**Aviso:** "Material fora do saldo da obra". A diferença é lançada como entrada avulsa na obra para o saldo não ficar negativo.

### 16.5 Como transferir, dar entrada ou baixar material

Todas seguem três etapas: origem/destino → materiais → revisão.

| Operação | Caminho | Quando usar |
|---|---|---|
| **Transferências** | `Almoxarifado → Operações de Estoque → Transferências` | Mover material entre bases ou almoxarifados. Há opção de trazer todo o saldo positivo da origem |
| **Entrada Avulsa** | `Operações de Estoque → Entrada Avulsa` | Ajuste positivo: inventário, suprimento emergencial, bonificação. Pede motivo |
| **Baixa Avulsa** | `Operações de Estoque → Baixa Avulsa` | Ajuste negativo: sucata, perda, avaria. Pede motivo e justificativa (ex.: B.O., laudo) |

Material com número de série abre a janela **Gerenciar Números de Série** para escolher ou colar as séries.

**Para consultar:** `Operações de Estoque → Movimentações` lista tudo agrupado por operação. Clique na linha para o detalhe imprimível (com campos de assinatura), **VER SOLICITAÇÃO** e **VER OBRA**.

### 16.6 Como consultar o saldo de um estoque

1. `Almoxarifado → Relatórios → Saldos`.
2. Escolha o **Estoque** ou a **Equipe** (que preenche o estoque dela). **Material** é opcional.
3. **Abrir relatório**: abre em nova aba, com quantidade por material e condição.
4. Alertas: **Com saldo negativo** (material aplicado além do saldo, regularize) e **Com sucata** (aguardando devolução ou descarte).

### 16.7 Painel de solicitações

`Almoxarifado → Relatórios → Painel de Solicitações`. Escolha período, base, processo e equipe. Indicadores **Abertas**, **Atrasadas**, **Solicitações**, **Ciclo mediano (h)**, **Qtd. solicitada**, **% atendido**; leituras de atrasos e gargalos, comparação de equipes e demanda de materiais. **Exportar** em Excel ou CSV.

## 17. Frota

**Na obra:** O veículo faz parte do cadastro da equipe.

Atalhos em quase todas as telas: `/` busca, `F` filtros, `N` novo.

### 17.1 Como abrir uma ordem de serviço (OS)

1. `Frota → Manutenção → Ordens de serviço` → **Abrir OS** (ou **Abrir OS** na ficha do veículo).
2. **Veículo e problema**: **Base**, **Veículo** (ou ligue **Manutenção sem veículo** para ferramenta ou equipamento), **Itens de manutenção** (o serviço ou a peça; é por item que a repetição é contada) e **Descrição do problema**.
3. **Classificação**: **Criticidade**, **Tipo de manutenção**, **Origem**, **Motivo** (mau uso pode virar desconto do condutor).
4. **Condutor e abertura**: **Condutor no momento**, **Aberta em** (ajuste para lançar algo que já aconteceu), **Veículo parado**.
5. **Oficina e fornecedor**: **Onde será feito**, **Fornecedor** (pode ficar para depois).
6. Salve.

**Avisos:** "Manutenção recente nesta placa" indica o mesmo item feito há pouco tempo. Com **Veículo parado** ligado, o veículo fica em manutenção e o tempo parado conta para a disponibilidade.

### 17.2 Como conduzir a OS até o fim

1. Abra a OS (lista, **Quadro de OS** ou **Agenda da frota**).
2. **Iniciar serviço** → **Alterar previsão** se mudar o prazo → **Concluir** (valor total, serviço realizado, itens substituídos).
3. Precisa comprar peça ou pagar oficina? Em **Orçamentos no financeiro**, use **Solicitar compra** ou **Solicitar pagamento**. A aprovação acontece no Financeiro.
4. **Relatório** gera o documento da OS. **Cancelar OS** libera o veículo (compras em aberto no financeiro precisam ser canceladas antes).

**No Quadro de OS** (`Frota → Manutenção → Quadro de OS`), arraste o cartão entre **A agendar**, **Agendadas**, **Em execução** e **Concluídas** para agendar, iniciar ou concluir.

**Indicadores da lista:** **Pendentes**, **Agendadas**, **Em andamento**, **Veículos parados**, **Concluídas** (30 dias). Filtros úteis: **Prazo estourado**, **Veículo parado**, **Manutenção repetida**.

### 17.3 Como cadastrar um veículo e acompanhar a ficha

1. `Frota → Frota e condutores → Veículos` → **Novo veículo**. Preencha placa, base, tipo, dados do veículo, regime (próprio ou locado) e controle de uso (km ou horas).
2. Na lista, os atalhos **Roda pouco**, **Sem rastreador**, **Sem leitura**, **Sem condutor** e **Sem checklist hoje** filtram problemas.
3. Na ficha: **Abrir OS**, **Trocar condutor**, **Editar ficha** e as abas **Ficha**, **Manutenções**, **Preventiva**, **Pneus**, **Despesas**, **Seguro**, **Sinistros**, **Condutores**, **Implementos**, **Documentos**, **Odômetro** e **Uso**.

### 17.4 Como tratar as pendências do checklist do veículo

O condutor faz o checklist no app. Na web:
1. `Frota → Operação → Checklists` → aba **Pendências**.
2. Para cada problema (com fotos), decida: **Abrir uma OS**, **Resolvido na hora** ou descartar com justificativa. **Recorrente** marca problema que se repete.
3. Aba **Preenchidos**: veja o checklist completo e a análise do **Assistente** sobre as fotos ("O Assistente só aponta; quem decide é você").
4. Aba **Sem checklist hoje**: veículos que não fizeram o checklist.
5. Aba **Liberações de CNH**: **Liberar condutor** → condutor, veículo, **Dia** e **Justificativa** → **Liberar**. Vale só para aquele dia; CNH vencida ou de categoria insuficiente bloqueia só o abastecimento.

### 17.5 Como aprovar e liberar um abastecimento

1. `Frota → Operação → Abastecimentos`.
2. Aba **Para aprovar**: o gestor da placa aprova informando a quantidade.
3. Aba **Para liberar**: o administrativo libera e avisa o posto.
4. Aba **Liberados**: aguardando a equipe registrar o abastecimento no app.
5. Abastecimento fora do fluxo: **Lançar avulso**.
6. **Faturas do posto**: **Lançar fatura** (número, período, valor) e confira contra os abastecimentos do período.

**Alertas:** cada pedido pode trazer alertas de aderência (consumo fora do padrão, preço). Coluna **Aviso ao posto** mostra **Posto avisado** ou **Falta avisar**.

### 17.6 Outras tarefas da frota

| Tarefa | Caminho | Como |
|---|---|---|
| Lançar uma despesa | `Frota → Operação → Despesas` → **Lançar despesa** | Lavagem, pedágio, taxa etc. por veículo. A pagar vai ao financeiro já preenchida. **Importar planilha** para lote |
| Registrar um sinistro | `Frota → Operação → Sinistros` → **Registrar sinistro** | Acidente, furto, carga avariada, com OS de reparo e seguradora |
| Conferir KM incoerente | `Frota → Operação → Conferência de KM` | Leituras fora do padrão não contam até serem confirmadas |
| Ver veículos no mapa | `Frota → Operação → Mapa da frota` | Busca por placa, modelo ou condutor; cartão com velocidade e última posição |
| Ver eventos de condução | `Frota → Operação → Eventos de condução` | Eventos da telemetria por veículo, condutor e local |
| Acompanhar preventiva | `Frota → Manutenção → Preventiva` | **Vencidas**, **Próximas**, **Com OS aberta**, **Sem histórico**, **Em dia** |
| Controlar pneus | `Frota → Manutenção → Pneus` | **Registrar inspeção**, **Cadastrar pneu**; abas **Montagem**, **Rodízio**, **Inspeções**, **Histórico** |
| Movimentar peças | `Frota → Manutenção → Estoque da oficina` | **Entrada**, **Saída**, **Transferir**, **Ajustar**; alerta **Abaixo do mínimo** |
| Cadastrar condutor | `Frota → Frota e condutores → Condutores` → **Novo condutor** | Colaborador, CNH, validade. CNH vencida impede novo vínculo |
| Controlar documentos | `Frota → Frota e condutores → Documentos e vencimentos` | Abre nos vencidos e a vencer |
| Cadastrar apólice | `Frota → Frota e condutores → Seguros` → **Cadastrar apólice** | Seguradora, vigência, veículos cobertos, parcelas |
| Ver o que mais quebra | `Frota → Relatórios → Corretivas por serviço` | Item que se repete **Sem plano** é candidato a preventiva |
| Ajustar regras | `Frota → Cadastros → Parâmetros` | Faixas de aviso de vencimento, limites de km por dia, janela de manutenção repetida, expediente |

## 18. Segurança (SST)

**Na obra:** As inspeções são feitas sobre as equipes que executam as obras, e o modelo do formulário define o que gera desvio.

### 18.1 Como fazer uma inspeção

1. `Segurança → Minhas Ações → Nova Inspeção`.
2. Escolha **Modelo do Formulário**, **Tipo de Inspeção**, **Processo**, **Data / hora**, **Base operacional** e, se quiser, **Veículo**.
3. Adicione os inspecionados **Por Equipe** (os integrantes entram automaticamente) ou **Manualmente**.
4. O checklist é liberado quando os dados obrigatórios estão completos. O painel lista "Faltam apenas estes passos".
5. Responda cada pergunta. Resposta que gera desvio abre o **Tratamento de Desvio**: descrição do problema, **Anexar Evidência** e prazo.
6. Salve.

**Depois:** os desvios aparecem em **Meus Desvios** (para você tratar) e em **Desvios** (para a gestão).

### 18.2 Como tratar meus desvios

1. `Segurança → Minhas Ações → Meus Desvios`.
2. Atalhos **Abertos**, **Em tratamento**, **Resolvidos**, **Vencidos**.
3. Clique na linha para o **Relatório do desvio**. A chave inglesa da linha abre o tratamento direto: ação corretiva, prazo e resolução.
4. Para vários de uma vez, selecione e clique em **Tratar selecionados**.

### 18.3 Como acompanhar inspeções e desvios (gestão)

- `Segurança → Gestão → Inspeções`: filtros por tipo, formulário, processo, base, centro de custo, equipe, status, com/sem desvios e período. **Exportar** (inspeções ou desvios, resumo ou detalhado). No detalhe: **Editar Inspeção**, **Histórico**, **Imprimir**.
- `Segurança → Gestão → Desvios`: abre com os desvios abertos e em tratamento. Atalhos **Sem responsável** e **Sem prazo**.

### 18.4 Como registrar um evento de segurança

1. `Segurança → Acidentalidade → Registrar Evento`.
2. Preencha por etapas: **Ocorrência** (tipo, quando ocorreu, quando foi comunicado, classificação inicial, relato), **Contexto**, **Pessoas e impacto**, **Revisão**.
3. Registre. O evento aparece em **Eventos de Segurança**, onde pode ser aberto, editado, exportado ou importado em lote.

### 18.5 Como definir e acompanhar metas de inspeção

1. `Segurança → Cadastros → Metas de Inspeção` → **Nova meta**: **Tipo de inspeção**, **A meta vale para** (função ou colaborador; a meta individual prevalece sobre a da função), **Quantidade de inspeções**, periodicidade.
2. `Segurança → Relatórios → Acompanhamento de Metas`: veja quem cumpriu, quem está a caminho e quem ficou para trás, **Por pessoa**, **Por base** ou **Por função**. **Data de referência** mostra a situação num dia passado. Conta só as inspeções lançadas pela própria pessoa.

### 18.6 Painéis de SST

| Painel | Caminho | O que responde |
|---|---|---|
| **Dashboard de Inspeções** | `Segurança → Relatórios` | Inspeções por equipe, desvios por inspeção, dias sem inspeção, realizado × meta |
| **Dashboard de Desvios** | `Segurança → Relatórios` | Pendentes, vencidos, críticos, onde os desvios se concentram, itens que mais reprovam |
| **Dashboard de Acidentalidade** | `Segurança → Relatórios` | Eventos, lesões, dias perdidos, CAT, pirâmide de Bird, dias sem lesão por base |

**Cadastros** (`Segurança → Cadastros`): Tipos de Inspeção, **Formulários de Inspeção** (construtor: grupos, perguntas, respostas e quais opções **Geram desvio** e com qual gravidade), Metas, Atividades de SST, Classificações de Eventos, Locais e Naturezas de Lesão, Agentes Causadores.

## 19. Financeiro

**Na obra:** Contratos, ações e valores definem o preço de cada serviço dos kits. O centro de custo é obrigatório na obra.

### 19.1 Como pedir uma compra ou um pagamento

1. `Financeiro → Minhas Solicitações → Nova Compra` (ou **Novo Pagamento**).
2. **1. Modelo**: escolha o modelo do formulário → **Próximo**.
3. **2. Dados**: preencha os campos do modelo → **Revisar**.
4. **3. Revisão**: confira → **Salvar e ir para anexos**. Nesse momento o rascunho é criado.
5. **4. Documentos**: anexe orçamentos, nota fiscal, boleto, fotos.
6. **Enviar para aprovação** (ou **Continuar depois**, que deixa como rascunho).

**Depois:** acompanhe em `Minhas Solicitações → Compras` ou **Pagamentos**. Situações: Rascunho, Aguardando decisão, Aprovada, Rejeitada, Cancelada. Ao ser rejeitada, você recebe o motivo.

### 19.2 Como aprovar ou rejeitar

1. `Financeiro → Aprovações → Compras Pendentes` (ou **Pagamentos Pendentes**).
2. Abra a solicitação e escolha:
   - **Aprovar**: confirme o **Valor autorizado** (pode ser menor que o solicitado, nunca maior).
   - **Rejeitar**: escreva o que precisa mudar.
   - **Cancelar**: tira da fila sem possibilidade de reabrir.
   - **Desfazer decisão**: volta a aguardar aprovação.
3. O aprovador também pode decidir pelo **link recebido por e-mail**, sem entrar no sistema.

### 19.3 Como conferir documentos fiscais

1. `Financeiro → Gestão → Documentos`.
2. Atalhos **Vencidos**, **Aguardando conferência**, **Sem número**, **Sem solicitação**.
3. **Adicionar documento** para avulsos; os campos (valor, emissão, vencimento, competência, emissor, chave de acesso) podem ser completados na conferência.

**Outras telas:** `Gestão → Solicitações` (visão completa com muitos filtros), `Relatórios → Painel do Financeiro` (pedido × autorizado, fila de decisão, dias até a decisão, despesas sem documento), `Cadastros → Fornecedores` (homologação e bloqueio) e `Cadastros → Formulários Financeiros` (construtor dos modelos).

## 20. Departamento Pessoal: descontos em folha

**Na obra:** Colaboradores, funções e processos sustentam as equipes que executam a obra.

O desconto passa por quatro etapas: **Solicitado → Validado → Baixado → Finalizado** (ou **Rejeitado**).

### 20.1 Como lançar um desconto

1. `Departamento Pessoal → Descontos em Folha → Novo Desconto` (abre em nova aba).
2. **1. Dados do Desconto**: **Colaborador** (busca por nome ou CPF; os dados dele aparecem ao lado), motivo, data da ocorrência e descrição detalhada.
3. **2. Itens a Descontar**: material ou equipamento, categoria, valor → adicione à lista.
4. Anexe fotos ou documentos (até 15 MB por arquivo).
5. Salve.

**Aviso:** anexe evidências. O termo alerta "Sem comprovantes" e elas ajudam se o colaborador contestar.

### 20.2 Como validar, baixar e finalizar

| Etapa | Caminho | Ação |
|---|---|---|
| Validar | `Pendências → Aguardando Validação` | Confira itens e valor → **Validar desconto**. Depois disso os itens ficam congelados |
| Baixar | `Pendências → Aguardando Baixa` | **Baixar em folha** informando o valor que entrou na folha |
| Finalizar | `Pendências → Aguardando Finalização` | Imprima o termo, colete a assinatura do colaborador e **Anexar termo assinado** (PDF ou foto legível) |

Cada etapa tem como desfazer (**Desfazer validação**, **Desfazer baixa**, **Desfazer finalização**) com motivo registrado. **Rejeitar desconto** exige motivo; quem lançou recebe o aviso.

**Consultar:** `Descontos em Folha → Consulta de Descontos` (filtros e **Exportar CSV**) e `Dashboard de Descontos` (valor em aberto, dias até a validação, concentração por motivo e base).

## 21. Chamados

**Na obra:** É o canal para pedir ajuda ou reportar um problema da operação.

### 21.1 Como abrir um chamado

1. `Chamados → Autosserviço → Novo chamado`.
2. **Tópico** (define a equipe e os prazos de primeira resposta e resolução), **Assunto**, **Descrição**.
3. Revise, anexe evidências e abra. Você recebe um protocolo `CH-AAAAMMDD-…`.
4. Acompanhe em **Meus chamados**.

### 21.2 Como atender um chamado

1. `Chamados → Atendimento → Fila da central`.
2. Use os filtros **1ª resposta vencida** e **Resolução vencida** para os atrasados. A coluna Prazo mostra o limite de resolução (verde no prazo, amarelo a menos de 4 horas, vermelho vencido, cinza pausado ou cancelado).
3. Abra o chamado → **ATUALIZAR ATENDIMENTO**. Também há **REABRIR** e **CANCELAR**.

**Cadastros:** `Chamados → Cadastros → Tópicos` (equipe padrão, prioridade, SLA em horas) e **Equipes de atendimento**. Desempenho em `Chamados → Relatórios → Dashboard de Chamados`.

## 22. Comunicação

**Na obra:** O mural e o sino levam os avisos a quem opera, com prova de leitura.

### 22.1 Como ler o mural de comunicados

1. `Comunicação → Avisos → Mural de Comunicados`.
2. Cartões do topo (também filtram a lista): **No ar para você**, **Não lidos**, **Aguardando sua confirmação**.
3. Filtre por tipo (Dica de uso, Novidades da versão, Aviso, Manutenção programada, Urgente) ou use **Buscar no mural** (título e resumo).
4. Em cada cartão:
   - **Ler** abre o comunicado completo num painel lateral, com vídeo e anexos. A abertura fica registrada para quem publicou.
   - **Li e entendi** confirma a leitura, direto no cartão ou no painel. É a prova de comunicação usada em auditorias.
   - **Não exibir mais** tira o comunicado do seu mural (os colegas continuam vendo).
5. Marcadores: **Em destaque**, **Novo**, fixado no topo, **Leitura confirmada**, **Confirmação pendente**.

Comunicados que exigem confirmação ficam em destaque até você confirmar.

### 22.2 Como publicar um comunicado

1. `Comunicação → Cadastros → Comunicados` → **Novo comunicado** (ou **Gerenciar comunicados** no mural).
2. Siga as etapas:
   - **Conteúdo**: **Tipo do comunicado**, **Título**, **Resumo** (aparece no cartão), **Conteúdo** (aceita negrito, listas e links).
   - **Apresentação**: onde o aviso aparece (mural, sino), fixar no topo, prioridade da notificação, link de vídeo.
   - **Público-alvo**: por perfil de acesso, tipo de usuário (Administrativo ou Campo) ou usuários; **Adicionar segmento** combina critérios. Defina se exige **Confirmação de leitura**.
   - **Revisão e anexos**: prévia e arquivos.
3. **PUBLICAR AGORA**, ou deixe como rascunho e publique depois pela lista (**Publicar**: **Início da vigência** em branco publica agora; com data futura, entra no ar quando a janela começar; **Fim da vigência** em branco fica até arquivar).

**Ciclo de vida:** Rascunho (tudo pode mudar, nada foi entregue) → Publicado (Agendado ou No ar) → Arquivado (não pode mais ser editado).

**Como saber quem leu:** na lista, ação **Relatório de confirmação**: destinatários, quantos confirmaram, visualizaram, cobertura, e quem abriu sem confirmar ou nunca abriu.

### 22.3 Notificações e preferências

- `Comunicação → Avisos → Minhas Notificações`: filtros por categoria, prioridade, **Apenas não lidas**, **Incluir arquivadas**; **Marcar todas como lidas**, **Arquivar lidas**. Clique para abrir o registro de origem.
- `Comunicação → Configurações → Preferências de Notificação`: escolha, por assunto, receber **No sistema** e/ou **Por e-mail** → **SALVAR**. Avisos de prioridade crítica chegam sempre.

## 23. Copiloto (assistente de IA)

**Na obra:** Lê o projeto em PDF no planejamento e abre com o contexto da obra na ficha.

### 23.1 Como conversar com o Copiloto

1. Clique em **Copiloto** no topo do menu.
2. Veja em **O que posso fazer** o que está disponível na sua sessão (consultar dados, analisar resultados, dashboards, relatórios PDF, planilhas, leitura de arquivos, entre outros) e use **Experimente uma pergunta** se quiser um exemplo.
3. Escreva na caixa **Mensagem para o Copiloto** e pressione Enter (Shift+Enter quebra linha). O clipe anexa PDF, planilhas, CSV, DOCX ou imagens.
4. Gráficos, tabelas e relatórios gerados abrem no painel de artefatos.
5. **Nova conversa** começa outro assunto. As conversas anteriores ficam na lista à esquerda.

**Regras de segurança:** o Copiloto só vê o que você pode ver e só grava no NEXO depois que você confirma no cartão. Confira decisões importantes nos módulos de origem.

### 23.2 Copiloto nas telas

- **Analisar com Copiloto** nos painéis (Dashboard Operacional, Boletim, painéis de SST, Financeiro, Descontos, Chamados, Almoxarifado): o assistente abre ao lado com o período e os filtros da tela.
- **COPILOTO** na ficha da obra e **Planejar com Copiloto** no planejamento (leitura do projeto em PDF).
- Na frota, o **Assistente** analisa as fotos do checklist e do abastecimento.

### 23.3 Como conectar outro assistente de IA ao NEXO

1. Perfil → **Conectar sua IA** (ou o botão equivalente no workspace do Copiloto).
2. **Conectar uma IA** e siga o guia, ou **Gerar chave de acesso**.
3. Em **Suas conexões**, veja cada aplicativo, o que pode fazer e o último uso; **Desconectar** encerra o acesso. Administradores veem também as conexões **Da empresa**.

## 24. Administração

**Na obra:** Os perfis definem quem planeja, programa, mede e fecha.

| Tarefa | Caminho | Observação |
|---|---|---|
| Criar e editar usuários | `Admin → Controle de Acesso → Usuários` | Ver 4.1. **Importar** aceita planilha com senhas (só processa sem linhas com erro) |
| Ajustar perfis | `Admin → Controle de Acesso → Perfis de Acesso` | Ver 4.2 |
| Consultar permissões | `Admin → Controle de Acesso → Permissões` | Catálogo MÓDULO:RECURSO:AÇÃO |
| Corrigir dados recusados do app | `Admin → Controle de Acesso → Sincronismo` | Registros do app que o servidor recusou: o que aconteceu, o que fazer e o reenvio. Ajuste só o que estiver errado |
| Ver a saúde do sistema | `Admin → Sistema → Status do Sistema` | Somente leitura, alimentado por um monitor independente |

# Parte 4: consulta rápida

## 25. Glossário

| Termo | Significado no NEXO |
|---|---|
| **Obra** | Unidade da carteira, identificada pelo número; tem processo, base, município, responsáveis, prazo, valor e localização |
| **Subprojeto** | Obra vinculada a uma obra principal (ex.: obra de KIT ou medidor) |
| **Carteira** | Dados contratuais da obra: contrato, classe de tensão, prioridade, prazo regulado, lote |
| **Agente responsável / Fiscal** | Pessoa da concessionária ou de órgão que acompanha a obra |
| **Planejamento / Levantamento** | Marcação de pontos, vãos e kits sobre o PDF do projeto; gera o previsto da obra |
| **Projeto mestre** | PDF principal do projeto da obra; é exigido para gerar o As Built |
| **Levantador** | Usuário que lançou pontos, vãos ou kits no planejamento |
| **Ponto** | Local numerado do projeto (normalmente um poste) |
| **Vão** | Trecho entre dois pontos, com metragem |
| **Kit construtivo** | Conjunto padrão de serviços e materiais (instalar ou retirar) por contrato e tensão; o valor soma só os serviços |
| **Pré-fechamento** | Conferência do levantamento: a obra precisa ter pontos e nenhum ponto ou vão sem kit para ter o levantamento concluído |
| **Programação** | Alocação de itens planejados a uma equipe num período, com turno e condições da intervenção |
| **Agenda de Programação** | Tela onde se cria, vê e ajusta as programações por equipe |
| **Valor congelado** | Valor dos serviços fixado ao programar; é o que conta no realizado e na medição |
| **Reprogramação** | Mudança de período ou de equipe de uma programação, com motivo; fica no histórico |
| **Linha viva / Desligamento** | Condições da intervenção, informadas em toda programação |
| **Turno** | Jornada da equipe no dia: abertura, composição, apontamentos e fechamento |
| **APR** | Análise Preliminar de Risco feita pela equipe antes de executar: atividade, riscos, medidas de controle, participantes; sem ela o serviço não pode ser apontado |
| **Boletim das equipes** | Visão do dia: quem está em turno, APR, programado × executado × meta |
| **Meta de faturamento** | Quanto cada equipe deve produzir por mês ou ciclo (26 a 25) |
| **Medição** | Serviços concluídos levados à cobrança: **Parcial** (até hoje) ou **Por ciclo** (até o fim da competência) |
| **Competência** | Mês de referência da medição |
| **Estorno** | Anulação de uma medição com justificativa; os serviços voltam a concluídos |
| **Fechamento de obra** | Consolidado de planejado, executado, medido, kits e materiais de uma ou várias obras |
| **Relatório detalhado de medição** | Pacote orçado × executado × faturado com Excel, PDF e fotos do book |
| **Visita prévia (pré-vistoria)** | Checklist feito no local antes da execução; recomendada, não impede programar nem executar |
| **Book de Obras** | Fotos de cada ponto executado, conforme as fotos pedidas no modelo |
| **As Built** | Ficha por ponto do que foi construído e o documento gerado a partir do projeto mestre e do book |
| **Solicitação técnica** | Pedido ou devolução de material para obra, corretiva, preventiva ou LPT |
| **Reserva** | Número da reserva externa de material vinculada à entrega |
| **OC/OS** | Ocorrência ou ordem de serviço associada à solicitação |
| **Saldo da obra** | Material entregue à obra menos o aplicado e o devolvido |
| **OS (frota)** | Ordem de serviço de manutenção de veículo, implemento ou equipamento |
| **Manutenção repetida** | Mesmo item na mesma placa dentro da janela configurada |
| **Desvio** | Não conformidade apontada numa inspeção de SST, com gravidade, responsável e prazo |
| **Evento de segurança** | Acidente, incidente ou doença ocupacional |
| **CAT** | Comunicação de Acidente de Trabalho |
| **Pirâmide de Bird** | Proporção entre eventos graves, leves e incidentes |
| **Comunicado** | Aviso publicado no mural e/ou no sino, com público-alvo e, se preciso, confirmação de leitura |
| **SLA** | Prazo de primeira resposta e de resolução de um chamado |
| **Perfil de acesso** | Conjunto de permissões que define o que o usuário vê e faz |

## 26. Dúvidas frequentes

**Não encontro uma tela que um colega usa. Por quê?**
O menu mostra só o que o seu perfil de acesso permite. Peça ao administrador para revisar o seu perfil.

**Qual a forma mais rápida de chegar a uma tela?**
`Ctrl+K` e digite parte do nome. Marque as que você mais usa como favoritas (estrela no topo).

**Preciso concluir o pré-fechamento para programar ou medir a obra?**
Não. Ele é uma conferência recomendada do levantamento, e o sistema não exige a conclusão para programar nem para medir.

**Preciso fazer a visita prévia antes de programar?**
Não. Ela é recomendada, mas não impede programar nem executar. Enquanto não for feita, a ficha mostra o aviso **Visita prévia não realizada**.

**Criei a obra, mas não consigo programar. O que falta?**
A programação usa os pontos e itens do planejamento. Abra **PLANEJAR**, marque os pontos e aplique os kits. Depois programe pela **Agenda de Programação → Nova programação** ou pelo próprio planejamento.

**O planejamento mostra kits de todos os contratos. Está certo?**
Isso acontece quando a obra não tem contrato na carteira. Use **Editar carteira** na ficha e informe o contrato e a classe de tensão.

**Mudei a equipe de uma programação. O valor muda?**
Não. O valor congelado na criação da programação continua valendo. A mudança fica registrada no **Histórico de Programação** com o motivo.

**Por que um serviço executado não aparece para medir?**
Confira se o serviço foi apontado como concluído pela equipe, se já não foi medido e se não é um kit marcado como executado antes do sistema (esses não são medidos).

**Errei uma medição. Como corrijo?**
Estorne em **Medições geradas** com justificativa. Os serviços voltam a concluídos e podem entrar numa nova medição.

**O supervisor consegue abrir turno ou preencher APR pela web?**
Não. Turno e APR são feitos pela equipe no app (seção 12.4). A web acompanha.

**A solicitação de material deu "Conflito de versão". E agora?**
Outra pessoa alterou a solicitação ao mesmo tempo. Clique em **Recarregar e atualizar** e repita a ação.

**Por que o saldo de um estoque está negativo?**
Material foi aplicado além do saldo. Analise as movimentações e regularize com entrada avulsa ou transferência.

**O Copiloto pode alterar dados sem eu saber?**
Não. Ele só grava depois que você confirma no cartão e respeita as suas permissões.

**Como sei se as pessoas leram um comunicado importante?**
Publique com **Confirmação de leitura** e consulte o **Relatório de confirmação** na lista de comunicados.

**Posso exportar uma lista para o Excel?**
Sim. Use **Exportar** na lista: sai o recorte filtrado, inclusive a busca.

**Tenho dados em planilha. Preciso digitar tudo?**
Não. A maioria dos cadastros tem **Importar** com planilha CSV, e o sistema mostra os erros linha a linha antes de gravar.
