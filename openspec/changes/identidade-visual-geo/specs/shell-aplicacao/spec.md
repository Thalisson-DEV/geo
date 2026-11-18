## ADDED Requirements

### Requirement: Login com a marca GEO
A tela de login SHALL apresentar o logo, o nome "GEO — Gestão de Equipes e Operações", o formulário de login e senha e a explicação de que o GEO funciona sem conexão depois do primeiro acesso. Ela MUST NOT exibir nome, logo ou cores de cliente ou do sistema de origem.

#### Scenario: Login no celular
- **WHEN** a tela de login é aberta com 390 px de largura
- **THEN** o painel de marca fica acima ou some, o formulário ocupa a largura útil e nenhum conteúdo exige rolagem horizontal

### Requirement: Menu lateral GEO
O menu lateral SHALL ter fundo da marca (azul-marinho no claro e no escuro), logo no topo, acesso à Bússola em destaque, grupos de navegação nomeados, item ativo marcado por indicador âmbar e texto em negrito, e estado de sincronização no rodapé. Ele MUST poder ser recolhido para só ícones, com nome em dica e nome acessível em cada item, e virar gaveta em telas pequenas.

#### Scenario: Menu recolhido
- **WHEN** o usuário recolhe o menu
- **THEN** só os ícones ficam visíveis, cada um mostra o nome ao receber foco ou cursor, e a escolha fica salva no dispositivo

#### Scenario: Item ativo
- **WHEN** o usuário está numa tela de Obras
- **THEN** o item Obras aparece marcado como ativo com indicador visual e `aria-current="page"`

### Requirement: Cabeçalho e busca global
O cabeçalho SHALL ter trilha de navegação, busca global acionada por `/`, notificações com contador e menu da conta (perfil, preferências de tema, densidade e movimento, sair). O botão de sair MUST ter o rótulo "Sair".

#### Scenario: Atalho de busca
- **WHEN** o usuário pressiona `/` fora de um campo de texto
- **THEN** o foco vai para a busca global

### Requirement: Início como painel da operação
A tela inicial SHALL saudar o usuário pelo primeiro nome, mostrar a data, os indicadores do dia permitidos pelo perfil, o que a Bússola notou (quando o perfil pode usá-la) e atalhos para as ações mais comuns do perfil.

#### Scenario: Perfil sem Bússola
- **WHEN** um usuário sem permissão de usar a Bússola abre o início
- **THEN** o cartão "A Bússola notou" não aparece e o restante do painel se reorganiza sem espaço vazio

### Requirement: Estados globais com a identidade GEO
Carregamento inicial, carregando, vazio, erro, sem conexão, sem permissão, página não encontrada, atualização disponível e toasts SHALL usar os componentes do Design System com ilustração ou ícone GEO, texto no guia de voz e ação clara de saída.

#### Scenario: Página não encontrada
- **WHEN** o usuário acessa um endereço que não existe
- **THEN** vê uma página com o logo, a explicação em uma frase e um botão "Voltar ao início"

#### Scenario: Sem conexão
- **WHEN** a conexão cai com o GEO aberto
- **THEN** o cabeçalho mostra "Sem conexão: o que você lançar fica salvo no aparelho" e o menu mostra os itens enfileirados
