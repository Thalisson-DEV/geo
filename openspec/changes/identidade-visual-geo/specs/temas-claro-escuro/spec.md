## ADDED Requirements

### Requirement: Escolha de tema
O usuário SHALL poder escolher entre "Claro", "Escuro" e "Seguir o sistema" (padrão). A escolha MUST ficar salva no dispositivo, valer sem conexão e ser aplicada antes da primeira pintura da tela.

#### Scenario: Seguir o sistema
- **WHEN** a preferência é "Seguir o sistema" e o sistema operacional muda de claro para escuro com o GEO aberto
- **THEN** o GEO passa para o tema escuro sem recarregar a página

#### Scenario: Sem flash ao abrir
- **WHEN** um usuário com tema escuro salvo abre o GEO
- **THEN** a primeira tela pintada (inclusive a de carregamento) já está no tema escuro

### Requirement: Cobertura total do tema escuro
Todo token de cor SHALL ter valor para o tema escuro, e toda tela, componente, gráfico, mapa, editor, visualizador de PDF e imagem de marca MUST ficar legível no tema escuro. Imagens de conteúdo enviadas por usuários MUST NOT ser invertidas.

#### Scenario: Gráfico no escuro
- **WHEN** um dashboard com gráficos é aberto no tema escuro
- **THEN** eixos, grades, legendas e rótulos usam os tokens do tema escuro e têm contraste mínimo de 4,5:1 para texto

#### Scenario: Mapa no escuro
- **WHEN** um mapa de obras é aberto no tema escuro
- **THEN** controles, marcadores e popups seguem o tema escuro e o mapa base usa uma variante escura ou com brilho reduzido

### Requirement: Contraste nos dois temas
Texto comum SHALL ter contraste mínimo de 4,5:1 e texto grande, ícones e bordas de controle mínimo de 3:1, nos dois temas. Cores de estado MUST usar a variante "texto" quando aplicadas como tinta sobre superfície.

#### Scenario: Verificação automática
- **WHEN** os testes de acessibilidade rodam nas telas de referência nos temas claro e escuro
- **THEN** nenhuma violação de contraste é reportada

### Requirement: Documentos sempre claros
Impressão, PDF e e-mail SHALL ser gerados sempre no tema claro, independentemente do tema da interface.

#### Scenario: Imprimir no tema escuro
- **WHEN** o usuário está no tema escuro e imprime um relatório
- **THEN** a impressão sai com fundo branco e texto escuro
