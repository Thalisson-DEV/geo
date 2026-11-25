## ADDED Requirements

### Requirement: Parecer da IA sobre a foto do ponto
Para uma foto do book de um ponto que tem pelo menos um kit ligado a uma estrutura do catálogo, o sistema SHALL poder pedir ao modelo com visão um parecer que compare a foto com o desenho e com as fotos de referência CORRETO e ERRO_COMUM da estrutura. O parecer MUST ter:
- um resultado: CONFERE, DIVERGE, INCONCLUSIVO ou NAO_ANALISADO;
- a estrutura analisada;
- uma lista de observações curtas, cada uma com o elemento (cruzeta, isolador, chave, para-raios, estai, transformador, aterramento, amarração, outro), o esperado, o visto e uma confiança (alta, média, baixa);
- o modelo usado, a revisão da norma, a duração e a data.

O parecer só SHALL ser pedido para fotos da etapa "depois" (estrutura pronta) ou sem etapa definida.

#### Scenario: Estrutura confere
- **WHEN** a foto depois de uma N1 mostra uma cruzeta T com 3 isoladores pilar no topo
- **THEN** o parecer fica CONFERE, com a observação "Cruzeta · esperado 1 tipo T · visto 1 tipo T · alta"

#### Scenario: Estrutura diverge
- **WHEN** o ponto tem o kit N4 e a foto mostra uma única cruzeta com isoladores pilar, sem isoladores de ancoragem
- **THEN** o parecer fica DIVERGE, com "Cruzeta · esperado 2 · visto 1 · média" e "Isolador de ancoragem · esperado 6 · visto 0 · média"

#### Scenario: Foto sem a estrutura
- **WHEN** a foto mostra o chão ou o caminhão
- **THEN** o parecer fica INCONCLUSIVO, com a observação "A estrutura não aparece na foto"

#### Scenario: Ponto sem estrutura ligada
- **WHEN** nenhum kit do ponto está ligado ao catálogo
- **THEN** o sistema não pede o parecer e a foto fica sem parecer, sem erro

### Requirement: Elementos visuais esperados da estrutura
Cada estrutura do catálogo SHALL ter uma lista de elementos visuais esperados (elemento, quantidade, tipo), usada como gabarito do parecer. Na publicação, a lista MUST ser derivada automaticamente da lista de materiais pelo dicionário de elementos visuais da configuração (na semente: cruzeta soma cruzetas, "isolador pilar" soma isoladores pilar, "isolador ancoragem" soma isoladores de ancoragem, e o mesmo vale para chave, para-raios, transformador e estai). O administrador SHALL poder corrigir a lista. Uma estrutura sem elemento visual MUST NOT receber parecer.

#### Scenario: Derivar da N4
- **WHEN** a N4 é publicada com 2 cruzetas tipo T, 3 isoladores pilar e 6 isoladores de ancoragem na lista de materiais
- **THEN** os elementos esperados da N4 ficam "cruzeta T · 2", "isolador pilar · 3" e "isolador de ancoragem · 6"

#### Scenario: Estrutura de aterramento
- **WHEN** a estrutura "Malha de aterramento" não tem nenhum elemento visível no alto do poste
- **THEN** a lista fica vazia e as fotos de pontos só com essa estrutura não recebem parecer

### Requirement: IA nunca reprova sozinha
O parecer SHALL ser apenas uma sugestão para o revisor. Nenhum parecer MUST mudar a revisão da foto (pendente, aprovada, reprovada), a medição, o ranking das equipes ou qualquer pendência da equipe. Só a decisão do revisor muda a revisão da foto.

#### Scenario: Parecer DIVERGE sem revisão
- **WHEN** o parecer de uma foto fica DIVERGE e ninguém revisou a foto
- **THEN** a foto continua PENDENTE, entra na medição pelas regras atuais e não aparece como reprovada no app da equipe

### Requirement: Aceitar ou descartar o parecer
Na revisão de fotos, o revisor SHALL ver o parecer ao lado da foto, com a foto de referência e o desenho da estrutura, e registrar se concorda (o parecer está certo) ou discorda (o parecer está errado). Quando o revisor reprova uma foto com parecer DIVERGE, o sistema SHALL sugerir uma inconformidade nova, "Estrutura fora do padrão", com as observações do parecer no texto, para o revisor editar. Essa inconformidade MUST ser incluída na lista de motivos de reprovação. Ela só entra no ranking de qualidade das fotos da equipe quando o parâmetro correspondente estiver ligado (padrão desligado).

#### Scenario: Revisor concorda e reprova
- **WHEN** o revisor abre a foto com parecer DIVERGE, concorda e clica em "Reprovar"
- **THEN** o diálogo de reprovação vem preenchido com "Estrutura fora do padrão · Isolador de ancoragem: esperado 6, visto 0", e só é gravado depois de o revisor confirmar

#### Scenario: Revisor discorda
- **WHEN** o revisor discorda do parecer DIVERGE e aprova a foto
- **THEN** a foto fica aprovada e o parecer fica marcado como "discordado pelo revisor", entrando na métrica de acerto

### Requirement: Quando o parecer é pedido
O parecer SHALL ser pedido em segundo plano quando a foto chega ao servidor, se o parecer automático estiver ligado nos parâmetros do padrão construtivo, e SHALL poder ser pedido à mão pelo revisor ("Pedir parecer da IA"). A fila MUST limitar as análises simultâneas e por hora pelos parâmetros (padrão 4 e 300) e MUST NOT atrasar o recebimento da foto nem a sincronização do app. Sem modelo com visão configurado, o resultado MUST ser NAO_ANALISADO e a ação manual MUST ficar oculta.

#### Scenario: Visão desligada
- **WHEN** a implantação não tem modelo com visão configurado
- **THEN** as fotos ficam sem parecer, a tela de revisão não mostra o bloco da IA e nada mais muda

#### Scenario: Muitas fotos de uma vez
- **WHEN** uma equipe sincroniza 300 fotos de uma vez, com o limite de 4 análises simultâneas
- **THEN** as fotos são recebidas na hora, e os pareceres chegam aos poucos, com "Parecer em análise" na revisão até ficarem prontos

#### Scenario: Erro do modelo
- **WHEN** o modelo demora mais do que o limite ou responde num formato inválido
- **THEN** o parecer fica NAO_ANALISADO, com o motivo, e o revisor pode pedir de novo

### Requirement: Escopo do que a IA avalia
O pedido ao modelo SHALL limitar a avaliação aos elementos avaliados do escopo configurável da IA (semente: o tipo e a quantidade de cruzetas, a quantidade e o tipo de isoladores, as chaves, os para-raios, o estai, o transformador, o aterramento aparente e a presença de amarração pré-formada). O pedido MUST instruir o modelo a responder INCONCLUSIVO, em vez de adivinhar, sobre os itens ignorados do escopo (semente: parafusos, arruelas, porcas, conectores e coxins), e a nunca afirmar medida em milímetros. As observações sobre esses itens pequenos MUST ser descartadas antes de gravar o parecer.

#### Scenario: Modelo comenta arruela
- **WHEN** a resposta do modelo traz "Arruela quadrada · esperado 4 · visto 2"
- **THEN** a observação é descartada e não aparece no parecer

### Requirement: Fotos faltantes no mesmo painel
A revisão de fotos SHALL ter um painel por obra que junta, ponto a ponto: as fotos obrigatórias que faltam (pela regra do modelo de fotos que já existe), as fotos com parecer DIVERGE ainda não revisadas e as fotos reprovadas aguardando nova foto. O painel MUST filtrar por equipe e por período e ordenar pelos pontos com mais problemas.

#### Scenario: Ponto com foto faltando e foto divergente
- **WHEN** o ponto 12 da obra não tem a foto "depois" obrigatória e o ponto 15 tem uma foto com parecer DIVERGE
- **THEN** o painel mostra o ponto 12 com "Falta foto depois" e o ponto 15 com "IA: estrutura diverge (N4)", cada um com o link para o ponto

### Requirement: Métrica de acerto da IA
O sistema SHALL medir, por período, por estrutura e por resultado, quantos pareceres o revisor concordou e quantos discordou, e quantos ficaram INCONCLUSIVO ou NAO_ANALISADO. O web SHALL mostrar essa métrica para o administrador de Obras decidir se mantém a análise automática ligada.

#### Scenario: Acerto por estrutura
- **WHEN** no mês houve 40 pareceres revisados da N1, com 36 concordados, e 20 da TE, com 9 concordados
- **THEN** a métrica mostra N1 com 90% e TE com 45%, e a TE aparece marcada como "baixa confiança"

#### Scenario: Desligar por estrutura
- **WHEN** o administrador desliga a análise automática para a TE
- **THEN** as fotos novas de pontos com a TE deixam de receber parecer automático, e o pedido manual continua disponível

### Requirement: Privacidade e custo da análise
As imagens enviadas ao modelo SHALL ser reduzidas para no máximo 1600 px no lado maior e MUST NOT levar coordenadas, nome de pessoa, matrícula ou nome de equipe no texto do pedido. Cada parecer SHALL guardar a quantidade de imagens enviadas e o uso de tokens informado pelo provedor, quando houver, para acompanhar o custo.

#### Scenario: Pedido sem dados pessoais
- **WHEN** o parecer de uma foto da equipe CON-RMS-01 é pedido
- **THEN** o texto enviado ao modelo traz só a estrutura, a norma, os elementos esperados e as imagens, sem a equipe, as pessoas ou a localização
