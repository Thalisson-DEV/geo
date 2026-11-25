## ADDED Requirements

### Requirement: Guia de estruturas no web
O web SHALL ter a tela "Guia de estruturas" em Obras, que segue o padrão "tabela primeiro": uma lista paginada no servidor, com busca por código, apelido e nome, e filtros por emissor, família, função, classe de tensão, número de fases e norma (por padrão só as vigentes). Cada linha SHALL mostrar a miniatura do desenho, o código, o nome, a família, a tensão, a norma com a revisão, o total de materiais e o total de kits ligados.

#### Scenario: Buscar por código
- **WHEN** a pessoa digita "n3" na busca
- **THEN** a lista mostra N3, N3-N3 e N3-N3-N1 de cada norma vigente, com o código exato primeiro

#### Scenario: Filtrar por baixa tensão
- **WHEN** a pessoa filtra a família "baixa tensão multiplexada"
- **THEN** a lista mostra S1I, S1I 45°, S3I, S4I e as demais estruturas de BT, incluindo as da norma de poste de fibra

### Requirement: Detalhe da estrutura
O detalhe SHALL mostrar, nesta ordem:
- o código, o nome e a norma (com a revisão e o link para a página do PDF);
- as recomendações que reprovam a obra, em destaque;
- o desenho com zoom e arraste;
- as fotos corretas e, separadas, as de erro comum;
- a lista de materiais (com o material do estoque quando houver);
- a fixação conforme o poste, com um seletor de comprimento e resistência que recalcula a lista;
- as demais recomendações;
- os kits ligados.

#### Scenario: Escolher o poste
- **WHEN** a pessoa escolhe 12/13 m e 1000 daN no detalhe da N3
- **THEN** a lista de materiais passa a mostrar os parafusos dessa combinação e a quantidade total de cada material

#### Scenario: Estrutura de revisão substituída
- **WHEN** a pessoa abre uma estrutura de revisão substituída pelo link de um kit antigo
- **THEN** o detalhe mostra a faixa "Revisão substituída pela 04 · ver a versão vigente", com o link para a estrutura vigente de mesmo código

### Requirement: Guia no pacote offline do app
Quando o guia no app está ligado nos parâmetros, o pacote offline da equipe SHALL incluir o guia das normas vigentes aplicáveis aos contratos e às classes de tensão das obras da agenda e das obras abertas da base (no mínimo, as estruturas usadas pelos kits dessas obras). Ele traz os dados de cada estrutura (materiais, fixação, recomendações) e as imagens em tamanho de tela (no máximo 1600 px no lado maior). O app MUST baixar as imagens uma vez e só as que mudaram depois, por um carimbo de versão por estrutura. O tamanho total das imagens do guia SHALL ser informado na tela de sincronização e MUST respeitar o limite dos parâmetros (padrão 150 MB). Acima dele, só vão as estruturas ligadas aos kits das obras.

#### Scenario: Primeira sincronização
- **WHEN** o encarregado sincroniza pela primeira vez, com rede
- **THEN** o app guarda o guia e mostra na sincronização "Guia de estruturas · 112 estruturas · 38 MB"

#### Scenario: Revisão nova publicada
- **WHEN** a norma ganha uma revisão nova e só 9 estruturas mudaram
- **THEN** na próxima sincronização o app baixa só as 9 estruturas e as imagens delas

#### Scenario: Sem rede
- **WHEN** o encarregado está sem sinal no poste e abre a N4
- **THEN** o app mostra o desenho, as fotos, os materiais e as recomendações que já estavam no aparelho, sem erro e sem tela vazia

### Requirement: Abrir a estrutura a partir do ponto
Na execução do ponto, cada kit ligado a uma estrutura do catálogo SHALL mostrar a ação "Ver estrutura", que abre o visualizador da estrutura. Quando o ponto tem o poste conhecido (comprimento e resistência vindos do projeto ou do kit do poste), o visualizador MUST abrir já com a lista de materiais calculada para esse poste. Quando o kit não tem vínculo, a ação MUST NOT aparecer. Quando o vínculo existe, mas a estrutura não está no aparelho, o app SHALL mostrar "Estrutura não baixada · sincronize com rede".

#### Scenario: Kit N1 num poste 11 m/600 daN
- **WHEN** o encarregado toca em "Ver estrutura" no kit N1 de um ponto com poste 11 m/600 daN
- **THEN** o visualizador abre a N1 com os materiais e os parafusos de 11 m/600 daN e com o rótulo "Calculado para poste 11 m · 600 daN"

#### Scenario: Poste desconhecido
- **WHEN** o ponto não tem o poste informado
- **THEN** o visualizador mostra os materiais fixos e a fixação com o seletor de poste, sem escolher nenhum por conta própria

### Requirement: Busca livre no app
O app SHALL ter, na área de Obras, a entrada "Guia de estruturas", com busca por código ou nome e filtro por família, para a equipe consultar uma estrutura que não está no ponto (por exemplo, para tirar uma dúvida de montagem). A busca MUST funcionar offline sobre o guia guardado no aparelho.

#### Scenario: Consulta sem ponto
- **WHEN** o encarregado busca "estai" no guia, sem sinal
- **THEN** o app lista o estai de âncora, o de contra-poste, o de cruzeta a poste e o de cruzeta a cruzeta

### Requirement: Visualizador de estrutura no app
O visualizador SHALL ser feito para tablet e celular, usado com uma mão e luva: alvos de toque de no mínimo 48 px, desenho em tela cheia com pinça e duplo toque para zoom, fotos em carrossel com a legenda e a marca "Correto" ou "Erro comum", recomendações que reprovam a obra no topo e a lista de materiais com o item do desenho (para achar o item no desenho). Tocar no item do material MUST destacar o rótulo do item, quando a posição do rótulo no desenho for conhecida.

#### Scenario: Achar o item no desenho
- **WHEN** o encarregado toca na linha "F-36 · Pino auto travante · 3"
- **THEN** o desenho centraliza e destaca o rótulo F-36

#### Scenario: Celular na vertical
- **WHEN** o visualizador abre num celular na vertical
- **THEN** o desenho ocupa a largura da tela, a lista de materiais vem abaixo e nada exige rolagem horizontal

### Requirement: Uso do guia registrado
O app SHALL registrar, sem bloquear nada, quando a equipe abre uma estrutura a partir de um ponto (estrutura, ponto, obra, equipe, data/hora), e enviar esse registro na sincronização. O web SHALL mostrar as estruturas mais consultadas por equipe no período, para orientar o treinamento.

#### Scenario: Estrutura mais consultada
- **WHEN** no mês a equipe CON-RMS-01 abriu a TE 14 vezes e as demais estruturas menos de 3
- **THEN** o relatório de uso mostra a TE no topo da CON-RMS-01, com 14 consultas
