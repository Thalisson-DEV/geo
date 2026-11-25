## ADDED Requirements

### Requirement: Nada de cliente fixo no código
O GEO atende vários clientes, um por implantação, e uma empresa pode trabalhar para mais de uma distribuidora. Toda regra desta funcionalidade que dependa de distribuidora, de layout de norma ou de cliente SHALL ficar em configuração da implantação, com sementes genéricas. O código MUST NOT conter nome de distribuidora, código de norma, código de material, layout próprio de uma norma ou regra de um cliente específico. Esta configuração vale só para o padrão construtivo e MUST NOT alterar cadastros de outros módulos (contrato, estoque, equipes).

#### Scenario: Implantação nova sem nenhuma norma
- **WHEN** um cliente novo é implantado e ainda não importou nenhuma norma
- **THEN** o guia aparece vazio com "Nenhuma norma cadastrada · importe a norma da sua distribuidora", os kits funcionam como antes e nenhuma estrutura de outro cliente aparece

### Requirement: Parâmetros do padrão construtivo
Cada implantação SHALL ter um registro único de parâmetros do padrão construtivo, editável por quem tem `obras:estrutura:import`, com valores padrão:

| Parâmetro | Padrão |
|---|---|
| Guia de estruturas ligado | sim |
| Guia no app de campo ligado | sim |
| Conformidade dos kits ligada | sim |
| Parecer da IA automático ligado | não |
| Limite de tamanho do guia no aparelho (MB) | 150 |
| Análises de IA simultâneas | 4 |
| Análises de IA por hora | 300 |
| Quantidade considerada fora do comum na importação | acima de 50 |
| Dias para descartar rascunho de importação | 30 |
| Revisão de foto com "Estrutura fora do padrão" conta no ranking | não |

Desligar uma parte MUST esconder as telas e ações dela, sem apagar dados.

#### Scenario: Cliente sem IA
- **WHEN** o administrador deixa o parecer da IA desligado
- **THEN** nenhuma foto recebe parecer automático, e o pedido manual só aparece se houver modelo com visão configurado

#### Scenario: Desligar o guia no app
- **WHEN** o cliente desliga "Guia no app de campo"
- **THEN** o pacote offline deixa de levar o guia, a ação "Ver estrutura" some do app e o guia continua no web

### Requirement: Emissor da norma
O sistema SHALL ter o cadastro de emissores de norma (a distribuidora ou o órgão que publica a norma), com nome, sigla e situação. Toda norma MUST pertencer a um emissor, e o código da norma MUST ser único por emissor. O guia, a busca e a importação SHALL filtrar por emissor. O cadastro começa vazio, sem semente.

#### Scenario: Mesma estrutura de dois emissores
- **WHEN** a implantação tem as normas de dois emissores e as duas têm a estrutura `N1`
- **THEN** o guia mostra as duas, com o emissor ao lado, e o filtro por emissor separa uma da outra

#### Scenario: Mesmo código de norma em emissores diferentes
- **WHEN** dois emissores usam o código de norma "NT-006"
- **THEN** o sistema aceita as duas normas, porque o código é único dentro de cada emissor

### Requirement: Normas aplicáveis ao contrato
O padrão construtivo SHALL guardar, em Obras, quais emissores ou normas valem para cada contrato, sem alterar o cadastro de contratos. Quando o contrato não tem essa configuração, valem todas as normas vigentes. As sugestões de vínculo de kit, a comparação, o guia no app e o parecer da IA MUST usar só as normas aplicáveis ao contrato da obra ou do kit.

#### Scenario: Contrato de outra distribuidora
- **WHEN** o contrato A está ligado ao emissor X e o kit `N1` do contrato A pede sugestões de estrutura
- **THEN** só aparecem as estruturas das normas vigentes do emissor X

#### Scenario: Contrato sem configuração
- **WHEN** o contrato B não tem emissor nem norma configurados
- **THEN** valem todas as normas vigentes da implantação, e o cadastro do contrato no padrão construtivo mostra "Todas as normas vigentes"

### Requirement: Perfis de leitura de norma
A importação do PDF SHALL usar um perfil de leitura configurável, que descreve o layout da norma:
- os padrões de texto do título do desenho, do quadro de materiais e do quadro de fixação;
- o formato do item do desenho e do código de material;
- o texto que indica "depende de tabela" e o código que significa "sem código";
- o número de colunas lado a lado do quadro de materiais;
- a ordem das colunas (item, código, quantidade, descrição);
- o texto do rodapé que limita o recorte do desenho;
- as palavras do título que sugerem cada família e função.

O sistema SHALL vir com um perfil semeado genérico ("Quadro de materiais por desenho") e permitir criar, duplicar e editar perfis, e ligar um perfil padrão a cada emissor. O perfil MUST poder ser testado com um PDF de amostra antes de salvar, mostrando as estruturas e linhas que ele encontra. Um padrão de texto inválido MUST ser recusado com a indicação do campo.

#### Scenario: Norma de outro layout
- **WHEN** o cliente importa a norma de um emissor cujo quadro de materiais tem as colunas na ordem "código, descrição, quantidade" e uma coluna só
- **THEN** o administrador duplica o perfil genérico, ajusta a ordem e o número de colunas, testa com 5 páginas de amostra e a importação passa a ler a norma com esse perfil

#### Scenario: Escolha do perfil na importação
- **WHEN** a importação é de uma norma do emissor X, que tem um perfil padrão
- **THEN** o assistente já vem com esse perfil escolhido, e a pessoa pode trocar antes de processar

#### Scenario: Padrão inválido
- **WHEN** o administrador salva o perfil com o padrão do título do desenho mal formado
- **THEN** o sistema recusa com o erro no campo "Título do desenho: padrão inválido"

### Requirement: Importação por planilha modelo
Para normas que nenhum perfil consegue ler (PDF digitalizado, layout muito diferente ou norma sem PDF), o sistema SHALL aceitar uma planilha modelo (.xlsx) com uma aba de estruturas, uma de materiais, uma de fixação e uma de recomendações, baixável na própria tela. A planilha MUST passar pelo mesmo rascunho, pelas mesmas pendências e pela mesma publicação da importação do PDF. Os desenhos e as fotos entram depois, por upload na estrutura.

#### Scenario: Norma digitalizada
- **WHEN** a importação do PDF termina com "Este PDF não tem texto para ler"
- **THEN** a mensagem oferece "Baixar planilha modelo", e a planilha preenchida gera o mesmo rascunho para revisão

#### Scenario: Linha da planilha com erro
- **WHEN** a aba de materiais tem uma linha com quantidade "três"
- **THEN** o rascunho abre a pendência "Quantidade inválida na linha 14 da aba Materiais", sem descartar a planilha inteira

### Requirement: Regras de código configuráveis
Estas regras SHALL ser configuráveis e testáveis na própria tela, com um campo de exemplo que mostra o resultado:
- **sufixos de variação do código do kit,** usados na sugestão de vínculo e na leitura do poste. É uma lista de padrões, e a semente cobre `-11/300`, `-12/600`, `.A` e `-PR`;
- **normalização do código de material,** usada para casar a norma com o estoque. As opções são: tirar zeros à esquerda (padrão sim), tirar espaços e pontos (padrão sim) e um prefixo a ignorar (padrão vazio);
- **padrão de leitura do poste,** com comprimento e resistência a partir da descrição do material.

#### Scenario: Sufixo próprio do cliente
- **WHEN** o cliente usa kits como `N1/C` para a variação com cruzeta de concreto e cadastra o sufixo `/C`
- **THEN** o kit `N1/C` passa a receber a sugestão da estrutura N1, e o campo de teste mostra `N1/C → N1`

#### Scenario: Código de material com prefixo
- **WHEN** o estoque do cliente guarda os códigos como `MAT-134830013` e a norma traz `134830013`
- **THEN** com o prefixo `MAT-` configurado para ser ignorado, a arruela da norma casa com o material do estoque

### Requirement: Dicionário de elementos visuais
A derivação dos elementos visuais esperados SHALL usar um dicionário configurável: termo da descrição do material, elemento visual, tipo e se soma a quantidade. A semente traz termos genéricos (cruzeta, isolador pilar, isolador de ancoragem, chave fusível, chave faca, para-raios, transformador, estai) e permite incluir termos e sinônimos da norma do cliente. Mudar o dicionário SHALL oferecer recalcular os elementos das estruturas que ainda não foram corrigidas à mão.

#### Scenario: Sinônimo de outra norma
- **WHEN** a norma de um emissor chama o isolador de "isolador polimérico de suspensão" e o administrador cadastra esse termo como "isolador de ancoragem"
- **THEN** as estruturas dessa norma passam a ter isoladores de ancoragem nos elementos esperados, menos as que foram corrigidas à mão

### Requirement: Escopo configurável da IA
A lista dos elementos que a IA avalia e a lista dos itens que ela ignora (semente: parafuso, arruela, porca, conector, coxim) SHALL ser configuráveis. O texto de instrução ao modelo MUST ser montado a partir dessas listas, e não de um texto fixo de cliente.

#### Scenario: Cliente quer avaliar a placa de identificação
- **WHEN** o administrador inclui "placa de identificação" nos elementos avaliados
- **THEN** os pareceres novos passam a trazer observações sobre a placa, e os pareceres antigos continuam como estavam

### Requirement: Configuração exportável
Perfis de leitura, dicionário, regras de código e escopo da IA SHALL poder ser exportados e importados em um arquivo JSON, para levar a configuração de uma implantação para outra (por exemplo, um cliente novo que trabalha para a mesma distribuidora). A importação MUST mostrar o que será criado ou substituído antes de gravar e MUST NOT levar normas, estruturas, imagens ou dados de obra.

#### Scenario: Levar o perfil para um cliente novo
- **WHEN** o administrador exporta o perfil de leitura e o dicionário de uma implantação e importa o arquivo em outra
- **THEN** a implantação nova recebe o perfil e o dicionário, e nenhuma norma, estrutura ou imagem da implantação de origem
