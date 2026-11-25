## ADDED Requirements

### Requirement: Importação do PDF da norma sem IA
O sistema SHALL receber o PDF de uma norma de estruturas (até 60 MB) e extrair dele, sem modelo de IA, a identificação da norma (código, título e revisão pela capa e pelo cabeçalho das páginas), a lista de desenhos e, para cada estrutura, o quadro "Lista de materiais", o quadro "Lista de fixação" e a página do desenho. O processamento MUST rodar em segundo plano e mostrar o andamento por página. O resultado SHALL ficar como RASCUNHO até a publicação.

#### Scenario: Norma de 275 páginas
- **WHEN** o administrador envia o PDF da norma de MT 13,8 kV + BT, com 275 páginas
- **THEN** a importação aparece como "Processando · página 140 de 275" e termina como rascunho, com as estruturas encontradas, cada uma com materiais, fixação e desenho

#### Scenario: PDF digitalizado sem texto
- **WHEN** o PDF enviado não tem camada de texto (é uma imagem digitalizada)
- **THEN** a importação termina com "Este PDF não tem texto para ler. Cadastre as estruturas à mão ou envie o PDF original da norma." e nenhuma estrutura é criada

#### Scenario: Arquivo que não é norma de estruturas
- **WHEN** o PDF enviado não tem nenhum quadro "Lista de materiais referente ao Desenho"
- **THEN** a importação termina com "Nenhuma estrutura encontrada neste PDF." e o arquivo é descartado

### Requirement: Leitura dos quadros de materiais
Para cada quadro de materiais, o importador SHALL ler as linhas em duas colunas lado a lado (item, código, quantidade, descrição), ligar o quadro à estrutura pelo título ("Quadro 50 - Lista de Materiais referente ao Desenho 67 – Estrutura N1") e tratar os quadros que continuam na página seguinte como um só. Um código no formato "Tabela NN" MUST virar uma linha dependente de tabela. Um código "0" ou vazio MUST virar a pendência "material sem código".

#### Scenario: Quadro em duas colunas
- **WHEN** o quadro da N1 traz à esquerda "A-02 134830013 04 Arruela quadrada…" e à direita "M-14 Tabela 31 03 Laço pré-formado de topo"
- **THEN** o rascunho da N1 tem as duas linhas: a arruela com o código e a quantidade 4, e o laço como dependente da Tabela 31 com a quantidade 3

#### Scenario: Conector sem código
- **WHEN** o quadro da N4 traz "0-01 · 0 · 03 · Conector cunha"
- **THEN** a linha entra com a pendência "Material sem código na norma" para a pessoa completar ou aceitar assim

#### Scenario: Quadro quebrado entre páginas
- **WHEN** o quadro de fixação da N3 começa na página 145 e termina na 146
- **THEN** o rascunho da N3 tem uma tabela de fixação única com as linhas das duas páginas

### Requirement: Leitura da fixação conforme o poste
O importador SHALL ler o cabeçalho da tabela de fixação (comprimentos do poste e resistências nominais em daN) e as quantidades de cada combinação, gravando "-" como "não se aplica".

#### Scenario: Cabeçalho com dois comprimentos
- **WHEN** a tabela da N3 traz os comprimentos 11 e 12/13 e as resistências 300, 600, 1000, 1500 e 2000 daN
- **THEN** o rascunho tem as combinações 11 m×{300, 600, 1000, 1500} e 12/13 m×{300, 600, 1000, 1500, 2000}, com as quantidades lidas e "não se aplica" onde a norma traz "-"

### Requirement: Recorte do desenho
O importador SHALL gerar a imagem do desenho de cada estrutura a partir da região da página entre o título "Desenho NN - …" e o próximo título ou quadro, em resolução suficiente para zoom no tablet (no mínimo 200 dpi), e guardá-la como mídia DESENHO de origem "norma". Quando não conseguir delimitar a região, MUST usar a página inteira e abrir a pendência "conferir recorte".

#### Scenario: Desenho na mesma página do quadro de outra estrutura
- **WHEN** a página 146 tem o fim da fixação da N3 em cima e o "Desenho 70 - Estrutura N4" embaixo
- **THEN** o desenho da N4 é recortado só da parte de baixo, sem a tabela da N3

#### Scenario: Recorte ajustado à mão
- **WHEN** a pessoa marca "conferir recorte" na N4 e arrasta a área no visualizador da página
- **THEN** o desenho é gerado de novo com a área escolhida e a pendência fecha

### Requirement: Revisão do rascunho com pendências
Antes de publicar, o sistema SHALL mostrar o rascunho por estrutura, com a contagem de pendências por tipo: material sem código, quantidade fora do comum (acima de 50 ou zero), quadro sem desenho, desenho sem quadro, recorte a conferir, estrutura sem família/função, código sem material no estoque. A pessoa SHALL poder editar qualquer campo, aceitar a pendência como está ou excluir a estrutura do rascunho. A família e a função SHALL ser sugeridas pelo título do desenho ("Monofásica", "Beco", "Secundária Multiplexada", "Estaiamento", "Chaves e equipamentos") e pela letra do código.

#### Scenario: Sugestão de família
- **WHEN** o desenho se chama "Rede de Média Tensão Bifásica – Estrutura Beco Bifásica – B2B"
- **THEN** o rascunho sugere a família "beco bifásica" e a pessoa só confirma

#### Scenario: Publicar com pendência aberta
- **WHEN** ainda há 3 pendências "material sem código" não aceitas
- **THEN** o botão "Publicar" fica desabilitado, com "Resolva ou aceite as 3 pendências antes de publicar"

#### Scenario: Página sem estrutura
- **WHEN** a norma tem desenhos de afastamentos e engastamento sem lista de materiais
- **THEN** eles entram no rascunho como mídias de referência da norma (DETALHE), não como estruturas, e a pessoa pode descartá-los

### Requirement: Comparação entre revisões
Ao importar uma revisão nova de uma norma que já tem revisão vigente, o sistema SHALL mostrar, por estrutura, o que é novo, o que foi removido e o que mudou: materiais incluídos ou retirados, quantidades alteradas, fixação alterada e desenho alterado (por diferença de imagem). Também SHALL listar os kits ligados às estruturas afetadas.

#### Scenario: Quantidade mudou na revisão
- **WHEN** a revisão 04 traz 10 arruelas na N4 e a vigente 03 trazia 12
- **THEN** a comparação mostra "N4 · Arruela quadrada 38x38x3: 12 → 10" e "2 kits ligados à N4 terão a conformidade recalculada"

#### Scenario: Estrutura removida
- **WHEN** a estrutura `P1A-PR` existe na 03 e não aparece na 04
- **THEN** a comparação marca a `P1A-PR` como "removida na revisão nova" e, ao publicar, os kits ligados a ela continuam apontando para a revisão 03, com o aviso "estrutura fora da norma vigente"

### Requirement: Publicação da importação
Publicar SHALL criar ou atualizar a revisão da norma com todas as estruturas aceitas, numa única transação, e torná-la VIGENTE conforme as regras do catálogo. Os kits ligados a estruturas de mesmo código na revisão anterior MUST ser religados à estrutura da revisão nova, a menos que a pessoa desmarque esse religamento na tela de publicação.

#### Scenario: Religar kits na publicação
- **WHEN** a revisão 04 é publicada e o kit `N1-11/300` estava ligado à N1 da revisão 03
- **THEN** o kit passa a apontar para a N1 da revisão 04 e a conformidade é recalculada

#### Scenario: Falha no meio da publicação
- **WHEN** um erro acontece ao gravar a 80ª estrutura
- **THEN** nada da publicação fica gravado e o rascunho continua disponível para tentar de novo

### Requirement: Importação da apresentação de treinamento
O sistema SHALL receber um arquivo .pptx (até 100 MB) e, para cada slide, extrair as imagens e os textos. Imagens repetidas em mais da metade dos slides (logotipos e cabeçalhos) MUST ser descartadas automaticamente. Para cada slide, o sistema SHALL sugerir a estrutura do catálogo vigente pelo código encontrado no título ("Estrutura N4", "(U3-U3)", "S1I"). Slides sem código casado ficam "sem estrutura". A pessoa SHALL escolher, imagem por imagem, entre: foto de referência correta, foto de erro comum, detalhe ou ignorar; e, texto por texto, se vira recomendação (com a gravidade). Materiais e fixação MUST NOT ser importados da apresentação.

#### Scenario: Slide da N4
- **WHEN** o slide 30 tem o título "Rede de Média Tensão Trifásica – Estrutura N4", um desenho, uma tabela em imagem e 3 logotipos
- **THEN** o slide é sugerido para a N4, os 3 logotipos não aparecem e as outras 2 imagens ficam para a pessoa classificar

#### Scenario: Imagem que é tabela de materiais
- **WHEN** a pessoa tenta marcar como foto de referência uma imagem que é a captura do quadro de materiais
- **THEN** o sistema aceita, mas avisa "Os materiais da estrutura vêm da norma; esta imagem não altera a lista de materiais"

#### Scenario: Slide de seção
- **WHEN** o slide só tem o texto "ESTRUTURAS TIPO (T)" e nenhuma imagem
- **THEN** o slide aparece recolhido como "sem conteúdo para importar"

#### Scenario: Recomendação a partir do texto
- **WHEN** o slide 65 traz "A não aplicação implica na reprovação da obra" junto de "Coxim elastomérico"
- **THEN** a pessoa pode transformar o texto na recomendação "Aplicar coxim elastomérico" com a gravidade REPROVA_OBRA, para a N1 ou para a família inteira

### Requirement: Rastro da importação
Cada importação SHALL guardar o arquivo enviado, quem enviou, quando, a duração, as contagens (estruturas, materiais, fixações, mídias, pendências aceitas) e o resultado. Itens importados MUST guardar a origem (arquivo e página ou slide).

#### Scenario: Conferir a origem de um material
- **WHEN** alguém abre um material da N1 no catálogo e pede a origem
- **THEN** o sistema mostra "Importado da norma 13,8 kV + BT rev. 04, página 143, quadro 50" e abre o PDF nessa página
