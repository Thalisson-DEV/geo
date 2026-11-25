## ADDED Requirements

### Requirement: Material carimbado por obra
O sistema SHALL guardar, em cada local de estoque, quanto do saldo é de cada obra, e tratar o restante como livre.

#### Scenario: Entrega técnica aloca para a obra
- **WHEN** o almoxarifado entrega 3 postes da solicitação da obra 430126363 à equipe CON-TMN-01
- **THEN** o caminhão da CON-TMN-01 fica com 3 postes da obra 430126363 e a ficha da obra mostra 3 com a equipe

### Requirement: Aplicação pelo apontamento deixa rastro
Apontar material SHALL baixar do caminhão da equipe e lançar como aplicado na obra, sem nunca recusar o apontamento.

#### Scenario: Material de outra obra
- **WHEN** a equipe aponta 2 postes na obra B e só tem postes da obra A
- **THEN** os 2 postes ficam aplicados na obra B e fica registrado o empréstimo de 2 postes da obra A para a obra B

### Requirement: Devolução de sobra
O almoxarifado SHALL receber de volta o material de uma obra que sobrou no caminhão ou no canteiro, liberando a alocação.

#### Scenario: Programação não feita
- **WHEN** a programação é cancelada e a equipe devolve os 3 postes da obra
- **THEN** os postes voltam livres ao almoxarifado e a ficha da obra mostra 3 devolvidos

### Requirement: Canteiros
O sistema SHALL manter canteiros como locais de estoque perto das obras, onde a equipe deixa e pega material sem perder a obra.

#### Scenario: Deixar no canteiro
- **WHEN** a equipe deixa 2 postes da obra A no canteiro Timon Norte
- **THEN** o canteiro fica com 2 postes da obra A e a ficha da obra mostra onde eles estão
