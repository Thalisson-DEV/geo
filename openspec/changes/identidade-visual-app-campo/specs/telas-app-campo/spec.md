## ADDED Requirements

### Requirement: Layout adaptável, tablet primeiro
As telas de lista SHALL abrir o detalhe ao lado da lista no tablet em paisagem e em tela cheia no celular e no tablet em retrato,
mantendo a seleção e a rolagem ao girar o aparelho.

#### Scenario: Lista e detalhe no tablet
- **WHEN** o usuário toca numa solicitação no tablet em paisagem
- **THEN** o detalhe abre à direita e a lista continua visível à esquerda

### Requirement: Telas existentes no novo padrão
Todas as telas existentes do app SHALL usar o shell e os componentes base do app, sem mudança nas regras de negócio, e cada tela
MUST ter screenshot de referência em claro e escuro, no tablet e no celular.

#### Scenario: Regressão visual
- **WHEN** uma mudança altera o visual de uma tela já migrada
- **THEN** o teste visual dessa tela falha até a referência ser revisada e atualizada

### Requirement: Um próximo passo por tela
Cada tela SHALL ter no máximo um botão principal, ao alcance do polegar, que leva ao próximo passo do usuário.

#### Scenario: Hoje sem pendências
- **WHEN** o encarregado abre o Hoje com o turno aberto
- **THEN** só há um botão principal, com o próximo passo do dia
