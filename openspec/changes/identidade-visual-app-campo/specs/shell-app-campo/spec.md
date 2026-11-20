## ADDED Requirements

### Requirement: Navegação por perfil
O app SHALL mostrar de 3 a 5 destinos principais conforme o perfil do usuário, em abas inferiores no celular e no tablet em retrato
e em trilho lateral no tablet em paisagem, ocultando a navegação nas telas de lançamento e detalhe em tela cheia.

#### Scenario: Tablet em paisagem
- **WHEN** o encarregado gira o tablet para paisagem
- **THEN** os destinos passam para o trilho lateral, sem perder a tela nem a rolagem atual

### Requirement: Estado do aparelho sempre visível
O shell SHALL mostrar a quantidade de envios pendentes, o estado da rede e o aviso de nova versão sem cobrir o conteúdo.

#### Scenario: Pendências sem sinal
- **WHEN** há 3 lançamentos não enviados e o aparelho está sem rede
- **THEN** a aba Hoje mostra o selo 3 e o indicador mostra "Sem sinal — 3 para enviar"

### Requirement: Áreas seguras e tela cheia
O app SHALL respeitar as áreas seguras do aparelho (entalhe, barra de gestos) e ocupar a altura dinâmica da tela.

#### Scenario: iPhone com barra de gestos
- **WHEN** o app instalado roda num iPhone com barra de gestos
- **THEN** as abas e o botão principal ficam acima da barra de gestos

### Requirement: Tema
O app SHALL oferecer tema claro, escuro e seguir o sistema, além do modo sol (alto contraste), com a escolha guardada no aparelho.

#### Scenario: Modo sol
- **WHEN** o encarregado liga o modo sol em Conta
- **THEN** todas as telas passam ao alto contraste e a escolha continua após fechar o app
