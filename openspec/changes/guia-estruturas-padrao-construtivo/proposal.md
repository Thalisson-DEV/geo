## Why

O padrão construtivo das estruturas (o desenho, a lista de materiais com os códigos da distribuidora, a fixação conforme o poste e as recomendações de montagem) hoje fica em normas técnicas de 40 a 275 páginas e numa cartilha de treinamento em apresentação. A equipe não leva nenhum dos dois para o campo. Os kits construtivos do sistema são montados à mão, sem conferência com a norma, e o escritório revisa as fotos do book sem ter ao lado a estrutura padrão para comparar.

Em 25/11/2026 o contratante pediu três coisas:
- que o encarregado toque na estrutura do ponto e veja a imagem e os dados dela, no lugar da cartilha impressa nos caminhões;
- que os kits de estrutura sigam a norma, o que ele considera o mais importante;
- que a IA ajude a criticar as fotos: se a foto foi tirada e se a estrutura bate com o padrão.

As três normas recebidas trazem texto extraível e um quadro de materiais por estrutura. Por isso dá para montar o catálogo sem digitar e sem depender de IA para os dados.

## What Changes

- **Catálogo de estruturas (novo cadastro em Obras).**
  - **Norma técnica:** o documento-fonte, com código, revisão, data de homologação, classes de tensão e o PDF original. Cada revisão é guardada separadamente; uma está vigente e as anteriores ficam para consulta.
  - **Estrutura padrão da norma:** código (N1, B3, S1I, U4, TE…), nome, família (monofásica, bifásica, trifásica, beco, sem cruzeta, baixa tensão, estaiamento, equipamento), função (passagem/tangente, ângulo, ancoragem, fim de linha, derivação, seccionamento, transição, equipamento), desenho, lista de materiais (item do desenho, código do material, quantidade, descrição), tabela de fixação conforme o comprimento e a resistência do poste, materiais que dependem de outra tabela (poste, alça, laço) e recomendações de montagem.
  - **Mídias:** o desenho recortado da norma e as fotos de referência de campo, com legenda e setas já desenhadas na imagem. Cada foto é marcada como "correta" ou "erro comum".
  - Tudo é editável e versionado. Nada fica fixo no código.
- **Importação assistida de norma em PDF.** O sistema lê o PDF sem IA e propõe as estruturas, com quadros de materiais, fixação e o recorte do desenho. A pessoa revisa (o sistema aponta o que não conseguiu ler, como materiais sem código ou quantidades estranhas) e publica. Reimportar uma revisão nova da norma mostra o que mudou em cada estrutura antes de publicar.
- **Importação assistida da cartilha (.pptx).** O sistema separa as imagens de cada slide, descarta logotipos repetidos e sugere a estrutura pelo título do slide. A pessoa escolhe quais imagens viram foto de referência e quais textos viram recomendação. Os dados (materiais e fixação) nunca vêm da cartilha, só da norma.
- **Guia de estruturas para consulta.**
  - **No web:** uma tela de consulta, com busca por código e nome e filtros por família, função, tensão e norma, além do detalhe da estrutura.
  - **No app de campo, offline:** a estrutura abre a partir do kit no ponto, na execução, ou de uma busca livre. O app mostra o desenho com zoom, as fotos, os materiais com a quantidade já calculada para o poste do ponto (quando o poste é conhecido) e as recomendações. O guia entra no pacote offline.
- **Kit construtivo ligado à estrutura.** O kit passa a apontar, de forma opcional, para uma estrutura do catálogo. O sistema sugere o vínculo pelo código e compara os materiais do kit com a lista da norma: falta, sobra, quantidade diferente e material sem cadastro no estoque. A comparação **só avisa**, nunca bloqueia, e mostra o resultado no cadastro do kit e no planejamento.
- **Crítica da foto pela IA, como sugestão ao revisor.** Na revisão das fotos, a foto do ponto ganha um parecer opcional da IA (confere, diverge, inconclusivo), comparando com o desenho e com as fotos de referência da estrutura. Ela só aponta o que se vê numa foto de campo (tipo e quantidade de cruzetas, isoladores, chaves, para-raios, estai, transformador). A IA **nunca reprova sozinha**: o revisor aceita ou descarta o parecer, e o sistema mede quanto a IA acerta. A foto que falta continua vindo da regra do modelo de fotos e entra no mesmo painel.

### Fica para etapas futuras
- A leitura do projeto pela Bússola usar o catálogo para propor os kits do ponto a partir da estrutura desenhada no projeto.
- Gerar kits automaticamente a partir da estrutura (com o preço do serviço por contrato).
- A crítica da foto ainda no app, antes do envio (avisar a equipe enquanto ela está no poste).
- Redes compactas e subterrâneas, e as normas de outras distribuidoras além das três recebidas. O modelo já comporta, mas as sementes e as validações desta change cobrem as três.
- Treinamento e quiz para as equipes com base no guia.

## Capabilities

### New Capabilities
- `catalogo-estruturas`: cadastro das normas técnicas (com revisões), das estruturas padrão, dos materiais, da fixação conforme o poste, das mídias e das recomendações; regras de vigência e versionamento; permissões.
- `importacao-norma-estruturas`: importação assistida do PDF da norma e da apresentação de treinamento, com revisão, apontamento de pendências, comparação entre revisões e publicação.
- `guia-estruturas-campo`: consulta do guia no web e no app de campo (offline), a partir do ponto, do kit ou de uma busca, com o cálculo dos materiais conforme o poste.
- `kit-estrutura-conformidade`: vínculo opcional do kit construtivo com a estrutura do catálogo, sugestão automática do vínculo e comparação de materiais contra a norma (só avisa).
- `critica-foto-estrutura`: parecer da IA sobre a foto do ponto contra a estrutura padrão, como sugestão ao revisor, com aceite ou descarte, métricas de acerto e o painel de fotos faltantes.

### Modified Capabilities
<!-- Ainda não existe openspec/specs/ consolidado; os comportamentos alterados de kits e da revisão de fotos estão descritos nas capacidades novas acima. -->

## Impact

- **Backend `obras`:**
  - Tabelas novas: `normas_tecnicas`, `estruturas_padrao`, `estruturas_padrao_materiais`, `estruturas_padrao_fixacoes`, `estruturas_padrao_midias`, `estruturas_padrao_recomendacoes`, `importacoes_norma` e `pareceres_foto_ia`.
  - Colunas novas: `id_estrutura_padrao` em `kits_construtivos`.
  - Caso de uso de importação (PDFBox para o PDF, Apache POI para o .pptx).
  - Comparação kit × norma.
  - O parecer da IA usa a visão já existente (`CopilotoApi.completarComImagens`).
  - O guia entra no pacote offline (`PacoteCampoObras`).
  - Permissões novas: `obras:estrutura:read`, `obras:estrutura:write`, `obras:estrutura:import`. O parecer fica sob `obras:documentacao:write`.
- **Backend `estoque`:** só leitura do material pelo código, pela API pública existente, para casar o código da norma com o material cadastrado.
- **Frontend web (`features/obras`):** cadastro das normas e estruturas, assistente de importação, tela do guia, indicador de conformidade no kit e no planejamento, e o parecer da IA na revisão de fotos.
- **Mobile (`features/obras`):** visualizador da estrutura (desenho com zoom, fotos, materiais, recomendações), entrada pela execução do ponto e pela busca, e armazenamento offline das imagens (Dexie + cache do service worker).
- **Armazenamento:** as imagens recortadas e as fotos de referência vão para o `ObjectStorageService`, com miniatura. O PDF original da norma também é guardado.
- **White label:** nenhuma norma, código de material ou imagem entra como semente no código. O catálogo é carregado por implantação, pela importação.
- **Sem quebra:** os kits sem vínculo continuam funcionando como hoje.
