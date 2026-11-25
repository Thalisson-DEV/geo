## Context

**Situação atual em Obras:**
- `KitConstrutivo`/`ItemKit` (serviço ou material por contrato, com classes de tensão) é aplicado no ponto como `KitAplicado`/`ItemPlanejado`, com cópia dos itens.
- `PontoPlanejamento` (poste, transformador, chave, estrutura na folha do projeto) não guarda o comprimento nem a resistência do poste.
- O book de fotos é feito de `EvidenciaPonto` (item do `ModeloChecklistObra`, etapa antes/durante/depois, revisão PENDENTE/APROVADA/REPROVADA com o enum `Inconformidade`). A revisão fica em `RevisaoFotosUseCases`, com ranking por equipe.
- O pacote offline do app é o `PacoteCampoObras`.
- A visão por IA já existe: `CopilotoApi.completarComImagens` e `completarComImagensProjeto`, com `visaoDisponivel()`.
- O PDF já é lido com PDFBox (`LeitorVetorialProjeto`).
- O material está no módulo `estoque` e é lido pela `EstoqueApi.buscarMaterialAtivoPorCodigo`.
- O armazenamento de arquivos usa o `ObjectStorageService`.
- O processamento em segundo plano segue o padrão `@Async` do `ProcessarAnaliseProjetoService`.

**Material recebido (25/11/2026):**
- Três normas em PDF com texto, 579 páginas no total. Cada estrutura tem o título "Desenho NN - … – Estrutura X", o "Quadro NN - Lista de Materiais referente ao Desenho NN – Estrutura X" (duas colunas lado a lado: item, código, quantidade, descrição) e o "Quadro NN - Lista de Fixação…" (comprimento × resistência do poste).
- Os códigos de material são numéricos (9 dígitos), "Tabela NN" (depende de tabela) ou "0" (sem código).
- Uma apresentação .pptx de 71 slides: em cada slide, um desenho e um quadro em imagem (de uma revisão antiga da norma), fotos de campo com setas, 3 logotipos repetidos e textos de recomendação.

**Restrições:**
- White label: o nome da distribuidora não entra em código, sementes nem textos.
- Tudo configurável.
- O app é offline-first, 70% em tablet.
- A IA só sugere.
- Compacto no web e com toque grande no app.
- Sem `::ng-deep`/`!important`, e tudo via `@geo/ui`.

## Goals / Non-Goals

**Goals:**
- Carregar as três normas no catálogo sem digitar, com revisão humana das pendências.
- Levar o guia ao campo offline e abrir a estrutura certa a partir do ponto.
- Conferir os kits contra a norma, só avisando.
- Ter um parecer da IA na revisão de fotos, com métrica de acerto para decidir se vale manter.

**Non-Goals:**
- Gerar kits ou propor os kits do ponto a partir do projeto (etapa futura, com a Bússola).
- Usar a IA para extrair os dados da norma. A extração é determinística, e a IA não entra na importação.
- Parecer da IA no aparelho, antes do envio.
- Rede compacta e subterrânea (o modelo comporta, mas não há validação específica).
- Editar o desenho (o catálogo guarda imagem, não vetor).

## Decisions

### D1. O catálogo fica dentro do módulo `obras`
O kit, o ponto, a evidência e o pacote de campo, que são os consumidores, estão em `obras`. Um módulo `normas` separado obrigaria a criar eventos e APIs para cada leitura (o kit pergunta a estrutura, o pacote pergunta o guia, a revisão de fotos pergunta os elementos) sem ganho de isolamento: ninguém fora de Obras usa o catálogo.
- O pacote é `com.nexo.app.modules.obras` (subpastas `domain/estrutura`, se o padrão da casa permitir, ou o prefixo `EstruturaPadrao*`/`NormaTecnica*` nas pastas atuais).
- **Alternativa recusada:** um módulo novo. Pode ser reavaliado quando outro domínio, como SST ou almoxarifado, precisar do catálogo.

### D2. Modelo de dados
- **`normas_tecnicas`:**
  - `id`, `codigo` (texto livre, digitado ou lido do PDF), `titulo`, `revisao`, `data_homologacao` (date), `situacao` (RASCUNHO/VIGENTE/SUBSTITUIDA);
  - `chave_pdf`, `nome_arquivo`, `paginas`, `sem_documento_fonte` (bool);
  - mais as colunas da BaseEntity.
  - Índice único parcial `(lower(codigo)) WHERE situacao='VIGENTE' AND ativo`.
- **`normas_tecnicas_tensoes`:** `id_norma`, `classe_tensao` (o enum `ClasseTensao` existente).
- **`estruturas_padrao`:**
  - `id_norma`, `codigo`, `codigo_normalizado` (único por norma, entre as ativas), `nome`, `familia` e `funcao` (código da opção nas listas configuráveis), `fases` (1/2/3/null);
  - `referencia_desenho` ("Desenho 70"), `pagina_desenho`, `referencia_quadro`, `pagina_quadro`, `versao_conteudo` (bigint, sobe a cada mudança e serve de carimbo para o app);
  - `conformidade_dirty` (bool, usado pelo recálculo);
  - `elementos_visuais` (jsonb: `[{elemento, tipo, quantidade}]`, derivado e editável);
  - `apelidos` (text[]).
- **`estruturas_padrao_materiais`:** `id_estrutura`, `ordem`, `item_desenho`, `codigo_material` (nulo quando depende de tabela ou não tem código), `referencia_tabela` ("Tabela 30"), `descricao`, `quantidade` (numeric > 0), `unidade`, `origem_pagina`, `pendencia_aceita` (texto).
- **`estruturas_padrao_fixacoes`:** `id_estrutura`, `item_desenho`, `codigo_material`, `descricao`, `comprimento_poste` (texto, porque a norma usa "12/13"), `resistencia_dan` (int), `quantidade` (numeric, nulo = não se aplica). Única por (estrutura, código, comprimento, resistência).
- **`estruturas_padrao_midias`:** `id_estrutura` (nulo quando é mídia geral da norma, com `id_norma`), `tipo` (DESENHO/FOTO_REFERENCIA/DETALHE), `classificacao` (CORRETO/ERRO_COMUM/null), `legenda`, `ordem`, `origem` (NORMA/APRESENTACAO/UPLOAD), `origem_ref` ("p.146", "slide 30"), `chave_storage`, `chave_tela` (1600 px), `chave_miniatura` (320 px), `largura`, `altura`, `hash_conteudo` (sha-256), `rotulos` (jsonb opcional: `[{item, x, y}]` normalizados de 0 a 1, para destacar o item no desenho).
- **`estruturas_padrao_recomendacoes`:** `id_estrutura` ou `familia` + `id_norma` (alcance), `texto`, `gravidade` (INFORMATIVA/ATENCAO/REPROVA_OBRA), `ordem`, `origem`, `origem_ref`.
- **Família e função:** usam a tabela `opcoes_lista` que já existe (V273), com as listas `ESTRUTURA_FAMILIA` e `ESTRUTURA_FUNCAO` e as sementes descritas na spec. As sementes são genéricas, de domínio elétrico, sem marca. O registro guarda o código da opção, como as demais listas configuráveis.
- **`importacoes_norma`:** `tipo` (PDF_NORMA/PPTX_APRESENTACAO), `situacao` (PROCESSANDO/RASCUNHO/PUBLICADA/FALHOU/DESCARTADA), `id_norma_destino`, `chave_arquivo`, `progresso_pagina`, `total_paginas`, `rascunho` (jsonb com as estruturas lidas e as pendências), `contagens` (jsonb), `erro`, `duracao_ms`.
- **`kits_construtivos`:** ganha `id_estrutura_padrao`, `conformidade_situacao` (CONFERE/DIVERGENTE/SEM_ESTRUTURA/FORA_DA_VIGENTE), `conformidade_divergencias` (int), `conformidade_calculada_em`, `conformidade_revisao`.
- **`kits_aplicados`:** ganha `id_estrutura_padrao`, `revisao_norma` (cópia no momento da aplicação, como `codigoKit`).
- **`pareceres_foto_ia`:** `id_evidencia` (único, entre os ativos), `id_estrutura`, `revisao_norma`, `resultado`, `observacoes` (jsonb), `modelo`, `duracao_ms`, `imagens_enviadas`, `tokens_entrada`, `tokens_saida`, `motivo_falha`, `avaliacao_revisor` (CONCORDA/DISCORDA/null), `avaliado_por`, `avaliado_em`, `origem` (AUTOMATICO/MANUAL).
- **`usos_guia_estrutura`:** `id_estrutura`, `id_obra`, `id_ponto`, `id_equipe`, `aberto_em`, `id_local` (id do aparelho, para não duplicar).
- **`EvidenciaPonto.Inconformidade`:** ganha `ESTRUTURA_FORA_PADRAO("Estrutura fora do padrão")`.
- **Migrações:** a partir de `V277`, uma por frente (catálogo, importação, kit, parecer, uso), para facilitar a reversão.

**Por que tabelas e não jsonb para materiais e fixação:** a comparação com o kit, o recálculo por código de material e a busca "quais estruturas usam o código X" precisam de índice. O jsonb fica só para o rascunho da importação e para os elementos visuais.

### D3. Extração do PDF por layout (PDFBox), sem IA
É um `LeitorNormaEstruturas` determinístico:
1. Lê a página com `PDFTextStripper` em ordem de posição e guarda as posições (`TextPosition`).
2. Acha os títulos por expressão regular:
   - `Desenho\s+(\d+)\s*-\s*(.+?)\s*[–-]\s*Estrutura\s+(.+)$`;
   - `Quadro\s+(\d+)\s*-\s*Lista de Materiais referente ao Desenho\s+(\d+)`;
   - `Lista de Fixação`.
   O título do desenho também ignora o prefixo da família ("Rede de Média Tensão Trifásica").
3. **Quadro de materiais:** agrupa as palavras em linhas pela coordenada y (com tolerância), divide a página pela metade da largura (duas colunas lado a lado) e reconhece, em cada metade, o padrão `item (A-02|0-01|M-14…) · código (\d{6,}|Tabela \d+|0) · quantidade (\d{1,3}) · descrição`. Descrições em várias linhas são juntadas até o próximo item.
4. **Fixação:** a linha de comprimentos dá as faixas de x de cada comprimento. A linha de resistências (texto girado 90°: o PDFBox entrega cada caractere com rotação, e os dígitos são agrupados por x) dá as colunas. As linhas de dados são casadas pelas colunas de x. Um "-" vira nulo.
5. Um quadro que continua na página seguinte é reconhecido quando a página seguinte começa com linhas de dados sem título novo.
6. **Recorte do desenho:** a região vai do y do título "Desenho NN" até o próximo título ou o rodapé ("DOCUMENTO NÃO CONTROLADO"). Ela é renderizada com `PDFRenderer` a 200 dpi e recortada; as margens brancas são cortadas por análise de pixels.
7. **Rótulos do desenho:** quando o desenho é vetorial com texto, as posições dos rótulos `[A-Z]-\d{2}` dentro da região viram `rotulos` normalizados, de graça.

O leitor é testado com fixtures: páginas extraídas das três normas, que ficam em `src/test/resources`, privadas e fora do pacote final.
- **Alternativas recusadas:**
  - Mandar as páginas ao modelo com visão: é caro (cerca de 580 páginas), não determinístico e inventa números (a memória [[bussola-modelo-projeto]] registra que o modelo Flash inventa).
  - Tabula/Camelot: seria mais uma dependência, em Python.

### D4. Importação em duas fases (rascunho → publicação)
- **Rascunho:** o processamento gera o rascunho em jsonb na `importacoes_norma` e não toca no catálogo. As edições do rascunho são PATCHes no jsonb, com controle de versão otimista.
- **Publicação:** é uma transação que cria a norma (ou a revisão), as estruturas, os materiais, a fixação e as mídias (as imagens já foram para o storage no processamento, numa pasta `importacoes/{id}/`, e a publicação só referencia as chaves). Depois ela religa os kits, marca `conformidade_dirty` e publica `NormaPublicadaEvent` para o recálculo.
- **Comparação entre revisões:** é feita pelo `codigo_normalizado`. Os materiais são casados por (código ou descrição normalizada) e os desenhos pela distância de hash perceptual (dHash 64 bits, diferença maior que 10 = alterado).
- **Limpeza:** um rascunho descartado ou com mais de 30 dias tem as imagens apagadas por uma rotina de limpeza.

### D5. A apresentação via Apache POI (XSLF)
- `XMLSlideShow` percorre os slides, inclusive os grupos, e extrai `XSLFPictureShape` (bytes e posição) e os textos.
- Os logotipos são as imagens cujo sha-256 aparece em mais de 50% dos slides.
- A estrutura é casada pelo título: os códigos candidatos vêm da expressão regular `\b(\d?[A-Z]{1,3}\d?(?:[.\-][A-Z0-9]{1,4})*)\b`, que é cruzada com os `codigo_normalizado` e os apelidos do catálogo vigente. A sugestão é a do código mais longo que casar.
- O `poi-ooxml` já está no `pom.xml`, então não há dependência nova.
- A classificação das imagens (foto ou desenho) é **sugerida**: uma foto tem mais de 1500 cores distintas na miniatura, e um desenho ou tabela tem fundo branco predominante. A pessoa confirma.

### D6. Poste do ponto para a lista calculada
O ponto não guarda o poste. A ordem de resolução é:
1. um campo novo e opcional em `PontoPlanejamento` (`comprimento_poste`, `resistencia_poste_dan`), preenchido à mão no planejamento ou pela leitura do projeto quando houver;
2. a descrição de um item de material do tipo poste no kit aplicado ao ponto (expressão regular `(\d{1,2}(?:/\d{1,2})?)\s*(?:m)?\s*[/xX-]\s*(\d{3,4})\s*(?:daN)?`, por exemplo "Poste DT 11/600");
3. o sufixo do código do kit (`N3-11/600`).

Sem nenhum dos três, o poste é "desconhecido".
- **Alternativa recusada:** obrigar o poste no ponto, porque travaria o planejamento atual.

### D7. Conformidade calculada no servidor e guardada no kit
`ConformidadeKitService.calcular(kit, estrutura, poste?)` é uma função pura, testável, que devolve uma lista de `DivergenciaKit`. O resumo fica no kit (D2) e o detalhe é calculado sob demanda (é barato: cerca de 30 linhas).
- **Gatilhos:**
  - mudança no kit: síncrono, no próprio caso de uso;
  - mudança na estrutura ou norma publicada: `conformidade_dirty` + `@Async` em lotes de 200;
  - mudança no cadastro de materiais: o `estoque` publica `MaterialCadastradoEvent`/`MaterialDesativadoEvent` (se ainda não existirem, entram como eventos novos do estoque) e `obras` marca como pendentes os kits que contêm o código.
- **Casamento de material:** é feito pelo `Material.codigo` igual ao `codigo_material` da norma (sem diferença de caixa, sem espaços e sem zeros à esquerda). O kit guarda o `idMaterial`, então o código sai da `EstoqueApi` em lote (um método novo, `buscarMateriaisPorIds`, se ainda não existir).
- **Por que no servidor:** o web, o planejamento e o filtro da lista precisam do mesmo número, e o filtro exige a coluna guardada.

### D8. Guia offline no app
- O `PacoteCampoObras` ganha a seção `guia`: a lista de `{idEstrutura, versaoConteudo}` das estruturas relevantes (D2), mais o conjunto de dados das que mudaram desde o `versaoGuia` que o app informa. O endpoint é separado (`GET /api/obras/campo/guia?desde=`) para não engordar o pacote diário.
- **Imagens:** um endpoint de mídia com `Cache-Control: private, max-age=31536000, immutable` e a URL com o hash (`/api/obras/estruturas/midias/{id}/{hash}/tela.webp`). O app guarda o blob no Dexie (tabelas `estruturas`, `estruturasMidias`), porque o cache do service worker pode ser despejado pelo navegador e o Dexie, com `navigator.storage.persist()`, é mais estável. O ngsw continua cuidando do bundle.
- **Escopo:** as estruturas ligadas aos kits das obras da agenda e das obras abertas da base, mais todas as estruturas vigentes das classes de tensão dessas obras (para a busca livre). Se isso passar de 150 MB, entram só as ligadas, e a busca mostra "baixe com Wi-Fi" para as demais.
- **Uso do guia:** é registrado como uma fila de envio comum do `SyncService`, com idempotência por `id_local`.

### D9. Parecer da IA
- **Interface de domínio:** `AnaliseFotoEstrutura` em `obras/domain`, no mesmo desenho da `AnaliseFotoAbastecimento` de frota. Há uma implementação `AnaliseFotoEstruturaPorVisao`, que usa a `CopilotoApi.completarComImagens(…, comRaciocinio=false)`, e uma `…Desligada` (quando `!visaoDisponivel()`).
- **Imagens enviadas:** a foto do ponto, o desenho da estrutura e até 2 fotos de referência CORRETO e 1 de ERRO_COMUM, todas reduzidas a 1600 px, para no máximo 5 imagens.
- **Pedido ao modelo:** a mensagem de sistema fixa o escopo (spec "Escopo do que a IA avalia"). A mensagem do usuário leva o código e o nome da estrutura e os elementos visuais esperados em JSON, e pede a resposta em JSON estrito: `{resultado, observacoes:[{elemento, esperado, visto, confianca}]}`. A temperatura é 0.
- **Pós-processamento:** valida o JSON (inválido → NAO_ANALISADO), descarta os elementos fora da lista permitida (parafuso, arruela, porca, conector, coxim) e rebaixa para INCONCLUSIVO um DIVERGE em que todas as observações têm confiança baixa.
- **Fila:** um `EvidenciaRecebidaEvent` novo, publicado por `EvidenciaPontoUseCases` depois do commit, tratado por um listener `@Async` com semáforo (`obras.ia.foto.concorrencia`, padrão 4) e um limite por hora (`obras.ia.foto.limite-hora`, padrão 300), com as configurações de Obras ligando a análise automática (padrão desligado) e uma lista de estruturas excluídas.
- **Estrutura do ponto:** quando há vários kits ligados, a análise usa a estrutura do kit principal (o de maior número de elementos visuais). Quando o modelo de fotos pede foto por kit, usa a desse kit.
- **Alternativa recusada:** usar o modelo de leitura de projeto (`completarComImagensProjeto`). Ele está ajustado para pranchas, e a foto de campo é outro problema. Fica configurável se for preciso (`obras.ia.foto.usar-modelo-projeto`).

### D10. Telas
- **Web, Guia (`features/obras/estruturas`):**
  - A lista segue o padrão "tabela primeiro" (`geo-page-header`, `geo-filter-panel`, `geo-data-table` lazy + `PageResponse`).
  - O detalhe é uma página própria (não drawer), porque tem desenho grande e várias seções.
  - O zoom do desenho usa um componente novo do `@geo/ui`, `geo-image-viewer` (pinça e roda com transform CSS, sem dependência nova).
- **Web, Importação:** é um assistente em passos (enviar → processando → revisar → comparar → publicar). A revisão é uma tabela de estruturas, com a coluna de pendências e um painel lateral de edição. A página do PDF é mostrada com o recorte sobreposto para ajuste.
- **Web, Kits:** a coluna "Norma" usa uma tag em caixa de frase ("Confere", "2 divergências"), e o detalhe tem a aba "Norma".
- **Web, Revisão de fotos:** o bloco "Parecer da IA", com a foto de referência ao lado, os botões Concordo/Discordo e o painel de problemas por obra.
- **Mobile:**
  - `features/obras/estrutura-visualizador.component.ts`, aberto pela execução do ponto e pela entrada "Guia de estruturas" na área de Obras;
  - alvos de 48 px, desenho em tela cheia e carrossel de fotos;
  - os tokens `--geo-*` do app de campo.
- **Validação visual:** as capturas em claro e escuro passam pelo `ui-reviewer` e pela avaliação no Chrome do usuário ([[avaliar-no-chrome]]).

### D11. API (resumo)
- **Normas:** `GET/POST /api/obras/normas`, `GET /api/obras/normas/{id}`, `POST /api/obras/normas/{id}/publicar`.
- **Estruturas:**
  - `GET /api/obras/estruturas` (filtro + `PageResponse`), `GET /api/obras/estruturas/{id}`;
  - `GET /api/obras/estruturas/{id}/materiais?comprimento=&resistencia=` (a lista calculada);
  - `PUT /api/obras/estruturas/{id}` (com `justificativa` quando a norma está vigente);
  - CRUD de `/materiais`, `/fixacoes`, `/midias` (multipart), `/recomendacoes` e `/elementos-visuais`.
- **Importações:**
  - `POST /api/obras/importacoes-norma` (multipart, tipo);
  - `GET /api/obras/importacoes-norma/{id}` (com progresso);
  - `PATCH /api/obras/importacoes-norma/{id}/rascunho`;
  - `GET /api/obras/importacoes-norma/{id}/comparacao`;
  - `POST /api/obras/importacoes-norma/{id}/publicar`, `POST …/descartar`.
- **Kits:**
  - `PUT /api/obras/kits/{id}/estrutura`, `GET /api/obras/kits/{id}/conformidade`;
  - `POST /api/obras/kits/{id}/ajustar-a-norma` (com a lista de mudanças confirmadas);
  - `GET /api/obras/kits/sugestoes-estrutura?idContrato=`, `POST /api/obras/kits/vincular-estruturas` (em lote).
- **Campo:** `GET /api/obras/campo/guia?desde=`, `GET /api/obras/estruturas/midias/{id}/{hash}/{tamanho}`, `POST /api/obras/campo/usos-guia`.
- **Pareceres:**
  - `POST /api/obras/evidencias/{id}/parecer-ia`, `PUT /api/obras/evidencias/{id}/parecer-ia/avaliacao`;
  - `GET /api/obras/revisao-fotos/painel?idObra=`, `GET /api/obras/pareceres-ia/metricas?inicio=&fim=`.
- **Erros:** todos em ProblemDetail, com `errors[]` por campo.

## Risks / Trade-offs

- **[A extração erra num quadro com layout diferente]** → Testes com fixtures das três normas, a pendência "quantidade fora do comum", a revisão obrigatória antes de publicar e a edição com auditoria. A meta é ao menos 95% das linhas certas na NT de 275 páginas, medida contra uma amostra de 20 estruturas conferidas à mão.
- **[O texto girado da fixação]** → O PDFBox entrega a rotação. Se uma norma vier com as resistências como imagem, a fixação fica pendente ("fixação não lida") e é preenchida à mão. Isso não bloqueia o resto da estrutura.
- **[O código de material da norma ≠ o código do estoque]** → SEM_CADASTRO não é divergência do kit, e há um relatório "códigos da norma sem material" para o almoxarifado cadastrar. Uma tabela de equivalência de código fica como pergunta em aberto.
- **[O tamanho do guia no aparelho]** → As imagens têm no máximo 1600 px em WebP (de 150 a 300 KB). Para cerca de 120 estruturas com desenho e 2 fotos, isso dá de 40 a 80 MB. O tamanho aparece na sincronização, com o corte descrito em D8.
- **[A IA erra e o revisor confia demais]** → A análise automática vem desligada, há a métrica de acerto por estrutura, o desligamento por estrutura e o rótulo "sugestão da IA". A IA nunca reprova sozinha.
- **[O custo da IA com muitas fotos]** → O limite por hora, só as fotos "depois", no máximo 5 imagens por parecer e os tokens registrados.
- **[A cartilha traz uma revisão antiga]** → Ela nunca alimenta materiais (spec). As fotos importadas recebem `origem_ref` com o slide, para conferência.
- **[Direitos sobre as normas e as fotos]** → O catálogo é carregado por implantação, com os arquivos do próprio cliente, e nada vai como semente no repositório. As fixtures de teste ficam com páginas mínimas e em `src/test/resources`, que não são publicadas.
- **[Concorrência na edição do rascunho]** → Controle de versão otimista no jsonb, com a mensagem "O rascunho foi alterado por outra pessoa; recarregue".

## Migration Plan

1. **V277:** normas, estruturas, materiais, fixação, mídias, recomendações e as sementes das listas (família/função).
2. **V278:** importações.
3. **V279:** as colunas de kit e de kit aplicado, mais o poste opcional no ponto.
4. **V280:** os pareceres e o valor novo de inconformidade (enum como texto, sem migração de dados).
5. **V281:** os usos do guia.
6. **Permissões:** sementes de `obras:estrutura:read|write|import`. O read vai para os perfis de campo, de planejamento e de revisão; o write e o import, para o administrador de Obras.
7. **Ordem de entrega** (sem quebra, porque cada etapa é aditiva):
   - (a) catálogo + importação do PDF + guia no web;
   - (b) guia no app;
   - (c) kit × norma;
   - (d) apresentação;
   - (e) parecer da IA, ligado só depois da carga das normas e da medição numa obra piloto.
8. **Rollback:** desligar as rotas do front pela permissão. As colunas novas são anuláveis, então o código antigo as ignora. As tabelas podem ficar.
9. **Implantação de demonstração:** importar as três normas pelo assistente (não por script), validar 20 estruturas à mão e importar a cartilha só para as fotos.

## Open Questions

1. **Equivalência de códigos:** o código de material da norma é o mesmo do cadastro de materiais do almoxarifado do cliente? Se não for, é preciso uma tabela de equivalência (norma → material) antes da conformidade fazer sentido.
2. **Poste no ponto:** o poste (comprimento/resistência) do ponto deve vir da leitura do projeto já nesta change, ou basta o campo manual mais a inferência pelo kit?
3. **Escopo da revisão de fotos:** a inconformidade "Estrutura fora do padrão" deve entrar no ranking de qualidade das fotos da equipe, ou ficar separada (é erro de montagem, não de foto)?
4. **Quem administra o catálogo:** a engenharia da empreiteira ou o fornecedor do sistema na implantação? Isso define quem recebe `obras:estrutura:import`.
5. **Fotos da cartilha:** o autor da apresentação autoriza o uso das fotos no sistema? Se não, as fotos de referência começam vazias e são preenchidas com as melhores fotos aprovadas do próprio book (há uma ação "usar como referência" na revisão de fotos, que pode entrar nesta change se for confirmada).
6. **Elementos visuais:** a derivação automática pela descrição dá conta das famílias de chaves e equipamentos, ou o administrador vai precisar preencher todos à mão?
