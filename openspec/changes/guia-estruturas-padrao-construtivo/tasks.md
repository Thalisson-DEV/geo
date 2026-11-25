# Tarefas — guia-estruturas-padrao-construtivo

**Frentes e dependências:**
- **A (catálogo)** e **I (configuração do padrão construtivo)** vêm antes de todas e andam juntas: as tarefas I.1 a I.4 entram na mesma migração de A, e o leitor da frente B depende de I.5.
- **B (importação do PDF)**, **C (guia web)** e **E (kit × norma)** podem andar em paralelo depois de A.
- **D (guia no app)** depende de A e de C.3 (endpoint de materiais calculados).
- **F (apresentação)** depende de B.
- **G (parecer da IA)** depende de A, de E.1 (vínculo do kit) e do catálogo carregado.
- **H (validação)** fecha cada frente.
- Rodar só os testes do que mudou. `ds:check`/`verify:design-system` só se o usuário pedir.

## 1. Frente A — Catálogo (backend)

- [ ] 1.1 Migração V277: `normas_tecnicas`, `normas_tecnicas_tensoes`, `estruturas_padrao` (com `codigo_normalizado`, `versao_conteudo`, `elementos_visuais` jsonb, `apelidos` text[]), `estruturas_padrao_materiais`, `estruturas_padrao_fixacoes`, `estruturas_padrao_midias`, `estruturas_padrao_recomendacoes`; índice único parcial da norma vigente; índice em `estruturas_padrao_materiais(codigo_material)`
- [ ] 1.2 Sementes das listas `ESTRUTURA_FAMILIA` e `ESTRUTURA_FUNCAO` em `opcoes_lista` (valores da spec, sem marca)
- [ ] 1.3 Sementes das permissões `obras:estrutura:read|write|import` e distribuição aos perfis (read para campo, planejamento e revisão; write/import para o administrador de Obras)
- [ ] 1.4 Domínio `NormaTecnica` com o emissor obrigatório (situação, publicar/substituir, invariante de uma vigente por emissor + código, exigência de PDF ou "sem documento-fonte")
- [ ] 1.5 Domínio `EstruturaPadrao` com materiais, fixações, mídias e recomendações como filhos; `normalizarCodigo()` (sem caixa, espaço, hífen e ponto), apelidos, `subirVersaoConteudo()`, somente leitura quando a norma está SUBSTITUIDA, justificativa obrigatória na edição de norma VIGENTE
- [ ] 1.6 `ListaMateriaisEstrutura.calcular(poste?)`: lista fixa + fixação do poste, com "não se aplica" ≠ zero e o aviso de poste fora da tabela (testes unitários com a N1 e a N3)
- [ ] 1.7 `ElementosVisuaisDerivador`: regras por descrição (cruzeta, isolador pilar/ancoragem, chave, para-raios, transformador, estai), com testes com N1, N4, TE e as estruturas de BT
- [ ] 1.8 Repositórios + Specifications (busca por código, apelido e nome; filtros por família, função, tensão, fases, norma e vigente) + `PageResponse`
- [ ] 1.9 `NormaTecnicaUseCases` e `EstruturaPadraoUseCases` (CRUD, desativação por soft delete, cache Redis nas consultas e evict nas alterações)
- [ ] 1.10 Mídias: upload multipart (PNG/JPEG/WebP até 15 MB), geração de tela (1600 px WebP) e miniatura (320 px), `hash_conteudo`, um único DESENHO principal, endpoint de mídia imutável por hash
- [ ] 1.11 Casamento com o estoque: `EstoqueApi.buscarMaterialAtivoPorCodigo` em lote (criar `buscarMateriaisAtivosPorCodigos` se não existir), com o código normalizado (sem zeros à esquerda)
- [ ] 1.12 Controllers + interfaces `doc` (OpenAPI) de D11 para normas e estruturas, com ProblemDetail e `errors[]`
- [ ] 1.13 Auditoria: confirmar que materiais, fixação e recomendações gravam o anterior e o novo com a justificativa em `logs_sistema`
- [ ] 1.14 Testes de integração: vigência e substituição, código repetido (`b3 b3`), edição de revisão substituída (erro), estrutura desativada fora da busca, 403 sem permissão

## 2. Frente B — Importação do PDF da norma (backend)

- [ ] 2.1 Migração V278: `importacoes_norma` (tipo, situação, progresso, rascunho jsonb, contagens, erro, duração)
- [ ] 2.2 Fixtures de teste: páginas mínimas das três normas (capa, quadro de materiais em duas colunas, fixação com texto girado, quadro quebrado entre páginas, desenho dividindo página com tabela, página de afastamentos) em `src/test/resources`, fora do pacote final
- [ ] 2.3 `LeitorNormaEstruturas` recebendo o `PerfilLeituraNorma` (nenhum padrão fixo no código): identificação da norma pela capa e pelo cabeçalho; detecção de PDF sem texto
- [ ] 2.4 Leitura dos títulos "Desenho NN … Estrutura X" e "Quadro NN - Lista de Materiais referente ao Desenho NN"
- [ ] 2.5 Leitura do quadro de materiais em duas colunas (agrupamento por y, divisão por x, padrões de item/código/quantidade, descrição em várias linhas, "Tabela NN" → dependente, "0" → pendência)
- [ ] 2.6 Leitura da fixação (comprimentos, resistências em texto girado, quantidades por coluna, "-" → não se aplica) e junção de quadros quebrados entre páginas
- [ ] 2.7 Recorte do desenho (região entre os títulos, 200 dpi, corte das margens brancas) e extração dos rótulos `[A-Z]-\d{2}` com a posição normalizada
- [ ] 2.8 Sugestão de família e função pelo título e pelo código; páginas sem quadro viram mídia DETALHE da norma
- [ ] 2.9 Pendências: sem código, quantidade fora do comum, quadro sem desenho, desenho sem quadro, recorte a conferir, sem família/função, sem material no estoque, fixação não lida
- [ ] 2.10 `ImportarNormaUseCase` com `@Async` (padrão do `ProcessarAnaliseProjetoService`), progresso por página, imagens em `importacoes/{id}/` no storage
- [ ] 2.11 Edição do rascunho (PATCH no jsonb com versão otimista), aceitar pendência, excluir estrutura, reajustar recorte
- [ ] 2.12 Comparação com a revisão vigente (estruturas novas, removidas e alteradas; materiais por código/descrição; desenho por dHash; kits afetados)
- [ ] 2.13 Publicação transacional (norma/revisão, estruturas, filhos, derivação dos elementos visuais, religamento dos kits com a opção de desmarcar, `NormaPublicadaEvent`) e descarte
- [ ] 2.14 Rotina de limpeza dos rascunhos descartados ou com mais de 30 dias (apaga as imagens do storage)
- [ ] 2.15 Teste de aceite: importar as 3 normas completas e conferir 20 estruturas à mão (meta de ao menos 95% das linhas certas). Registrar o resultado no PR

## 3. Frente C — Guia e cadastro no web

- [ ] 3.1 Componente `geo-image-viewer` no `@geo/ui` (zoom por pinça e roda, arraste, duplo clique, destaque de rótulo por coordenada), com teste e exemplo no catálogo do DS
- [ ] 3.2 Tela "Guia de estruturas" (`features/obras/estruturas`): lista lazy com miniatura, código, nome, família, tensão, norma/revisão, materiais e kits; busca e filtros; padrão "tabela primeiro"
- [ ] 3.3 Endpoint e uso de `GET /estruturas/{id}/materiais?comprimento=&resistencia=` no detalhe, com o seletor de poste
- [ ] 3.4 Página de detalhe na ordem da spec (recomendações que reprovam no topo, desenho, fotos corretas/erro comum, materiais com material do estoque, fixação, demais recomendações, kits ligados), com o link para a página do PDF e a faixa de revisão substituída
- [ ] 3.5 Edição da estrutura (dados, apelidos, materiais, fixação, mídias, recomendações, elementos visuais) com o diálogo de justificativa quando a norma está vigente
- [ ] 3.6 Cadastro de normas (lista, revisões, publicar, PDF)
- [ ] 3.7 Assistente de importação (enviar → processando com progresso → revisar com pendências → comparar → publicar), com a página do PDF e o recorte ajustável
- [ ] 3.8 Menu e rotas com `route.data.permission` (`obras:estrutura:read`/`write`/`import`), textos em pt-BR
- [ ] 3.9 Testes Vitest dos componentes e services novos

## 4. Frente D — Guia no app de campo (mobile)

- [ ] 4.1 Backend: `GET /api/obras/campo/guia?desde=` (escopo do D8: estruturas dos kits das obras da agenda e das abertas da base, mais as vigentes das classes de tensão, com o corte de 150 MB) e o tamanho total informado
- [ ] 4.2 Backend: o poste opcional no `PontoPlanejamento` (V279) e a resolução do poste do ponto (campo → descrição do item de poste → sufixo do código do kit), com testes
- [ ] 4.3 Backend: o pacote de campo passa `idEstrutura`, `revisaoNorma` e o poste resolvido em cada kit do ponto
- [ ] 4.4 Mobile: tabelas Dexie `estruturas` e `estruturasMidias` (nova `dbVersion`), sincronização incremental por `versaoConteudo`, `navigator.storage.persist()` e a linha "Guia de estruturas · N estruturas · X MB" na tela de sincronização
- [ ] 4.5 Mobile: `estrutura-visualizador` (desenho em tela cheia com zoom, carrossel com Correto/Erro comum, recomendações que reprovam no topo, materiais calculados para o poste com o rótulo, toque no item destacando o rótulo), alvos de 48 px, celular na vertical sem rolagem horizontal
- [ ] 4.6 Mobile: a ação "Ver estrutura" no kit da execução do ponto (oculta sem vínculo; "Estrutura não baixada · sincronize com rede"; aviso "O planejamento usou a revisão NN")
- [ ] 4.7 Mobile: a entrada "Guia de estruturas" na área de Obras, com a busca offline por código/nome e o filtro por família
- [ ] 4.8 Uso do guia: registro local com `id_local`, envio pela fila do `SyncService`, endpoint `POST /campo/usos-guia` idempotente (V281) e o relatório web "estruturas mais consultadas por equipe"
- [ ] 4.9 Testes: Vitest do visualizador e da sincronização; e2e Playwright abrindo a estrutura sem rede (modo offline do navegador)

## 5. Frente E — Kit × norma

- [ ] 5.1 Migração V279: `kits_construtivos` (`id_estrutura_padrao`, `conformidade_situacao`, `conformidade_divergencias`, `conformidade_calculada_em`, `conformidade_revisao`) e `kits_aplicados` (`id_estrutura_padrao`, `revisao_norma`)
- [ ] 5.2 Domínio: `KitConstrutivo.vincularEstrutura()` com a validação de tensão; `KitAplicado` copia a estrutura e a revisão na aplicação
- [ ] 5.3 `ConformidadeKitService` puro (CONFERE, QUANTIDADE_DIFERENTE, FALTA_NO_KIT, SOBRA_NO_KIT, DEPENDE_DO_POSTE, SEM_CADASTRO), só para material INSTALAR, com a fixação quando o poste do kit é conhecido; testes unitários com os cenários da spec
- [ ] 5.4 Gatilhos de recálculo: síncrono na mudança do kit; `conformidade_dirty` + `@Async` em lotes de 200 na mudança da estrutura ou em `NormaPublicadaEvent`; eventos de material cadastrado/desativado do `estoque` (criar se não existirem)
- [ ] 5.5 Sugestão de vínculo (normalização, retirada do sufixo de poste/variação, apelidos, só vigentes e compatíveis, ambiguidade sem escolha automática) e vínculo em lote com confirmação
- [ ] 5.6 "Ajustar o kit à norma": proposta de mudanças, aplicação só do que foi confirmado, material sem cadastro de fora com o aviso
- [ ] 5.7 Endpoints de D11 para kits + `doc`
- [ ] 5.8 Web: coluna e filtro "Norma" na lista de kits; aba "Norma" no detalhe com a comparação item a item; tela de sugestões em lote; "Ajustar à norma"
- [ ] 5.9 Web: aviso discreto no ponto do planejamento para kit com divergência, com o link para o detalhe
- [ ] 5.10 Relatório "códigos da norma sem material no estoque", para o almoxarifado
- [ ] 5.11 Testes de integração: aplicar kit divergente sem bloqueio; recálculo depois de corrigir a norma; religamento na publicação de revisão nova

## 6. Frente F — Importação da apresentação (.pptx)

- [ ] 6.1 `LeitorApresentacaoEstruturas` com Apache POI XSLF (que já está no `pom.xml`): imagens por slide, inclusive em grupos, com posição; textos; descarte das imagens repetidas em mais de 50% dos slides
- [ ] 6.2 Sugestão da estrutura pelo título (códigos candidatos × `codigo_normalizado`/apelidos do catálogo vigente, código mais longo primeiro); slides sem imagem recolhidos
- [ ] 6.3 Sugestão de foto × desenho/tabela pelas cores da miniatura
- [ ] 6.4 Tela de classificação por slide (foto correta, erro comum, detalhe, ignorar; texto → recomendação com gravidade e alcance estrutura/família), com o aviso ao marcar uma tabela como foto
- [ ] 6.5 Publicação: grava as mídias e recomendações com `origem=APRESENTACAO` e `origem_ref` do slide, sobe a `versao_conteudo` das estruturas afetadas e nunca altera materiais ou fixação
- [ ] 6.6 Teste com a cartilha recebida: os 3 logotipos descartados, o slide 30 sugerido para a N4, os slides de seção recolhidos

## 7. Frente G — Parecer da IA na revisão de fotos

- [ ] 7.1 Migração V280: `pareceres_foto_ia`; valor `ESTRUTURA_FORA_PADRAO` em `EvidenciaPonto.Inconformidade`
- [ ] 7.2 Interface de domínio `AnaliseFotoEstrutura` + `AnaliseFotoEstruturaPorVisao` (`CopilotoApi.completarComImagens`, temperatura 0, sem raciocínio) + `AnaliseFotoEstruturaDesligada`
- [ ] 7.3 Montagem do pedido: foto (1600 px), desenho, até 2 referências CORRETO e 1 ERRO_COMUM; elementos esperados em JSON; nenhum dado pessoal, de equipe ou de localização no texto (teste que verifica isso)
- [ ] 7.4 Pós-processamento: validação do JSON, descarte dos itens pequenos (parafuso, arruela, porca, conector, coxim), DIVERGE só com confiança baixa → INCONCLUSIVO, NAO_ANALISADO com o motivo; registro do modelo, da duração, das imagens e dos tokens
- [ ] 7.5 Escolha da estrutura do ponto (kit principal pelo número de elementos visuais; kit da foto quando o modelo pedir); só fotos "depois" ou sem etapa; sem elementos visuais → sem parecer
- [ ] 7.6 `EvidenciaRecebidaEvent` publicado depois do commit + listener `@Async` com semáforo (`obras.ia.foto.concorrencia`) e limite por hora (`obras.ia.foto.limite-hora`); configuração de Obras: análise automática (padrão desligado) e estruturas excluídas
- [ ] 7.7 Endpoints: pedido manual de parecer, avaliação do revisor (CONCORDA/DISCORDA), painel por obra, métricas
- [ ] 7.8 Garantia "nunca reprova sozinha": testes que provam que o parecer não muda a revisão, a medição, o ranking nem as pendências do app
- [ ] 7.9 Web, revisão de fotos: o bloco "Parecer da IA" (resultado, observações, referência e desenho ao lado, Concordo/Discordo, "Pedir parecer da IA", "Parecer em análise"); reprovação preenchida com "Estrutura fora do padrão" e as observações, editável e só gravada com confirmação; bloco oculto sem visão configurada
- [ ] 7.10 Web: o painel de problemas por obra (falta foto obrigatória, parecer DIVERGE não revisado, reprovada aguardando foto), com os filtros de equipe/período e a ordem por pontos com mais problemas
- [ ] 7.11 Web: a tela de métricas de acerto por estrutura e período, com a marca "baixa confiança" e o desligamento por estrutura
- [ ] 7.12 Piloto: ligar numa obra, revisar ao menos 50 pareceres e registrar o acerto por estrutura antes de ligar para todas

## 8. Frente H — Validação e entrega

- [ ] 8.1 Capturas Playwright em claro e escuro: guia (lista e detalhe), assistente de importação, aba Norma do kit, parecer na revisão de fotos e visualizador do app (tablet e celular), mais a revisão pelo subagente `ui-reviewer`
- [ ] 8.2 Avaliação no Chrome do usuário, como a equipe usaria (fluxo: importar a norma → ligar os kits → executar o ponto no app sem rede → revisar a foto com o parecer)
- [ ] 8.3 Implantação de demonstração: importar as 3 normas pelo assistente, conferir 20 estruturas, importar as fotos da cartilha, ligar os kits do contrato piloto e conferir as divergências com o planejamento
- [ ] 8.4 Atualizar o roteiro do sistema (seção de Obras) com o guia de estruturas e a conformidade dos kits
- [ ] 8.5 Responder às perguntas em aberto do design (equivalência de códigos, poste no ponto, ranking, quem administra, autorização das fotos, elementos visuais) e registrar as decisões no design antes de fechar a change

## 9. Frente I — Configuração do padrão construtivo (multi-cliente)

- [ ] 9.1 Na V277: `parametros_padrao_construtivo` (registro único com os padrões da spec), `emissores_norma`, `contratos_normas_aplicaveis`, `perfis_leitura_norma` (com o perfil genérico semeado), `regras_codigo_padrao_construtivo` (com a semente de sufixos e normalização) e `dicionario_elementos_visuais` (com os termos genéricos semeados); `id_emissor` em `normas_tecnicas`; nenhuma semente com nome de distribuidora, código de norma ou código de material
- [ ] 9.2 `ParametrosPadraoConstrutivo` + UseCases com cache (padrão de `ParametrosFrota`) e endpoint; o front e o pacote do app respeitando os ligar/desligar (guia, guia no app, conformidade, parecer automático) sem apagar dados
- [ ] 9.3 Cadastro de emissores (CRUD, soft delete) e filtro por emissor no guia, na importação e na busca
- [ ] 9.4 `contratos_normas_aplicaveis` + `NormasAplicaveisService.doContrato()` (sem linha = todas as vigentes), usado pela sugestão de vínculo, pela conformidade, pelo pacote do app e pelo parecer; tela "Normas do contrato" em Obras, sem alterar o módulo `contrato`
- [ ] 9.5 `PerfilLeituraNorma` (regras em jsonb versionado), validação e compilação das expressões com tempo limite, CRUD/duplicar, perfil padrão por emissor e o teste em até 10 páginas de amostra sem gravar
- [ ] 9.6 `LeitorPlanilhaNorma` (abas Estruturas, Materiais, Fixação, Recomendações) gerando o mesmo rascunho do PDF; endpoint da planilha modelo com exemplo fictício; pendências por linha e aba
- [ ] 9.7 `NormalizadorCodigos` (sufixos de kit, normalização do código de material com zeros, espaços/pontos e prefixo, leitura do poste) como porta única, com endpoint de teste e testes unitários (`N1/C → N1`, `MAT-134830013` ↔ `134830013`)
- [ ] 9.8 Dicionário de elementos visuais (CRUD) lido pelo `ElementosVisuaisDerivador`, com `elementos_visuais_editados` e a ação "recalcular as estruturas não editadas"
- [ ] 9.9 Escopo da IA nos parâmetros (elementos avaliados e itens ignorados), com o texto de sistema montado a partir das listas
- [ ] 9.10 Exportar/importar a configuração em JSON (`versao_formato`, perfis, dicionário, regras, escopo da IA, famílias, funções), com prévia de criar/substituir e sem normas, estruturas, imagens ou dados de obra
- [ ] 9.11 Web: a tela "Configuração do padrão construtivo" em Obras (abas Parâmetros, Emissores, Perfis de leitura com teste, Regras de código com teste, Dicionário, Escopo da IA, Exportar/Importar), com `obras:estrutura:import`
- [ ] 9.12 Teste de aceite multi-cliente: uma implantação com dois emissores (um perfil genérico e outro duplicado com outra ordem de colunas), contratos ligados a emissores diferentes, sugestão e guia do app só com as normas do contrato; uma implantação nova sem norma, com o guia vazio e os kits funcionando como antes
