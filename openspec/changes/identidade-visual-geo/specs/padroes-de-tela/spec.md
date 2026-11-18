## ADDED Requirements

### Requirement: Padrões visuais de tela
O Design System SHALL definir e documentar no catálogo os padrões visuais de listagem, detalhe, formulário em drawer, dashboard, quadro kanban, mapa e relatório em tela, cada um nos temas claro e escuro, nas densidades confortável e compacta e na largura de celular.

#### Scenario: Padrão no catálogo
- **WHEN** um desenvolvedor abre o catálogo do Design System
- **THEN** encontra cada padrão com exemplo navegável nos dois temas e as regras de uso

### Requirement: Telas construídas só com o Design System
Toda tela visível SHALL usar componentes e tokens do `@geo/ui`. Telas MUST NOT usar botão PrimeNG direto, classes de cor de paleta Tailwind, `!important` ou estilo local que redefina cor, fonte, raio ou sombra.

#### Scenario: Botão direto
- **WHEN** o `ds:check` encontra `<p-button>` numa tela de funcionalidade
- **THEN** a verificação falha indicando o arquivo

### Requirement: Conformidade por módulo
Cada módulo (Obras, Almoxarifado, Execução, Frota, Segurança, DP, Financeiro, Chamados, Automações e notificações, Pessoas e equipes, Contrato, Administração, Manuais, Bússola) SHALL ser considerado concluído só quando todas as suas telas estiverem conformes ao padrão, aprovadas nos dois temas e sem exceções abertas no `ds:check`.

#### Scenario: Módulo concluído
- **WHEN** o módulo Obras é marcado como concluído
- **THEN** o relatório do `ds:check` não lista nenhum arquivo de `features/obras` com cor fixa, `!important` ou botão PrimeNG direto, e as baselines visuais de Obras existem nos temas claro e escuro

### Requirement: Status nunca só por cor
Todo status SHALL ser exibido pelo componente de status do Design System, com ícone ou símbolo e texto, além da cor.

#### Scenario: Status em tabela
- **WHEN** uma obra atrasada aparece na listagem
- **THEN** o status mostra símbolo de aviso e o texto "Atrasada", além da cor de aviso
