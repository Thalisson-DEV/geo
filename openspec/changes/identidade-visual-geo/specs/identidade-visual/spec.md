## ADDED Requirements

### Requirement: Tokens de marca como fonte única do visual
O Design System SHALL expor como tokens semânticos toda cor, fonte, tamanho de texto, raio, sombra, espaçamento e densidade usados pela interface. Componentes e telas MUST consumir esses tokens e MUST NOT declarar valores de cor, fonte ou sombra literais.

#### Scenario: Mudança de token se propaga
- **WHEN** o valor do token de cor primária é alterado no arquivo de tokens
- **THEN** botões primários, links, foco, item ativo do menu e gráficos que usam a cor primária mudam juntos, sem alterar nenhum outro arquivo

#### Scenario: Tela sem valor literal
- **WHEN** o `ds:check` analisa um componente de tela
- **THEN** não encontra cor hexadecimal, `rgb()` ou classe de paleta Tailwind (`text-blue-600`, `bg-slate-100`…) fora dos arquivos de tokens

### Requirement: Paleta GEO
A paleta SHALL ter: primária derivada do azul do "G" (escala 50–950), destaque âmbar usado apenas em item ativo, indicador de foco, contadores de notificação e Bússola, neutros próprios do GEO e cores semânticas de sucesso, aviso, erro e informação com variantes de fundo suave e de texto. A cor primária MUST ser fixa para todos os usuários.

#### Scenario: Usuário com cor antiga salva
- **WHEN** um usuário que tinha escolhido "esmeralda" no sistema antigo abre o GEO
- **THEN** a interface aparece com a primária do GEO e nenhum erro é mostrado

#### Scenario: Âmbar não vira cor de ação
- **WHEN** o catálogo do Design System é revisado
- **THEN** nenhum botão de ação primária, link ou status usa o âmbar como cor de preenchimento

### Requirement: Tipografia GEO
A interface SHALL usar a fonte Manrope, servida pelo próprio aplicativo (disponível offline), com escala tipográfica definida em tokens (display, títulos 1–3, corpo, corpo pequeno, rótulo, legenda). Números em tabelas, indicadores e valores monetários MUST usar algarismos tabulares.

#### Scenario: Fonte offline
- **WHEN** o PWA é aberto sem conexão depois de já ter sido carregado uma vez
- **THEN** os textos aparecem em Manrope, sem trocar para a fonte do sistema

#### Scenario: Colunas numéricas alinhadas
- **WHEN** uma coluna de valores (ex.: "1.111,10" e "8.888,80") é exibida numa tabela
- **THEN** os dígitos ficam alinhados verticalmente entre as linhas

### Requirement: Forma, elevação e densidade
Raios, sombras e alturas de controle SHALL vir de tokens com no máximo três níveis de raio e três de elevação. A interface MUST oferecer densidade "confortável" e "compacta", e alvos de toque MUST ter no mínimo 44 px em telas de toque nas duas densidades.

#### Scenario: Densidade compacta
- **WHEN** o usuário escolhe densidade compacta
- **THEN** linhas de tabela e campos de formulário reduzem altura conforme os tokens, e botões continuam com área de toque de 44 px em dispositivos de toque

### Requirement: Iconografia consistente
A interface SHALL usar um único conjunto de ícones de traço, com tamanhos e espessura definidos em tokens. Ícone que comunica estado MUST vir acompanhado de texto; botão só com ícone MUST ter nome acessível.

#### Scenario: Botão de ícone acessível
- **WHEN** um leitor de tela foca o botão de notificações do cabeçalho
- **THEN** anuncia "Notificações" e a quantidade de novas, se houver

### Requirement: Marca e personagem
O logo do GEO (apenas o "G") e o avatar da Bússola SHALL existir como componentes do Design System com variantes para fundo claro e escuro, e MUST ser os únicos usados para representar o produto e a assistente.

#### Scenario: Logo no tema escuro
- **WHEN** o tema escuro está ativo
- **THEN** o logo do menu, do login e do carregamento inicial mantém contraste mínimo de 3:1 com o fundo
