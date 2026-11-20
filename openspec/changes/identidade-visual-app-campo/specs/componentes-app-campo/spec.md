## ADDED Requirements

### Requirement: Identidade GEO em escala de toque
Os componentes do app SHALL usar apenas tokens `--geo-*` (cores da marca, Inter, raios, elevação, movimento) com escala de toque:
alvos de no mínimo 48px, botão principal de 52px ou mais, texto base de 15px ou mais e campos com fonte de 16px ou mais.

#### Scenario: Cor fixa no código
- **WHEN** um componente usa uma cor literal fora dos tokens
- **THEN** o lint do app falha apontando o arquivo

### Requirement: Feedback de toque
Todo elemento tocável SHALL dar retorno visual imediato ao toque e MUST respeitar a preferência de reduzir movimento do sistema.

#### Scenario: Reduzir movimento
- **WHEN** o aparelho está com "reduzir movimento" ligado
- **THEN** as transições viram troca instantânea ou esmaecimento curto

### Requirement: Estados de carregamento, vazio e erro
Listas e telas SHALL mostrar skeleton ao carregar, estado vazio com o próximo passo e erro com o que fazer, sem spinner que bloqueia
a tela.

#### Scenario: Lista vazia
- **WHEN** a equipe não tem solicitações de material
- **THEN** a tela mostra o estado vazio com o botão "Pedir material"

### Requirement: Ações reversíveis com desfazer
Ações reversíveis SHALL ser executadas na hora com a opção "Desfazer" por alguns segundos, sem diálogo de confirmação; ações
irreversíveis MUST pedir confirmação numa folha inferior.

#### Scenario: Remover foto
- **WHEN** o encarregado remove uma foto ainda não enviada
- **THEN** a foto some e aparece "Foto removida — Desfazer"

### Requirement: Formulários em passos
Formulários com mais de uma tela de conteúdo SHALL ser divididos em passos com progresso, rascunho salvo a cada passo e retomada no
passo em que parou.

#### Scenario: App fechado no meio
- **WHEN** o app é fechado no passo 3 de 5
- **THEN** ao reabrir o formulário volta ao passo 3 com o que foi preenchido

### Requirement: Fotos
O componente de fotos SHALL abrir a câmera direto, comprimir a imagem, aplicar carimbo configurável (contexto, data/hora, GPS) e
mostrar o estado de envio de cada foto.

#### Scenario: Foto sem sinal
- **WHEN** o encarregado tira uma foto sem conexão
- **THEN** a miniatura aparece com o selo "no aparelho"
