## ADDED Requirements

### Requirement: Regras automáticas no ds:check
O `ds:check` SHALL falhar quando código de tela introduzir: cor literal ou classe de paleta Tailwind, novo `!important`, `::ng-deep`, `<p-button>` ou outro componente PrimeNG não liberado no registro de cobertura, `transition`/`animation` com valores fora dos tokens de movimento, ou termo da lista de marcas proibidas em texto visível. Ocorrências antigas MUST ficar num registro de exceções por arquivo, que só pode diminuir.

#### Scenario: Exceção que só diminui
- **WHEN** um arquivo listado no registro de exceções ganha uma nova cor literal
- **THEN** o `ds:check` falha, mesmo o arquivo já estando na lista

#### Scenario: Arquivo limpo sai da lista
- **WHEN** um arquivo listado deixa de ter ocorrências
- **THEN** o `ds:check` pede a remoção dele do registro de exceções

### Requirement: Baselines visuais nos dois temas
As telas de referência (login, início, listagem, detalhe, formulário, dashboard, Bússola, relatório) SHALL ter baselines visuais nos temas claro e escuro e na largura de celular, comparadas no `verify:design-system`.

#### Scenario: Regressão visual
- **WHEN** uma alteração muda a aparência de uma tela de referência além da tolerância
- **THEN** o `test:visual` falha mostrando a diferença

### Requirement: Acessibilidade verificada
Os testes de acessibilidade (axe) SHALL rodar nas telas de referência nos dois temas e com "reduzir movimento" ativo, sem violações sérias ou críticas.

#### Scenario: Axe no escuro
- **WHEN** o `test:a11y` roda no tema escuro
- **THEN** nenhuma violação séria ou crítica é reportada

### Requirement: Checklist de porte
Todo código trazido do sistema de origem SHALL passar por um checklist de porte (tokens no lugar de cores, componentes do Design System, textos no guia de voz, marcas trocadas) antes de entrar na branch principal.

#### Scenario: Porte com visual antigo
- **WHEN** um porte traz uma tela com cores fixas e o nome do sistema de origem
- **THEN** o `ds:check` falha e o checklist aponta os itens pendentes
