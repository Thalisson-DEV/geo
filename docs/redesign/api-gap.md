# Lacunas da API frente ao contrato de UI

Gerado em 2026-11-20 por script sobre `backend/src/main/java/**/infrastructure/web/*Controller.java`, comparando com `.claude/skills/spring-ui-api-contract` (SKILL.md + references/java-snippets.md). `application-prod.*` não foi aberto.

## Como foi medido

- Endpoints: anotações `@Get/Post/Put/Patch/DeleteMapping`/`@RequestMapping` somadas ao `@RequestMapping` da classe; caminhos com o `context-path` `/api`. Mapeamentos com vários caminhos geram uma linha por caminho.
- **(a) Listagem**: tipo de retorno dos `GET` que devolvem coleção (`ResponseEntity` desembrulhado). `PageResponse` = `shared.application.dto.PageResponse` (`{content, page{size, number, totalElements, totalPages}}`).
- **(b) Ordenação**: o controller recebe `Pageable`? Procura, nos use cases injetados (até 2 níveis) e nas `*Specification` que eles usam, código que lê `getSort()/getProperty()` com `Set.of`/`Map.of`/`switch`. Encontrado = "mapeamento parcial": nenhum caso encontrado rejeita campo inválido com 400 (o padrão é ignorar ou repassar a propriedade).
- **(c) DTOs**: compara o elemento da listagem paginada com o retorno de `GET …/{id}` e os tipos de `@RequestBody`. "Expõe entidade" = tipo com `@Entity` no retorno ou corpo (nenhum caso encontrado).
- **(d) /options**: `GET …/options` exato; "equivalente" = `/opcoes`, `/min`, `/todos-ativos`.
- **(e) Status**: campos `status|situacao|etapa|prioridade|estado|fase` dos DTOs de listagem; "enum cru" = tipo `enum` Java serializado pelo Jackson como string (`"APROVADO"`).
- **(f) OpenAPI**: endpoints com `@Operation` no controller ou no método homônimo da interface `*ControllerDoc` que ele implementa.

## Resumo

- **149 controllers**, **1330 endpoints** (GET 549 · POST 420 · PUT 172 · PATCH 72 · DELETE 117).
- **(a)** 208 `GET` de coleção: **PageResponse 120** (117 com `Pageable`, 3 com page/size manuais) · **List sem paginação 88** · Page/PageImpl cru 0 · PagedModel 0 · Slice 0. Nenhum endpoint serializa `Page` direto. Opções de lookup usam `LookupPageDto {items, nextCursor, hasMore}` (cursor).
- **(b)** 100 controllers recebem `Pageable`; 8 têm algum mapeamento de campos de ordenação (Dashboard, Desconto, MovimentacaoEstoque, SolicitacaoCompra, SolicitacaoPagamento, Obra, TurnoObra, Sincronizacao). Nos outros 92 não foi encontrado mapeamento: o `sort` chega cru ao repositório (campo que não é propriedade JPA gera `PropertyReferenceException`, que cai no handler genérico → 500). Não existe `SortWhitelist` compartilhada.
- **(c)** Padrão do projeto: `XxxRequest` (entrada, records com Bean Validation) + `XxxResponse` (saída). Nenhuma entidade JPA sai do controller. Em **71 controllers** a listagem paginada usa o **mesmo DTO do detalhe** (sem `Row` enxuto); em 17 já há DTO de listagem próprio (ex.: `ObraResumoResponse`). A nomenclatura `Row/Detail/Form` do contrato não é usada.
- **(d)** `/options` existe em **3** recursos (`/v1/estoques/options`, `/v1/materiais/options`, `/v1/rh/colaboradores/options`), com `{value, label}` paginado por cursor. Outros 13 endpoints fazem papel de opções com formatos variados (`/opcoes`, `/min`, `/todos-ativos` devolvendo o `Response` completo). O front ainda carrega opções por listagens grandes (65 ocorrências de `size: 500/1000/2000` em services e componentes).
- **(e)** Nenhum DTO usa `{code, label, severity}` (não há `severity` no backend). Nos DTOs de listagem: 65 campos de status são **enum cru**; 28 são String (vários pares `situacao` + `situacaoRotulo`, ou `statusNome` vindo de tabela). Não existe `/meta/enums`.
- **(f)** 1224/1330 endpoints (92%) com `@Operation`; 128 controllers documentam por interface `*ControllerDoc`. Sem documentação: McpController (3), OAuthIaController (7), MotivoPendenciaController (5), SolicitacaoController (2), SincronizacaoController (9), DashboardGovernancaSstController (1), DocumentoGovernancaSstController (13), ModeloAtaSstController (10), NormalizacaoTranscricaoSstController (3), ReferenciasGovernancaSstController (12), ReuniaoGovernancaSstController (28), TreinamentoGovernancaSstController (12), ModuleHealthController (1).

## Tratamento global de erros

- **Um único `@RestControllerAdvice`**: `backend/src/main/java/com/nexo/app/shared/infrastructure/web/GlobalExceptionHandler.java`, que **estende `ResponseEntityExceptionHandler`** — portanto as exceções do Spring MVC (400 de bind, 405, 415, 413 sobrescrito…) já saem como ProblemDetail mesmo sem `spring.mvc.problemdetails.enabled`. Dois controllers têm `@ExceptionHandler` local (`ConexaoIaController`, `OAuthIaController` — este devolve o formato OAuth, não ProblemDetail).
- Todos os handlers devolvem `ProblemDetail` com `title`, `detail` em pt-BR, `type` (`https://app.exemplo.com/errors/...`, mistura `/errors/` e `/erros/`) e a extensão `timestamp`. Vários incluem `code` estável: `VERSAO_DESATUALIZADA`, `RATE_LIMIT` (+ `retryAfter` e cabeçalhos `Retry-After`/`RateLimit`), `TOKEN_EXPIRADO`, `TOKEN_INVALIDO`, `SESSAO_INVALIDA`, e um `codigoTecnico()` derivado por palavras-chave da mensagem (ex.: `SALDO_OBRA_INSUFICIENTE`, `REGRA_NEGOCIO_VIOLADA`).
- Status: 404 (`RecursoNaoEncontradoException`), 409 (`ConflitoVersaoException`, `ObjectOptimisticLockingFailureException`), 422 (`InvarianteVioladaException`, `PreenchimentoInvalidoException`), 403 (`AuthorizationDeniedException` e também `AuthenticationException`), 401 (tokens), 413, 429, 500 genérico sem stack trace. `BaseBusinessException` usa o status da subclasse. **`IllegalArgumentException`, `IllegalStateException`, `ValidationException` e `DataIntegrityViolationException` viram 400**, não 422.
- **Erros por campo — não seguem o contrato `errors[]`:**
  - Validação (`MethodArgumentNotValidException`) → 400 com extensão **`fieldErrors`: objeto `{ "<campo>": { "code", "message" } }`** (um erro por campo, `putIfAbsent`), `code` inferido por palavra-chave (quase sempre `REGRA_NEGOCIO_VIOLADA`).
  - `PreenchimentoInvalidoException` → 422 com `erros` (mapa campo→mensagem) **e** `fieldErrors` (mesmo formato acima).
  - `ConstraintViolationException`/`TransactionSystemException` → 400 **sem** detalhe por campo.
  - Contrato pede `errors: [{ field, message, code }]` (array). No front, `getErrorMessage` (`core/models/shared.models.ts`) lê `problem.errors` como mapa de arrays — chave que o backend **nunca** envia; só `core/utils/solicitacao-tecnica-error.util.ts` lê `fieldErrors`.
- Sem `traceId`/`instance` nas respostas. Sem `messages.properties`/`ValidationMessages`: mensagens vêm do `message=` das anotações.

## Configuração (`application.yaml`)

- `server.servlet.context-path: /api`; `spring.jackson.default-property-inclusion: non_null` (campos nulos somem do JSON — o front deve tratar ausência como nulo).
- **Sem `spring.data.web.pageable.*`**: valem os padrões do Spring Data — `size` padrão 20 (o contrato pede 25) e **`max-page-size` 2000** (o contrato pede 200). O front pede `size=1000` em listas de opções (ex.: contratos e ações ativas), o que hoje passa.
- Sem `@EnableSpringDataWebSupport(pageSerializationMode = VIA_DTO)` e sem `PageableHandlerMethodArgumentResolverCustomizer`; o formato de página é garantido pelo `PageResponse` próprio, chamado em cada use case.
- **Sem `spring.mvc.problemdetails.enabled`** (desnecessário enquanto o advice estender `ResponseEntityExceptionHandler`).
- springdoc-openapi **3.0.2** no `pom.xml`, sem propriedades `springdoc.*` no yaml; `OpenApiConfig` define título, versão e esquema `bearerAuth` (JWT). `/v3/api-docs` disponível; **não há script de geração de client no front** (`npm run api:gen` pendente).
- `spring.servlet.multipart.max-file-size: 15MB`, `max-request-size: 32MB`; `spring.jpa.open-in-view: false`; `default_batch_fetch_size: 50`.

## Lacunas priorizadas (impacto nas telas)

1. **Erros por campo fora do formato** — backend manda `fieldErrors` (objeto) e às vezes `erros`; o contrato e o `getErrorMessage` do front esperam `errors`. Hoje o formulário não destaca o campo nem mostra a mensagem certa: cai no `detail` genérico ("Um ou mais campos estão inválidos…"). Afeta **todos** os formulários e drawers de cadastro. Ação: incluir `errors: [{field, message, code}]` no `GlobalExceptionHandler` (validação, `PreenchimentoInvalido`, `ConstraintViolation` com `propertyPath`) mantendo `fieldErrors` durante a transição; trocar a leitura no front para um helper único do `@geo/ui` form-kit. Regras de negócio que hoje saem como 400 (`IllegalArgument/IllegalState/ValidationException`) deveriam ser 422 com `code`.
2. **Status sem `label/severity`** — 65 campos de status em listagens são enum cru; o front mantém tabelas de rótulo/cor por tela (tom do `geo-status`). Ação: `StatusDto {code,label,severity}` + `UiEnum` nos enums de status das listagens P1 (solicitações de material, obras/encerramento, financeiro, OS de frota, chamados, inspeções/desvios/eventos SST, descontos) e `GET /v1/meta/enums/{nome}` para filtros.
3. **Ordenação sem whitelist** — 92 de 100 controllers com `Pageable` não têm mapeamento de ordenação: ordenar por uma coluna cujo `field` não é propriedade JPA (nomes resolvidos como `clienteNome`) resulta em 500. Endpoints usados por telas P1 nessa situação: `GET /v1/chamados/meus`, `GET /v1/chamados`, `GET /v1/chamados/equipes`, `GET /v1/contratos`, `GET /v1/descontos/motivos`, `GET /v1/descontos/tipos-equipamento`, `GET /v1/avaliacoes-material`, `GET /v1/centros-investimento`, `GET /v1/estoques`, `GET /v1/solicitacoes-material/{idSolicitacao}/historico`, `GET /v1/materiais`, `GET /v1/motivos-rejeicao`, `GET /v1/saldos`, `GET /v1/saldos/seriais`, …. Ação: `SortWhitelist` compartilhada (400 ProblemDetail em campo inválido) e `max-page-size: 200`/`default-page-size: 25` no yaml — depois de trocar os `size=1000` do front por `/options`.
4. **Listas sem paginação** — 88 `GET` devolvem `List`. A maioria é sub-recurso (histórico, anexos, membros) ou opções e pode continuar assim. Consumidos por telas P1: `/v1/chamados/topicos`, `/v1/obras/encerramento/solicitantes`, `/v1/motivos-pendencia`, `/v1/financeiro/formularios/variantes`, `/v1/frota/checklists/sem-checklist-hoje`, `/v1/frota/abastecimento/carteiras`, `/v1/frota/ordens-servico/repeticoes`, `/v1/frota/ordens-servico/fornecedores`, `/v1/obras/agentes/todos-ativos`, `/v1/obras/{id}/historico-status`, `/v1/obras/{id}/proximas`, `/v1/obras/medicoes/a-medir`, `/v1/obras/{idObra}/programacoes`, `/v1/obras/programacoes/a-programar`, `/v1/obras/planejamento/resumos`, `/v1/obras/status/todos-ativos`, `/v1/obras/tipos-anexos/todos-ativos`, `/v1/obras/tipos-obra/todos-ativos`, `/v1/rh/medidas-disciplinares/configuracao/tipos`, `/v1/rh/medidas-disciplinares/configuracao/motivos`, `/v1/rh/coordenadores/min`, `/v1/equipes/{id}/membros`, `/v1/rh/supervisores/min`, `/v1/sst/atividades/opcoes`, `/v1/sst/catalogos/opcoes`, `/v1/sst/tipos-inspecao/opcoes`. Ação: avaliar paginação nos candidatos a crescer sem limite (`/v1/mural`, `/v1/obras/programacoes/a-programar`, `/v1/obras/medicoes/a-medir`, `/v1/frota/estoque/saldos`, `/v1/automacoes/aprovacoes/minhas`) e manter os demais como `List`.
5. **Opções inconsistentes** — só 3 recursos têm `/options` (`LookupOptionDto`); `/opcoes`, `/min` e `/todos-ativos` devolvem DTOs completos, e vários selects carregam `?ativo=true&size=1000`. Ação: padronizar `GET /v1/{recurso}/options?q=` → `[{value,label,hint?}]` (máx. 50) para contratos, ações, bases operacionais, centros de custo, processos, equipes, supervisores, coordenadores, municípios, status/tipos de obra, tipos de inspeção e atividades SST.
6. **DTO de listagem = DTO de detalhe** em 71 controllers — listagens carregam campos e relações que a tabela não mostra (peso e N+1 em potencial). Ação: `XxxRow` (record plano com nomes resolvidos) nas listagens P1 com mais colunas; manter `XxxResponse` no detalhe.
7. **OpenAPI incompleto e sem client gerado** — governança SST (Documento, ModeloAta, Normalização, Referências, Reunião, Treinamento, Dashboard), Sincronização, MotivoPendencia e MCP/OAuth sem `@Operation`; enums de status não expostos no schema. Bloqueia `npm run api:gen`.
8. **Detalhes menores** — sem `traceId`; `type` com domínio de exemplo e grafia mista (`/errors/` vs `/erros/`); `AuthenticationException` → 403 (deveria ser 401); `PUT` em geral devolve o `Response` (ok), mas ativar/desativar devolvem `Void` e obrigam novo GET.

### Já compatível com o contrato

- **Formato de página**: todas as 120 listagens paginadas devolvem `PageResponse {content, page{number,size,totalElements,totalPages}}` — idêntico ao `PagedResponse` do front e ao `PagedModel` VIA_DTO. Nenhum `Page`/`PageImpl` cru.
- **ProblemDetail (RFC 9457) em todo erro**, com `detail` em pt-BR pronto para toast, 404/409/403/401/413/429 corretos e sem stack trace; `code` estável em conflito de versão, rate limit e sessão.
- **Optimistic locking** com 409 (`VERSAO_DESATUALIZADA` com `versaoEsperada`/`versaoAtual`).
- **Entidades nunca saem do controller**; entrada por `Request` records com `@Valid`.
- **Lookups de estoque, material e colaborador** (`/options` com `LookupOptionDto {value,label}` e cursor) já seguem a ideia de opções.
- **OpenAPI** em 92% dos endpoints, via interfaces `*ControllerDoc`; springdoc 3.0.2 expõe `/v3/api-docs`.
- **Escopo de acesso** por `@PreAuthorize(hasAuthority(...))` no JWT, sem parâmetro de empresa/filial (alinhado ao produto não multiempresa).

## Controllers

Legenda das colunas de endpoint: **Listagem** = formato da coleção (`PageResponse`, `List`) ou `—`; **Pageable** = recebe `Pageable` (✓) ou page/size manuais (m); **Doc** = tem `@Operation`.

### Módulo `assistente`

#### AcaoAssistenteController

`modules/assistente/infrastructure/web/AcaoAssistenteController.java` · base `/api/v1/assistente`

- (a) listagem: List ×1
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 5/5 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/assistente/conversas/{conversaId}/acoes` | `String` | — |  | ✓ |
| POST | `/api/v1/assistente/acoes/{acaoId}/revisao` | `String` | — |  | ✓ |
| POST | `/api/v1/assistente/acoes/{acaoId}/confirmacao` | `String` | — |  | ✓ |
| POST | `/api/v1/assistente/acoes/{acaoId}/cancelamento` | `String` | — |  | ✓ |
| GET | `/api/v1/assistente/cadastros/referencias/{tipo}` | `List<Opcao>` | List |  | ✓ |

#### AssistenteController

`modules/assistente/infrastructure/web/AssistenteController.java` · base `/api/v1/assistente`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: n/a (page/size manuais)
- (c) DTOs: listagem ≠ detalhe (ConversaResumoResponse / ConversaDetalheResponse); Request separado (RenomearConversaRequest, EnviarMensagemRequest, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 17/17 (via `AssistenteControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/assistente/conversas` | `PageResponse<ConversaResumoResponse>` | PageResponse | m | ✓ |
| POST | `/api/v1/assistente/conversas` | `ConversaResumoResponse` | — |  | ✓ |
| GET | `/api/v1/assistente/conversas/{conversaId}` | `ConversaDetalheResponse` | — |  | ✓ |
| PATCH | `/api/v1/assistente/conversas/{conversaId}` | `ConversaResumoResponse` | — |  | ✓ |
| DELETE | `/api/v1/assistente/conversas/{conversaId}` | `Void` | — |  | ✓ |
| POST | `/api/v1/assistente/conversas/{conversaId}/mensagens/stream` | `void` | — |  | ✓ |
| GET | `/api/v1/assistente/conversas/{conversaId}/stream` | `void` | — |  | ✓ |
| POST | `/api/v1/assistente/conversas/{conversaId}/parar` | `Map<String, Object>` | — |  | ✓ |
| PUT | `/api/v1/assistente/conversas/{conversaId}/mensagens/{mensagemId}/avaliacao` | `MensagemResponse.Avaliacao` | — |  | ✓ |
| GET | `/api/v1/assistente/conversas/{conversaId}/mensagens/{mensagemId}` | `MensagemResponse` | — |  | ✓ |
| GET | `/api/v1/assistente/conversas/{conversaId}/artefatos` | `List<ArtifactService.ArtefatoView>` | List |  | ✓ |
| GET | `/api/v1/assistente/conversas/{conversaId}/artefatos/{codigo}` | `ArtifactService.ArtefatoView` | — |  | ✓ |
| GET | `/api/v1/assistente/conversas/{conversaId}/resultados/{codigo}` | `Map<String, Object>` | — |  | ✓ |
| POST | `/api/v1/assistente/arquivos` | `ArquivoAssistenteResponse` | — |  | ✓ |
| GET | `/api/v1/assistente/arquivos/{arquivoId}/conteudo` | `byte[]` | — |  | ✓ |
| DELETE | `/api/v1/assistente/arquivos/{arquivoId}` | `Void` | — |  | ✓ |
| GET | `/api/v1/assistente/capacidades` | `CapacidadesResponse` | — |  | ✓ |

#### ConexaoIaController

`modules/assistente/infrastructure/web/ConexaoIaController.java` · base `/api/v1/assistente/conexoes`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: n/a (page/size manuais)
- (c) DTOs: listagem `ConexaoIaResponse`; Request separado (CriarChaveIaRequest, AutorizarIaRequest)
- (d) /options: não
- (e) status nas listagens: situacao: String
- (f) OpenAPI: 8/8 (via `ConexaoIaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/assistente/conexoes/info` | `ConexaoIaInfoResponse` | — |  | ✓ |
| GET | `/api/v1/assistente/conexoes` | `List<ConexaoIaResponse>` | List |  | ✓ |
| POST | `/api/v1/assistente/conexoes/chaves` | `ChaveIaCriadaResponse` | — |  | ✓ |
| POST | `/api/v1/assistente/conexoes/{id}/desconectar` | `ConexaoIaResponse` | — |  | ✓ |
| GET | `/api/v1/assistente/conexoes/todas` | `PageResponse<ConexaoIaResponse>` | PageResponse | m | ✓ |
| POST | `/api/v1/assistente/conexoes/autorizacao/previa` | `AutorizacaoIaPreviaResponse` | — |  | ✓ |
| POST | `/api/v1/assistente/conexoes/autorizacao/permitir` | `AutorizacaoIaRedirecionamento` | — |  | ✓ |
| POST | `/api/v1/assistente/conexoes/autorizacao/recusar` | `AutorizacaoIaRedirecionamento` | — |  | ✓ |

#### McpController

`modules/assistente/infrastructure/web/McpController.java` · base `/api/mcp`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 0/3 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/mcp` | `String` | — |  | ✗ |
| GET | `/api/mcp` | `Void` | — |  | ✗ |
| DELETE | `/api/mcp` | `Void` | — |  | ✗ |

#### OAuthIaController

`modules/assistente/infrastructure/web/OAuthIaController.java` · base `/api/`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: só Request (String)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 0/7 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/.well-known/oauth-protected-resource` | `Map<String, Object>` | — |  | ✗ |
| GET | `/api/.well-known/oauth-protected-resource/**` | `Map<String, Object>` | — |  | ✗ |
| GET | `/api/.well-known/oauth-authorization-server` | `Map<String, Object>` | — |  | ✗ |
| GET | `/api/.well-known/oauth-authorization-server/**` | `Map<String, Object>` | — |  | ✗ |
| POST | `/api/oauth/register` | `Map<String, Object>` | — |  | ✗ |
| POST | `/api/oauth/token` | `Map<String, Object>` | — |  | ✗ |
| POST | `/api/oauth/revoke` | `Void` | — |  | ✗ |

### Módulo `automacao`

#### AutomacaoController

`modules/automacao/infrastructure/web/AutomacaoController.java` · base `/api/v1/automacoes`

- (a) listagem: PageResponse ×2, List ×4
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem ≠ detalhe (AutomacaoResumoResponse / AutomacaoDetalheResponse); Request separado (AutomacaoRequest, StatusAutomacaoRequest, …)
- (d) /options: equivalente (`/{tipo}`)
- (e) status nas listagens: status: enum cru; status: String
- (f) OpenAPI: 25/25 (via `AutomacaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/automacoes/modelos` | `List<Modelo>` | List |  | ✓ |
| GET | `/api/v1/automacoes/catalogo` | `Map<String, Object>` | — |  | ✓ |
| GET | `/api/v1/automacoes` | `PageResponse<AutomacaoResumoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/automacoes/{id}` | `AutomacaoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/automacoes` | `AutomacaoDetalheResponse` | — |  | ✓ |
| PUT | `/api/v1/automacoes/{id}` | `AutomacaoDetalheResponse` | — |  | ✓ |
| PATCH | `/api/v1/automacoes/{id}/status` | `AutomacaoDetalheResponse` | — |  | ✓ |
| DELETE | `/api/v1/automacoes/{id}` | `Void` | — |  | ✓ |
| POST | `/api/v1/automacoes/{id}/duplicar` | `AutomacaoDetalheResponse` | — |  | ✓ |
| PATCH | `/api/v1/automacoes/{id}/responsavel` | `AutomacaoDetalheResponse` | — |  | ✓ |
| GET | `/api/v1/automacoes/{id}/versoes/{numero}` | `Map<String, Object>` | — |  | ✓ |
| POST | `/api/v1/automacoes/validar` | `ValidacaoResponse` | — |  | ✓ |
| POST | `/api/v1/automacoes/previa-email` | `PreviaEmailResponse` | — |  | ✓ |
| POST | `/api/v1/automacoes/{id}/executar` | `ExecucaoResumoResponse` | — |  | ✓ |
| GET | `/api/v1/automacoes/{id}/execucoes` | `PageResponse<ExecucaoResumoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/automacoes/{id}/execucoes/{execucaoId}` | `ExecucaoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/automacoes/{id}/execucoes/{execucaoId}/cancelar` | `Void` | — |  | ✓ |
| POST | `/api/v1/automacoes/{id}/execucoes/{execucaoId}/reenviar` | `ExecucaoResumoResponse` | — |  | ✓ |
| GET | `/api/v1/automacoes/arquivos/{arquivoId}` | `byte[]` | — |  | ✓ |
| POST | `/api/v1/automacoes/rascunho` | `RascunhoResponse` | — |  | ✓ |
| GET | `/api/v1/automacoes/opcoes/{tipo}` | `List<OpcaoResponse>` | List |  | ✓ |
| GET | `/api/v1/automacoes/rotulos/{tipo}` | `List<OpcaoResponse>` | List |  | ✓ |
| GET | `/api/v1/automacoes/aprovacoes/minhas` | `List<AprovacaoResponse>` | List |  | ✓ |
| GET | `/api/v1/automacoes/aprovacoes/{id}` | `AprovacaoResponse` | — |  | ✓ |
| POST | `/api/v1/automacoes/aprovacoes/{id}/resposta` | `AprovacaoResponse` | — |  | ✓ |

### Módulo `avaliacao`

#### AvaliacaoController

`modules/avaliacao/infrastructure/web/AvaliacaoController.java` · base `/api/v1/avaliacoes`

- (a) listagem: List ×2
- (b) ordenação: n/a
- (c) DTOs: só Request (RespostaRequest, CampanhaRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 9/9 (via `AvaliacaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/avaliacoes/convite` | `ConviteResponse` | — |  | ✓ |
| POST | `/api/v1/avaliacoes/{campanhaId}/respostas` | `Void` | — |  | ✓ |
| POST | `/api/v1/avaliacoes/{campanhaId}/adiamento` | `Void` | — |  | ✓ |
| POST | `/api/v1/avaliacoes/{campanhaId}/recusa` | `Void` | — |  | ✓ |
| GET | `/api/v1/avaliacoes/campanhas` | `List<CampanhaResponse>` | List |  | ✓ |
| POST | `/api/v1/avaliacoes/campanhas` | `CampanhaResponse` | — |  | ✓ |
| PATCH | `/api/v1/avaliacoes/campanhas/{id}/encerramento` | `CampanhaResponse` | — |  | ✓ |
| GET | `/api/v1/avaliacoes/campanhas/{id}/resumo` | `ResumoResponse` | — |  | ✓ |
| GET | `/api/v1/avaliacoes/campanhas/{id}/respostas` | `List<RespostaItem>` | List |  | ✓ |

### Módulo `chamado`

#### ChamadoController

`modules/chamado/infrastructure/web/ChamadoController.java` · base `/api/v1/chamados`

- (a) listagem: PageResponse ×2
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `ChamadoResponse`); Request separado (AbrirChamadoRequest, InteracaoChamadoRequest, …)
- (d) /options: não
- (e) status nas listagens: prioridade: enum cru; status: enum cru
- (f) OpenAPI: 12/12 (via `ChamadoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/chamados` | `ChamadoResponse` | — |  | ✓ |
| GET | `/api/v1/chamados/meus` | `PageResponse<ChamadoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/chamados` | `PageResponse<ChamadoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/chamados/{id}` | `ChamadoResponse` | — |  | ✓ |
| PATCH | `/api/v1/chamados/meus/{id}/cancelamento` | `ChamadoResponse` | — |  | ✓ |
| POST | `/api/v1/chamados/meus/{id}/interacoes` | `InteracaoChamadoResponse` | — |  | ✓ |
| PATCH | `/api/v1/chamados/meus/{id}/reabertura` | `ChamadoResponse` | — |  | ✓ |
| POST | `/api/v1/chamados/{id}/interacoes` | `InteracaoChamadoResponse` | — |  | ✓ |
| GET | `/api/v1/chamados/{id}/interacoes` | `java.util.List<InteracaoChamadoResponse>` | — |  | ✓ |
| PATCH | `/api/v1/chamados/{id}/atendimento` | `ChamadoResponse` | — |  | ✓ |
| POST | `/api/v1/chamados/{id}/anexos` | `AnexoChamadoResponse` | — |  | ✓ |
| GET | `/api/v1/chamados/{id}/anexos/{idAnexo}/download` | `Resource` | — |  | ✓ |

#### DashboardChamadosController

`modules/chamado/infrastructure/web/DashboardChamadosController.java` · base `/api/v1/chamados/dashboards`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 1/1 (via `DashboardChamadosControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/chamados/dashboards/gerencial` | `DashboardChamadosResponse` | — |  | ✓ |

#### EquipeAtendimentoController

`modules/chamado/infrastructure/web/EquipeAtendimentoController.java` · base `/api/v1/chamados/equipes`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `EquipeAtendimentoResponse`); Request separado (EquipeAtendimentoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `EquipeAtendimentoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/chamados/equipes` | `PageResponse<EquipeAtendimentoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/chamados/equipes/{id}` | `EquipeAtendimentoResponse` | — |  | ✓ |
| POST | `/api/v1/chamados/equipes` | `EquipeAtendimentoResponse` | — |  | ✓ |
| PUT | `/api/v1/chamados/equipes/{id}` | `EquipeAtendimentoResponse` | — |  | ✓ |
| PATCH | `/api/v1/chamados/equipes/{id}/ativacao` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/chamados/equipes/{id}/desativacao` | `Void` | — |  | ✓ |

#### TopicoChamadoController

`modules/chamado/infrastructure/web/TopicoChamadoController.java` · base `/api/v1/chamados/topicos`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem `TopicoChamadoResponse`; Request separado (TopicoChamadoRequest)
- (d) /options: não
- (e) status nas listagens: prioridadePadrao: enum cru
- (f) OpenAPI: 6/6 (via `TopicoChamadoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/chamados/topicos` | `List<TopicoChamadoResponse>` | List |  | ✓ |
| GET | `/api/v1/chamados/topicos/administracao` | `PageResponse<TopicoChamadoResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/chamados/topicos` | `TopicoChamadoResponse` | — |  | ✓ |
| PUT | `/api/v1/chamados/topicos/{id}` | `TopicoChamadoResponse` | — |  | ✓ |
| PATCH | `/api/v1/chamados/topicos/{id}/ativacao` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/chamados/topicos/{id}/desativacao` | `Void` | — |  | ✓ |

### Módulo `contrato`

#### AcaoController

`modules/contrato/infrastructure/web/AcaoController.java` · base `/api/v1/contratos/acoes`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `AcaoResponse`); Request separado (AcaoRequest, ConfirmarImportacaoAcaoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 9/9 (via `AcaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/contratos/acoes` | `AcaoResponse` | — |  | ✓ |
| POST | `/api/v1/contratos/acoes/importar` | `ImportacaoAcaoResponse` | — |  | ✓ |
| POST | `/api/v1/contratos/acoes/confirmar-importacao` | `ImportacaoAcaoResponse` | — |  | ✓ |
| PUT | `/api/v1/contratos/acoes/{id}` | `AcaoResponse` | — |  | ✓ |
| PUT | `/api/v1/contratos/acoes/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/contratos/acoes/{id}` | `AcaoResponse` | — |  | ✓ |
| GET | `/api/v1/contratos/acoes` | `PageResponse<AcaoResponse>` | PageResponse | ✓ | ✓ |
| DELETE | `/api/v1/contratos/acoes/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/contratos/acoes/importar/modelo` | `byte[]` | — |  | ✓ |

#### AcaoValorController

`modules/contrato/infrastructure/web/AcaoValorController.java` · base `/api/v1/contratos/acoes-valores`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `AcaoValorResponse`); Request separado (AcaoValorRequest, ConfirmarImportacaoAcaoValorRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 9/9 (via `AcaoValorControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/contratos/acoes-valores` | `AcaoValorResponse` | — |  | ✓ |
| POST | `/api/v1/contratos/acoes-valores/importar` | `ImportacaoAcaoValorResponse` | — |  | ✓ |
| POST | `/api/v1/contratos/acoes-valores/confirmar-importacao` | `ImportacaoAcaoValorResponse` | — |  | ✓ |
| PUT | `/api/v1/contratos/acoes-valores/{id}` | `AcaoValorResponse` | — |  | ✓ |
| PUT | `/api/v1/contratos/acoes-valores/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/contratos/acoes-valores/{id}` | `AcaoValorResponse` | — |  | ✓ |
| GET | `/api/v1/contratos/acoes-valores` | `PageResponse<AcaoValorResponse>` | PageResponse | ✓ | ✓ |
| DELETE | `/api/v1/contratos/acoes-valores/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/contratos/acoes-valores/importar/modelo` | `byte[]` | — |  | ✓ |

#### ContratoController

`modules/contrato/infrastructure/web/ContratoController.java` · base `/api/v1/contratos`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `ContratoResponse`); Request separado (ContratoRequest, ConfirmarImportacaoContratoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 9/9 (via `ContratoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/contratos` | `ContratoResponse` | — |  | ✓ |
| POST | `/api/v1/contratos/importar` | `ImportacaoContratoResponse` | — |  | ✓ |
| POST | `/api/v1/contratos/confirmar-importacao` | `ImportacaoContratoResponse` | — |  | ✓ |
| PUT | `/api/v1/contratos/{id}` | `ContratoResponse` | — |  | ✓ |
| PUT | `/api/v1/contratos/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/contratos/{id}` | `ContratoResponse` | — |  | ✓ |
| GET | `/api/v1/contratos` | `PageResponse<ContratoResponse>` | PageResponse | ✓ | ✓ |
| DELETE | `/api/v1/contratos/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/contratos/importar/modelo` | `byte[]` | — |  | ✓ |

### Módulo `dashboard`

#### DashboardController

`modules/dashboard/infrastructure/web/DashboardController.java` · base `/api/v1/dashboards`, `/api/api/v1/dashboards`

- (a) listagem: PageResponse ×4
- (b) ordenação: mapeamento parcial (ConsultarTurnosUseCase, ConsultarNotasDoRecorteUseCase)
- (c) DTOs: listagem `TurnoConsultaResponse, NotaDoRecorteResponse`
- (d) /options: não
- (e) status nas listagens: status: enum cru
- (f) OpenAPI: 18/18 (via `DashboardControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/dashboards/operacional` | `DashboardOperacionalResponse` | — |  | ✓ |
| GET | `/api/api/v1/dashboards/operacional` | `DashboardOperacionalResponse` | — |  | ✓ |
| GET | `/api/v1/dashboards/meta-fisica` | `DashboardMetaFisicaResponse` | — |  | ✓ |
| GET | `/api/api/v1/dashboards/meta-fisica` | `DashboardMetaFisicaResponse` | — |  | ✓ |
| GET | `/api/v1/dashboards/turnos` | `DashboardTurnosResponse` | — |  | ✓ |
| GET | `/api/api/v1/dashboards/turnos` | `DashboardTurnosResponse` | — |  | ✓ |
| GET | `/api/v1/dashboards/turnos/{idTurno}/detalhamento` | `DetalhamentoTurnoResponse` | — |  | ✓ |
| GET | `/api/api/v1/dashboards/turnos/{idTurno}/detalhamento` | `DetalhamentoTurnoResponse` | — |  | ✓ |
| GET | `/api/v1/dashboards/turnos/consulta` | `PageResponse<TurnoConsultaResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/api/v1/dashboards/turnos/consulta` | `PageResponse<TurnoConsultaResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/dashboards/turnos/consulta/exportar/resumo` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/api/v1/dashboards/turnos/consulta/exportar/resumo` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/dashboards/turnos/consulta/exportar/detalhado` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/api/v1/dashboards/turnos/consulta/exportar/detalhado` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/dashboards/notas` | `PageResponse<NotaDoRecorteResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/api/v1/dashboards/notas` | `PageResponse<NotaDoRecorteResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/dashboards/execucoes/{idExecucao}/contexto` | `ContextoExecucaoResponse` | — |  | ✓ |
| GET | `/api/api/v1/dashboards/execucoes/{idExecucao}/contexto` | `ContextoExecucaoResponse` | — |  | ✓ |

### Módulo `desconto`

#### DashboardDescontoController

`modules/desconto/infrastructure/web/DashboardDescontoController.java` · base `/api/v1/descontos/dashboards`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 1/1 (via `DashboardDescontoDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/descontos/dashboards/executivo` | `DashboardDescontosResponse` | — |  | ✓ |

#### DescontoController

`modules/desconto/infrastructure/web/DescontoController.java` · base `/api/v1/descontos`

- (a) listagem: PageResponse ×1
- (b) ordenação: mapeamento parcial (DescontoUseCases)
- (c) DTOs: listagem = detalhe (DTO único `DescontoResponse`); Request separado (DescontoRequest, DescontoItemRequest, …)
- (d) /options: não
- (e) status nas listagens: status: enum cru
- (f) OpenAPI: 18/18 (via `DescontoDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/descontos` | `DescontoResponse` | — |  | ✓ |
| PUT | `/api/v1/descontos/{id}` | `DescontoResponse` | — |  | ✓ |
| POST | `/api/v1/descontos/{id}/itens` | `Void` | — |  | ✓ |
| PUT | `/api/v1/descontos/{id}/itens/{itemId}` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/descontos/{id}/itens/{itemId}` | `Void` | — |  | ✓ |
| POST | `/api/v1/descontos/{id}/anexos` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/descontos/{id}/anexos/{anexoId}` | `Void` | — |  | ✓ |
| GET | `/api/v1/descontos/{id}/anexos/{anexoId}/download` | `Resource` | — |  | ✓ |
| PATCH | `/api/v1/descontos/{id}/validar` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/descontos/{id}/baixar` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/descontos/{id}/rejeitar` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/descontos/{id}/desfazer` | `Void` | — |  | ✓ |
| POST | `/api/v1/descontos/{id}/finalizar` | `Void` | — |  | ✓ |
| GET | `/api/v1/descontos/{id}/historico` | `java.util.List<EventoDescontoResponse>` | — |  | ✓ |
| GET | `/api/v1/descontos/{id}` | `DescontoResponse` | — |  | ✓ |
| GET | `/api/v1/descontos` | `PageResponse<DescontoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/descontos/exportar/resumo` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/descontos/exportar/detalhado` | `StreamingResponseBody` | — |  | ✓ |

#### MotivoDescontoController

`modules/desconto/infrastructure/web/MotivoDescontoController.java` · base `/api/v1/descontos/motivos`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `MotivoDescontoResponse`); Request separado (MotivoDescontoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `MotivoDescontoDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/descontos/motivos` | `MotivoDescontoResponse` | — |  | ✓ |
| PUT | `/api/v1/descontos/motivos/{id}` | `MotivoDescontoResponse` | — |  | ✓ |
| DELETE | `/api/v1/descontos/motivos/{id}` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/descontos/motivos/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/descontos/motivos/{id}` | `MotivoDescontoResponse` | — |  | ✓ |
| GET | `/api/v1/descontos/motivos` | `PageResponse<MotivoDescontoResponse>` | PageResponse | ✓ | ✓ |

#### TipoEquipamentoController

`modules/desconto/infrastructure/web/TipoEquipamentoController.java` · base `/api/v1/descontos/tipos-equipamento`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `TipoEquipamentoResponse`); Request separado (TipoEquipamentoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `TipoEquipamentoDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/descontos/tipos-equipamento` | `TipoEquipamentoResponse` | — |  | ✓ |
| PUT | `/api/v1/descontos/tipos-equipamento/{id}` | `TipoEquipamentoResponse` | — |  | ✓ |
| DELETE | `/api/v1/descontos/tipos-equipamento/{id}` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/descontos/tipos-equipamento/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/descontos/tipos-equipamento/{id}` | `TipoEquipamentoResponse` | — |  | ✓ |
| GET | `/api/v1/descontos/tipos-equipamento` | `PageResponse<TipoEquipamentoResponse>` | PageResponse | ✓ | ✓ |

### Módulo `estoque`

#### AvaliacaoMaterialController

`modules/estoque/infrastructure/web/AvaliacaoMaterialController.java` · base `/api/v1/avaliacoes-material`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `AvaliacaoMaterialResponse`); Request separado (AvaliacaoMaterialRequest, ConfirmarImportacaoAvaliacaoMaterialRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 9/9 (via `AvaliacaoMaterialControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/avaliacoes-material` | `AvaliacaoMaterialResponse` | — |  | ✓ |
| POST | `/api/v1/avaliacoes-material/importar` | `ImportacaoAvaliacaoMaterialResponse` | — |  | ✓ |
| POST | `/api/v1/avaliacoes-material/confirmar-importacao` | `ImportacaoAvaliacaoMaterialResponse` | — |  | ✓ |
| PUT | `/api/v1/avaliacoes-material/{id}` | `AvaliacaoMaterialResponse` | — |  | ✓ |
| GET | `/api/v1/avaliacoes-material` | `PageResponse<AvaliacaoMaterialResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/avaliacoes-material/{id}` | `AvaliacaoMaterialResponse` | — |  | ✓ |
| PATCH | `/api/v1/avaliacoes-material/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/avaliacoes-material/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/avaliacoes-material/importar/modelo` | `byte[]` | — |  | ✓ |

#### CentroInvestimentoController

`modules/estoque/infrastructure/web/CentroInvestimentoController.java` · base `/api/v1/centros-investimento`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `CentroInvestimentoResponse`); Request separado (CentroInvestimentoRequest, ConfirmarImportacaoCentroInvestimentoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 9/9 (via `CentroInvestimentoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/centros-investimento` | `CentroInvestimentoResponse` | — |  | ✓ |
| POST | `/api/v1/centros-investimento/importar` | `ImportacaoCentroInvestimentoResponse` | — |  | ✓ |
| POST | `/api/v1/centros-investimento/confirmar-importacao` | `ImportacaoCentroInvestimentoResponse` | — |  | ✓ |
| PUT | `/api/v1/centros-investimento/{id}` | `CentroInvestimentoResponse` | — |  | ✓ |
| GET | `/api/v1/centros-investimento` | `PageResponse<CentroInvestimentoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/centros-investimento/{id}` | `CentroInvestimentoResponse` | — |  | ✓ |
| PATCH | `/api/v1/centros-investimento/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/centros-investimento/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/centros-investimento/importar/modelo` | `byte[]` | — |  | ✓ |

#### DashboardSolicitacaoController

`modules/estoque/infrastructure/web/DashboardSolicitacaoController.java` · base `/api/v1/dashboard/solicitacoes`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 3/3 (via `DashboardSolicitacaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/dashboard/solicitacoes` | `DashboardSolicitacaoResponse` | — |  | ✓ |
| GET | `/api/v1/dashboard/solicitacoes/analitico` | `PainelSolicitacoesResponse` | — |  | ✓ |
| GET | `/api/v1/dashboard/solicitacoes/analitico/exportar` | `StreamingResponseBody` | — |  | ✓ |

#### EstoqueController

`modules/estoque/infrastructure/web/EstoqueController.java` · base `/api/v1/estoques`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `EstoqueResponse`); Request separado (EstoqueRequest, ConfirmarImportacaoEstoqueRequest)
- (d) /options: sim (`/options`, `LookupPageDto`)
- (e) status nas listagens: —
- (f) OpenAPI: 10/10 (via `EstoqueControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/estoques` | `EstoqueResponse` | — |  | ✓ |
| POST | `/api/v1/estoques/importar` | `ImportacaoEstoqueResponse` | — |  | ✓ |
| POST | `/api/v1/estoques/confirmar-importacao` | `ImportacaoEstoqueResponse` | — |  | ✓ |
| PUT | `/api/v1/estoques/{id}` | `EstoqueResponse` | — |  | ✓ |
| GET | `/api/v1/estoques` | `PageResponse<EstoqueResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/estoques/options` | `LookupPageDto<LookupOptionDto>` | — |  | ✓ |
| GET | `/api/v1/estoques/{id}` | `EstoqueResponse` | — |  | ✓ |
| PATCH | `/api/v1/estoques/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/estoques/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/estoques/importar/modelo` | `byte[]` | — |  | ✓ |

#### FechamentoObraController

`modules/estoque/infrastructure/web/FechamentoObraController.java` · base `/api/v1/obras/encerramento`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: n/a (page/size manuais)
- (c) DTOs: listagem ≠ detalhe (FechamentoObraResponses.Resumo / FechamentoObraResponses.Detalhe); Request separado (FechamentoObraRequests.Importar, FechamentoObraRequests.Criar, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 21/21 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/obras/encerramento` | `PageResponse<FechamentoObraResponses.Resumo>` | PageResponse | m | ✓ |
| GET | `/api/v1/obras/encerramento/solicitantes` | `List<FechamentoObraResponses.Pessoa>` | List |  | ✓ |
| GET | `/api/v1/obras/encerramento/obras/situacoes` | `Map<UUID, SituacaoFechamentoObra>` | — |  | ✓ |
| GET | `/api/v1/obras/encerramento/obras/{idObra}/situacao` | `FechamentoObraResponses.SituacaoObra` | — |  | ✓ |
| GET | `/api/v1/obras/encerramento/exportar/{formato}` | `byte[]` | — |  | ✓ |
| GET | `/api/v1/obras/encerramento/importar/modelo` | `byte[]` | — |  | ✓ |
| POST | `/api/v1/obras/encerramento/importar/validar` | `FechamentoObraResponses.Importacao` | — |  | ✓ |
| POST | `/api/v1/obras/encerramento/importar/revalidar` | `FechamentoObraResponses.Importacao` | — |  | ✓ |
| POST | `/api/v1/obras/encerramento/importar/confirmar` | `FechamentoObraResponses.Importacao` | — |  | ✓ |
| GET | `/api/v1/obras/encerramento/{id}` | `FechamentoObraResponses.Detalhe` | — |  | ✓ |
| GET | `/api/v1/obras/encerramento/{id}/historico` | `HistoricoSolicitacaoResponse` | — | m | ✓ |
| POST | `/api/v1/obras/encerramento` | `FechamentoObraResponses.Criacao` | — |  | ✓ |
| PUT | `/api/v1/obras/encerramento/{id}` | `FechamentoObraResponses.Detalhe` | — |  | ✓ |
| PUT | `/api/v1/obras/encerramento/{id}/reserva` | `FechamentoObraResponses.Detalhe` | — |  | ✓ |
| POST | `/api/v1/obras/encerramento/{id}/pendencias` | `FechamentoObraResponses.Detalhe` | — |  | ✓ |
| DELETE | `/api/v1/obras/encerramento/{id}/pendencias` | `FechamentoObraResponses.Detalhe` | — |  | ✓ |
| POST | `/api/v1/obras/encerramento/{id}/cancelamento` | `FechamentoObraResponses.Detalhe` | — |  | ✓ |
| POST | `/api/v1/obras/encerramento/{id}/movimentacoes` | `FechamentoObraResponses.Detalhe` | — |  | ✓ |
| POST | `/api/v1/obras/encerramento/{id}/movimentacoes/previa` | `FechamentoObraResponses.Previa` | — |  | ✓ |
| POST | `/api/v1/obras/encerramento/{id}/movimentacoes/{idOperacao}/estorno` | `FechamentoObraResponses.Detalhe` | — |  | ✓ |
| POST | `/api/v1/obras/encerramento/{id}/movimentacoes/{idOperacao}/estorno/previa` | `FechamentoObraResponses.Previa` | — |  | ✓ |

#### HistoricoSolicitacaoController

`modules/estoque/infrastructure/web/HistoricoSolicitacaoController.java` · base `/api/v1/solicitacoes-material`

- (a) listagem: sem listagem
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 1/1 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/solicitacoes-material/{idSolicitacao}/historico` | `HistoricoSolicitacaoResponse` | — | ✓ | ✓ |

#### MaterialController

`modules/estoque/infrastructure/web/MaterialController.java` · base `/api/v1/materiais`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `MaterialResponse`); Request separado (MaterialRequest, ConfirmarImportacaoMaterialRequest)
- (d) /options: sim (`/options`, `LookupPageDto`)
- (e) status nas listagens: —
- (f) OpenAPI: 10/10 (via `MaterialControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/materiais` | `MaterialResponse` | — |  | ✓ |
| POST | `/api/v1/materiais/importar` | `ImportacaoMaterialResponse` | — |  | ✓ |
| POST | `/api/v1/materiais/confirmar-importacao` | `ImportacaoMaterialResponse` | — |  | ✓ |
| PUT | `/api/v1/materiais/{id}` | `MaterialResponse` | — |  | ✓ |
| GET | `/api/v1/materiais` | `PageResponse<MaterialResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/materiais/options` | `LookupPageDto<LookupOptionDto>` | — |  | ✓ |
| GET | `/api/v1/materiais/{id}` | `MaterialResponse` | — |  | ✓ |
| PATCH | `/api/v1/materiais/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/materiais/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/materiais/importar/modelo` | `byte[]` | — |  | ✓ |

#### MotivoPendenciaController

`modules/estoque/infrastructure/web/MotivoPendenciaController.java` · base `/api/v1/motivos-pendencia`

- (a) listagem: List ×1
- (b) ordenação: n/a
- (c) DTOs: só Request (MotivoPendenciaRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 0/5 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/motivos-pendencia` | `List<MotivoPendenciaResponse>` | List |  | ✗ |
| POST | `/api/v1/motivos-pendencia` | `MotivoPendenciaResponse` | — |  | ✗ |
| PUT | `/api/v1/motivos-pendencia/{id}` | `MotivoPendenciaResponse` | — |  | ✗ |
| PATCH | `/api/v1/motivos-pendencia/{id}/ativar` | `Void` | — |  | ✗ |
| DELETE | `/api/v1/motivos-pendencia/{id}` | `Void` | — |  | ✗ |

#### MotivoRejeicaoController

`modules/estoque/infrastructure/web/MotivoRejeicaoController.java` · base `/api/v1/motivos-rejeicao`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `MotivoRejeicaoResponse`); Request separado (MotivoRejeicaoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `MotivoRejeicaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/motivos-rejeicao` | `MotivoRejeicaoResponse` | — |  | ✓ |
| PUT | `/api/v1/motivos-rejeicao/{id}` | `MotivoRejeicaoResponse` | — |  | ✓ |
| GET | `/api/v1/motivos-rejeicao` | `PageResponse<MotivoRejeicaoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/motivos-rejeicao/{id}` | `MotivoRejeicaoResponse` | — |  | ✓ |
| PATCH | `/api/v1/motivos-rejeicao/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/motivos-rejeicao/{id}` | `Void` | — |  | ✓ |

#### MovimentacaoEstoqueController

`modules/estoque/infrastructure/web/MovimentacaoEstoqueController.java` · base `/api/v1/movimentacoes-estoque`

- (a) listagem: PageResponse ×1
- (b) ordenação: mapeamento parcial (MovimentacaoEstoqueUseCases)
- (c) DTOs: listagem ≠ detalhe (MovimentacaoOperacaoSummaryResponse / MovimentacaoOperacaoResponse); Request separado (MovimentacaoBulkRequest, DevolucaoComercialRequest, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 16/16 (via `MovimentacaoEstoqueControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/movimentacoes-estoque` | `PageResponse<MovimentacaoOperacaoSummaryResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/movimentacoes-estoque/contagens` | `MovimentacaoContagensResponse` | — |  | ✓ |
| GET | `/api/v1/movimentacoes-estoque/operacao/{idReferencia}` | `MovimentacaoOperacaoResponse` | — |  | ✓ |
| GET | `/api/v1/movimentacoes-estoque/{id}` | `MovimentacaoEstoqueResponse` | — |  | ✓ |
| POST | `/api/v1/movimentacoes-estoque/entrada` | `Void` | — |  | ✓ |
| POST | `/api/v1/movimentacoes-estoque/baixa` | `Void` | — |  | ✓ |
| POST | `/api/v1/movimentacoes-estoque/transferencia` | `UUID` | — |  | ✓ |
| GET | `/api/v1/movimentacoes-estoque/operacao/{idReferencia}/assinaturas/{parte}` | `Resource` | — |  | ✓ |
| POST | `/api/v1/movimentacoes-estoque/devolucao-comercial` | `UUID` | — |  | ✓ |
| POST | `/api/v1/movimentacoes-estoque/devolucao-tecnica` | `UUID` | — |  | ✓ |
| POST | `/api/v1/movimentacoes-estoque/importar` | `ImportacaoMovimentacaoResponse` | — |  | ✓ |
| POST | `/api/v1/movimentacoes-estoque/importar/validar` | `ImportacaoMovimentacaoResponse` | — |  | ✓ |
| POST | `/api/v1/movimentacoes-estoque/confirmar-importacao` | `ImportacaoMovimentacaoResponse` | — |  | ✓ |
| POST | `/api/v1/movimentacoes-estoque/importar/confirmar` | `ImportacaoMovimentacaoResponse` | — |  | ✓ |
| GET | `/api/v1/movimentacoes-estoque/importar/modelo` | `byte[]` | — |  | ✓ |
| GET | `/api/v1/movimentacoes-estoque/modelo-csv` | `byte[]` | — |  | ✓ |

#### ProjecaoSolicitacoesObraController

`modules/estoque/infrastructure/web/ProjecaoSolicitacoesObraController.java` · base `/api/v1/obras`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 2/2 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/obras/{idObra}/solicitacoes-material` | `ProjecaoSolicitacoesObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/{idObra}/saldo-material` | `SaldoObraResponse` | — |  | ✓ |

#### RelatorioAlmoxarifadoController

`modules/estoque/infrastructure/web/RelatorioAlmoxarifadoController.java` · base `/api/v1/almoxarifado/relatorios`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 3/3 (via `RelatorioAlmoxarifadoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/almoxarifado/relatorios/movimentacoes` | `MovimentacoesRelatorioResponse` | — |  | ✓ |
| GET | `/api/v1/almoxarifado/relatorios/estoque` | `EstoqueRelatorioResponse` | — |  | ✓ |
| GET | `/api/v1/almoxarifado/relatorios/fechamento` | `FechamentoRelatorioResponse` | — |  | ✓ |

#### SaldoController

`modules/estoque/infrastructure/web/SaldoController.java` · base `/api/v1/saldos`

- (a) listagem: PageResponse ×2
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `SaldoResponse`); Request separado (VerificarSeriesRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 4/4 (via `SaldoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/saldos` | `PageResponse<SaldoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/saldos/seriais` | `PageResponse<SaldoSerieResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/saldos/seriais/verificar` | `List<SaldoSerieResponse>` | — |  | ✓ |
| GET | `/api/v1/saldos/{id}` | `SaldoResponse` | — |  | ✓ |

#### SeriesAConferirController

`modules/estoque/infrastructure/web/SeriesAConferirController.java` · base `/api/v1/saldos/estoques/{idEstoque}/series-a-conferir`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: só Request (ConciliarSerieAplicadaRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 2/2 (via `SeriesAConferirControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/saldos/estoques/{idEstoque}/series-a-conferir` | `SeriesAConferirResponse` | — |  | ✓ |
| POST | `/api/v1/saldos/estoques/{idEstoque}/series-a-conferir/conciliacoes` | `SeriesAConferirResponse` | — |  | ✓ |

#### SolicitacaoController

`modules/estoque/infrastructure/web/SolicitacaoController.java` · base `/api/v1/solicitacoes-material`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem ≠ detalhe (SolicitacaoSummaryResponse / SolicitacaoResponse); Request separado (SolicitacaoRequest, DefinirSeriesReservadasRequest, …)
- (d) /options: não
- (e) status nas listagens: status: enum cru; statusSeparacao: enum cru; etapaOperacional: enum cru
- (f) OpenAPI: 25/27 (via `SolicitacaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/solicitacoes-material` | `UUID` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/direta` | `UUID` | — |  | ✓ |
| GET | `/api/v1/solicitacoes-material` | `PageResponse<SolicitacaoSummaryResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/solicitacoes-material/{id}` | `SolicitacaoResponse` | — |  | ✓ |
| GET | `/api/v1/solicitacoes-material/{id}/consumo-anterior` | `ConsumoAnteriorSolicitacaoResponse` | — |  | ✓ |
| GET | `/api/v1/solicitacoes-material/{id}/consumo-anterior/{idMaterial}` | `ConsumoAnteriorDetalheResponse` | — |  | ✓ |
| GET | `/api/v1/solicitacoes-material/{id}/assinaturas/{parte}` | `Resource` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/{id}/aprovar` | `Void` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/{id}/rejeitar` | `Void` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/{id}/pendencia` | `Void` | — |  | ✗ |
| DELETE | `/api/v1/solicitacoes-material/{id}/pendencia` | `Void` | — |  | ✗ |
| PUT | `/api/v1/solicitacoes-material/{id}/itens/{idItem}/series-reservadas` | `List<String>` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/{id}/entregar` | `UUID` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/{id}/estornar` | `UUID` | — |  | ✓ |
| PATCH | `/api/v1/solicitacoes-material/{id}/estorno-parcial` | `UUID` | — |  | ✓ |
| GET | `/api/v1/solicitacoes-material/exportar/resumo` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/solicitacoes-material/exportar/detalhado` | `StreamingResponseBody` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/comerciais/importar/validar` | `ImportacaoSolicitacaoComercialResponse` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/comerciais/importar/confirmar` | `ImportacaoSolicitacaoComercialResponse` | — |  | ✓ |
| GET | `/api/v1/solicitacoes-material/comerciais/importar/modelo` | `byte[]` | — |  | ✓ |
| GET | `/api/v1/solicitacoes-material/importar/modelo` | `byte[]` | — |  | ✓ |
| GET | `/api/v1/solicitacoes-material/modelo-csv` | `byte[]` | — |  | ✓ |
| GET | `/api/v1/solicitacoes-material/comerciais/modelo` | `byte[]` | — |  | ✓ |
| GET | `/api/v1/solicitacoes-material/kanban` | `KanbanSolicitacaoTecnicaResponse` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/{id}/separacao/iniciar` | `StatusSeparacao` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/{id}/separacao/concluir` | `StatusSeparacao` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/{id}/separacao/pular` | `StatusSeparacao` | — |  | ✓ |

#### SolicitacaoTecnicaController

`modules/estoque/infrastructure/web/SolicitacaoTecnicaController.java` · base `/api/v1/solicitacoes-material`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: só Request (ConfirmarImportacaoSolicitacaoTecnicaRequest, CriarSolicitacaoTecnicaRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 17/17 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/solicitacoes-material/tecnicas/kanban` | `KanbanSolicitacaoTecnicaResponse` | — |  | ✓ |
| GET | `/api/v1/solicitacoes-material/importacoes/modelo` | `byte[]` | — |  | ✓ |
| GET | `/api/v1/solicitacoes-material/tecnicas/importacoes/modelo` | `byte[]` | — |  | ✓ |
| GET | `/api/v1/solicitacoes-material/tecnicas/modelo` | `byte[]` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/importacoes/validacao` | `ImportacaoSolicitacaoTecnicaResponse` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/importacoes/confirmacao` | `ConfirmacaoImportacaoSolicitacaoTecnicaResponse` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/tecnicas` | `CriacaoSolicitacaoTecnicaResponse` | — |  | ✓ |
| PUT | `/api/v1/solicitacoes-material/tecnicas/{idSolicitacao}/planejamento` | `PlanejamentoSolicitacaoTecnicaResponse` | — |  | ✓ |
| PUT | `/api/v1/solicitacoes-material/tecnicas/{idSolicitacao}/reserva` | `ReservaSolicitacaoTecnicaResponse` | — |  | ✓ |
| PUT | `/api/v1/solicitacoes-material/tecnicas/{idSolicitacao}/ocorrencia` | `TrocaOcorrenciaTecnicaResponse` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/tecnicas/{idSolicitacao}/separacao/iniciar` | `StatusSeparacao` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/tecnicas/{idSolicitacao}/separacao/concluir` | `StatusSeparacao` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/tecnicas/{idSolicitacao}/separacao/pular` | `StatusSeparacao` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/tecnicas/{idSolicitacao}/entregas` | `OperacaoTecnicaResponse` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/tecnicas/{idSolicitacao}/devolucoes` | `OperacaoTecnicaResponse` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/tecnicas/{idSolicitacao}/estornos` | `OperacaoTecnicaResponse` | — |  | ✓ |
| POST | `/api/v1/solicitacoes-material/tecnicas/{idSolicitacao}/encerramento` | `Void` | — |  | ✓ |

#### TipoEstoqueController

`modules/estoque/infrastructure/web/TipoEstoqueController.java` · base `/api/v1/tipos-estoque`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `TipoEstoqueResponse`); Request separado (TipoEstoqueRequest, ConfirmarImportacaoTipoEstoqueRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 9/9 (via `TipoEstoqueControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/tipos-estoque` | `TipoEstoqueResponse` | — |  | ✓ |
| POST | `/api/v1/tipos-estoque/importar` | `ImportacaoTipoEstoqueResponse` | — |  | ✓ |
| POST | `/api/v1/tipos-estoque/confirmar-importacao` | `ImportacaoTipoEstoqueResponse` | — |  | ✓ |
| PUT | `/api/v1/tipos-estoque/{id}` | `TipoEstoqueResponse` | — |  | ✓ |
| GET | `/api/v1/tipos-estoque` | `PageResponse<TipoEstoqueResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/tipos-estoque/{id}` | `TipoEstoqueResponse` | — |  | ✓ |
| PATCH | `/api/v1/tipos-estoque/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/tipos-estoque/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/tipos-estoque/importar/modelo` | `byte[]` | — |  | ✓ |

### Módulo `execucao`

#### ExecucaoComercialController

`modules/execucao/infrastructure/web/ExecucaoComercialController.java` · base `/api/v1/execucoes-comerciais`

- (a) listagem: PageResponse ×2, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `ExecucaoComercialResponse`); Request separado (RegistrarExecucaoRequest, InformarNumeroOficialRequest, …)
- (d) /options: não
- (e) status nas listagens: statusExecucao: enum cru
- (f) OpenAPI: 9/9 (via `ExecucaoComercialControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/execucoes-comerciais` | `ExecucaoComercialResponse` | — |  | ✓ |
| PATCH | `/api/v1/execucoes-comerciais/{id}/numero-oficial` | `ExecucaoComercialResponse` | — |  | ✓ |
| PUT | `/api/v1/execucoes-comerciais/{id}/lancamentos` | `ExecucaoComercialResponse` | — |  | ✓ |
| GET | `/api/v1/execucoes-comerciais/{id}/historico` | `List<EventoHistoricoNotaResponse>` | List |  | ✓ |
| GET | `/api/v1/execucoes-comerciais/{id}` | `ExecucaoComercialResponse` | — |  | ✓ |
| GET | `/api/v1/execucoes-comerciais` | `PageResponse<ExecucaoComercialResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/execucoes-comerciais/exportar/resumo` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/execucoes-comerciais/exportar/detalhado` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/execucoes-comerciais/minha-equipe` | `PageResponse<ExecucaoComercialResponse>` | PageResponse | ✓ | ✓ |

#### MetaFisicaController

`modules/execucao/infrastructure/web/MetaFisicaController.java` · base `/api/v1/metas-fisicas`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `MetaFisicaResponse`); Request separado (MetaFisicaRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `MetaFisicaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/metas-fisicas` | `MetaFisicaResponse` | — |  | ✓ |
| GET | `/api/v1/metas-fisicas/{id}` | `MetaFisicaResponse` | — |  | ✓ |
| GET | `/api/v1/metas-fisicas` | `PageResponse<MetaFisicaResponse>` | PageResponse | ✓ | ✓ |
| PUT | `/api/v1/metas-fisicas/{id}` | `MetaFisicaResponse` | — |  | ✓ |
| DELETE | `/api/v1/metas-fisicas/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/metas-fisicas/{id}/ativar` | `Void` | — |  | ✓ |

#### TipoServicoController

`modules/execucao/infrastructure/web/TipoServicoController.java` · base `/api/v1/tipos-servico`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `TipoServicoResponse`); Request separado (TipoServicoRequest)
- (d) /options: equivalente (`/opcoes`)
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `TipoServicoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/tipos-servico` | `TipoServicoResponse` | — |  | ✓ |
| GET | `/api/v1/tipos-servico/{id}` | `TipoServicoResponse` | — |  | ✓ |
| GET | `/api/v1/tipos-servico` | `PageResponse<TipoServicoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/tipos-servico/opcoes` | `List<TipoServicoResponse>` | List |  | ✓ |
| PUT | `/api/v1/tipos-servico/{id}` | `TipoServicoResponse` | — |  | ✓ |
| PATCH | `/api/v1/tipos-servico/{id}/status` | `Void` | — |  | ✓ |

#### TurnoController

`modules/execucao/infrastructure/web/TurnoController.java` · base `/api/v1/turnos`, `/api/api/v1/turnos`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: detalhe `TurnoResponse`; Request separado (AbrirTurnoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 10/10 (via `TurnoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/turnos/abrir` | `TurnoResponse` | — |  | ✓ |
| POST | `/api/api/v1/turnos/abrir` | `TurnoResponse` | — |  | ✓ |
| POST | `/api/v1/turnos/{id}/fechar` | `Void` | — |  | ✓ |
| POST | `/api/api/v1/turnos/{id}/fechar` | `Void` | — |  | ✓ |
| GET | `/api/v1/turnos/minha-equipe/composicao` | `ComposicaoTurnoResponse` | — |  | ✓ |
| GET | `/api/api/v1/turnos/minha-equipe/composicao` | `ComposicaoTurnoResponse` | — |  | ✓ |
| GET | `/api/v1/turnos/{id}` | `TurnoResponse` | — |  | ✓ |
| GET | `/api/api/v1/turnos/{id}` | `TurnoResponse` | — |  | ✓ |
| GET | `/api/v1/turnos/equipe/{idEquipe}/ativo` | `TurnoResponse` | — |  | ✓ |
| GET | `/api/api/v1/turnos/equipe/{idEquipe}/ativo` | `TurnoResponse` | — |  | ✓ |

### Módulo `financeiro`

#### DashboardFinanceiroController

`modules/financeiro/infrastructure/web/DashboardFinanceiroController.java` · base `/api/v1/financeiro/dashboards`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 1/1 (via `DashboardFinanceiroDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/financeiro/dashboards/executivo` | `DashboardFinanceiroResponse` | — |  | ✓ |

#### DecisaoPorEmailController

`modules/financeiro/infrastructure/web/DecisaoPorEmailController.java` · base `/api/v1/publico/financeiro/decisoes`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: detalhe `DecisaoEmailResponse`; Request separado (DecisaoEmailRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 2/2 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/publico/financeiro/decisoes/{token}` | `DecisaoEmailResponse` | — |  | ✓ |
| POST | `/api/v1/publico/financeiro/decisoes/{token}` | `DecisaoEmailResponse` | — |  | ✓ |

#### DocumentoFinanceiroController

`modules/financeiro/infrastructure/web/DocumentoFinanceiroController.java` · base `/api/v1/financeiro/documentos`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `DocumentoFinanceiroResponse`); Request separado (DocumentoRequest, MotivoRequest)
- (d) /options: não
- (e) status nas listagens: situacao: enum cru; situacaoRotulo: String; diasNaSituacao: long
- (f) OpenAPI: 11/11 (via `DocumentoFinanceiroDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/financeiro/documentos` | `DocumentoFinanceiroResponse` | — |  | ✓ |
| PUT | `/api/v1/financeiro/documentos/{id}` | `DocumentoFinanceiroResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/documentos/{id}/vincular` | `DocumentoFinanceiroResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/documentos/{id}/desvincular` | `DocumentoFinanceiroResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/documentos/{id}/pendencia` | `DocumentoFinanceiroResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/documentos/{id}/arquivar` | `DocumentoFinanceiroResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/documentos/{id}/reabrir` | `DocumentoFinanceiroResponse` | — |  | ✓ |
| DELETE | `/api/v1/financeiro/documentos/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/financeiro/documentos/{id}/conteudo` | `Resource` | — |  | ✓ |
| GET | `/api/v1/financeiro/documentos/{id}` | `DocumentoFinanceiroResponse` | — |  | ✓ |
| GET | `/api/v1/financeiro/documentos` | `PageResponse<DocumentoFinanceiroResponse>` | PageResponse | ✓ | ✓ |

#### FormularioSolicitacaoController

`modules/financeiro/infrastructure/web/FormularioSolicitacaoController.java` · base `/api/v1/financeiro/formularios`

- (a) listagem: PageResponse ×1, List ×2
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem `FormularioResumoResponse`; Request separado (FormularioRequest, FormularioUpdateRequest, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 14/14 (via `FormularioSolicitacaoDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/financeiro/formularios` | `FormularioSchemaResponse` | — |  | ✓ |
| PUT | `/api/v1/financeiro/formularios/{id}` | `FormularioSchemaResponse` | — |  | ✓ |
| POST | `/api/v1/financeiro/formularios/{id}/duplicar` | `FormularioSchemaResponse` | — |  | ✓ |
| DELETE | `/api/v1/financeiro/formularios/{id}` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/formularios/{id}/ativar` | `Void` | — |  | ✓ |
| POST | `/api/v1/financeiro/formularios/{id}/campos` | `FormularioSchemaResponse` | — |  | ✓ |
| PUT | `/api/v1/financeiro/formularios/{id}/campos/{idCampo}` | `FormularioSchemaResponse` | — |  | ✓ |
| DELETE | `/api/v1/financeiro/formularios/{id}/campos/{idCampo}` | `FormularioSchemaResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/formularios/{id}/campos/ordenacao` | `FormularioSchemaResponse` | — |  | ✓ |
| GET | `/api/v1/financeiro/formularios/{id}/schema` | `FormularioSchemaResponse` | — |  | ✓ |
| GET | `/api/v1/financeiro/formularios/schema` | `FormularioSchemaResponse` | — |  | ✓ |
| GET | `/api/v1/financeiro/formularios/variantes` | `List<FormularioResumoResponse>` | List |  | ✓ |
| GET | `/api/v1/financeiro/formularios` | `PageResponse<FormularioResumoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/financeiro/formularios/{id}/campos-canonicos` | `List<CampoCanonicoDisponivelResponse>` | List |  | ✓ |

#### FornecedorController

`modules/financeiro/infrastructure/web/FornecedorController.java` · base `/api/v1/financeiro/fornecedores`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `FornecedorResponse`); Request separado (FornecedorRequest, MotivoRequest)
- (d) /options: não
- (e) status nas listagens: status: enum cru
- (f) OpenAPI: 9/9 (via `FornecedorDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/financeiro/fornecedores` | `FornecedorResponse` | — |  | ✓ |
| PUT | `/api/v1/financeiro/fornecedores/{id}` | `FornecedorResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/fornecedores/{id}/homologar` | `FornecedorResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/fornecedores/{id}/bloquear` | `FornecedorResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/fornecedores/{id}/desbloquear` | `FornecedorResponse` | — |  | ✓ |
| DELETE | `/api/v1/financeiro/fornecedores/{id}` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/fornecedores/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/financeiro/fornecedores/{id}` | `FornecedorResponse` | — |  | ✓ |
| GET | `/api/v1/financeiro/fornecedores` | `PageResponse<FornecedorResponse>` | PageResponse | ✓ | ✓ |

#### SolicitacaoCompraController

`modules/financeiro/infrastructure/web/SolicitacaoCompraController.java` · base `/api/v1/financeiro/solicitacoes-compra`

- (a) listagem: PageResponse ×1, List ×2
- (b) ordenação: mapeamento parcial (SolicitacaoCompraUseCases, SolicitacaoPagamentoUseCases)
- (c) DTOs: listagem = detalhe (DTO único `SolicitacaoCompraResponse`); Request separado (SolicitacaoRequest, AprovacaoRequest, …)
- (d) /options: não
- (e) status nas listagens: statusAnterior: enum cru; statusNovo: enum cru; situacao: enum cru; situacaoRotulo: String; status: enum cru
- (f) OpenAPI: 17/17 (via `SolicitacaoCompraDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/financeiro/solicitacoes-compra` | `SolicitacaoCompraResponse` | — |  | ✓ |
| PUT | `/api/v1/financeiro/solicitacoes-compra/{id}` | `SolicitacaoCompraResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/solicitacoes-compra/{id}/submeter` | `SolicitacaoCompraResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/solicitacoes-compra/{id}/aprovar` | `SolicitacaoCompraResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/solicitacoes-compra/{id}/rejeitar` | `SolicitacaoCompraResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/solicitacoes-compra/{id}/cancelar` | `SolicitacaoCompraResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/solicitacoes-compra/{id}/desfazer-decisao` | `SolicitacaoCompraResponse` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-compra/{id}/historico` | `List<EventoSolicitacaoResponse>` | List |  | ✓ |
| POST | `/api/v1/financeiro/solicitacoes-compra/{id}/documentos` | `SolicitacaoCompraResponse` | — |  | ✓ |
| DELETE | `/api/v1/financeiro/solicitacoes-compra/{id}/documentos/{idDocumento}` | `Void` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-compra/{id}/documentos/{idDocumento}` | `Resource` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-compra/{id}/documentos` | `List<DocumentoResumoResponse>` | List |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-compra/{id}` | `SolicitacaoCompraResponse` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-compra/numero/{numero}` | `SolicitacaoCompraResponse` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-compra/exportar/resumo` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-compra/exportar/detalhado` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-compra` | `PageResponse<SolicitacaoCompraResponse>` | PageResponse | ✓ | ✓ |

#### SolicitacaoPagamentoController

`modules/financeiro/infrastructure/web/SolicitacaoPagamentoController.java` · base `/api/v1/financeiro/solicitacoes-pagamento`

- (a) listagem: PageResponse ×1, List ×2
- (b) ordenação: mapeamento parcial (SolicitacaoCompraUseCases, SolicitacaoPagamentoUseCases)
- (c) DTOs: listagem = detalhe (DTO único `SolicitacaoPagamentoResponse`); Request separado (SolicitacaoRequest, AprovacaoRequest, …)
- (d) /options: não
- (e) status nas listagens: statusAnterior: enum cru; statusNovo: enum cru; situacao: enum cru; situacaoRotulo: String; status: enum cru
- (f) OpenAPI: 18/18 (via `SolicitacaoPagamentoDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/financeiro/solicitacoes-pagamento` | `SolicitacaoPagamentoResponse` | — |  | ✓ |
| PUT | `/api/v1/financeiro/solicitacoes-pagamento/{id}` | `SolicitacaoPagamentoResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/solicitacoes-pagamento/{id}/submeter` | `SolicitacaoPagamentoResponse` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-pagamento/pre-preenchimento` | `PrePreenchimentoResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/solicitacoes-pagamento/{id}/aprovar` | `SolicitacaoPagamentoResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/solicitacoes-pagamento/{id}/rejeitar` | `SolicitacaoPagamentoResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/solicitacoes-pagamento/{id}/cancelar` | `SolicitacaoPagamentoResponse` | — |  | ✓ |
| PATCH | `/api/v1/financeiro/solicitacoes-pagamento/{id}/desfazer-decisao` | `SolicitacaoPagamentoResponse` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-pagamento/{id}/historico` | `List<EventoSolicitacaoResponse>` | List |  | ✓ |
| POST | `/api/v1/financeiro/solicitacoes-pagamento/{id}/documentos` | `SolicitacaoPagamentoResponse` | — |  | ✓ |
| DELETE | `/api/v1/financeiro/solicitacoes-pagamento/{id}/documentos/{idDocumento}` | `Void` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-pagamento/{id}/documentos/{idDocumento}` | `Resource` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-pagamento/{id}/documentos` | `List<DocumentoResumoResponse>` | List |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-pagamento/{id}` | `SolicitacaoPagamentoResponse` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-pagamento/numero/{numero}` | `SolicitacaoPagamentoResponse` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-pagamento/exportar/resumo` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-pagamento/exportar/detalhado` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/financeiro/solicitacoes-pagamento` | `PageResponse<SolicitacaoPagamentoResponse>` | PageResponse | ✓ | ✓ |

### Módulo `frota`

#### AbastecimentoAppFrotaController

`modules/frota/infrastructure/web/AbastecimentoAppFrotaController.java` · base `/api/v1/frota/app/abastecimento`

- (a) listagem: List ×1
- (b) ordenação: n/a
- (c) DTOs: detalhe `Resource`; Request separado (SolicitarAbastecimentoRequest, RealizarAbastecimentoRequest)
- (d) /options: não
- (e) status nas listagens: situacao: enum cru; situacaoRotulo: String
- (f) OpenAPI: 7/7 (via `AbastecimentoAppFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/app/abastecimento/catalogo` | `CatalogoAbastecimentoAppResponse` | — |  | ✓ |
| GET | `/api/v1/frota/app/abastecimento/solicitacoes` | `List<AbastecimentoAppResponse>` | List |  | ✓ |
| POST | `/api/v1/frota/app/abastecimento/solicitacoes` | `AbastecimentoAppResponse` | — |  | ✓ |
| POST | `/api/v1/frota/app/abastecimento/solicitacoes/{idAparelho}/fotos/{idFoto}` | `AbastecimentoAppResponse` | — |  | ✓ |
| GET | `/api/v1/frota/app/abastecimento/solicitacoes/{idAparelho}/fotos/{idFoto}` | `Resource` | — |  | ✓ |
| POST | `/api/v1/frota/app/abastecimento/solicitacoes/{idAparelho}/cancelamento` | `AbastecimentoAppResponse` | — |  | ✓ |
| POST | `/api/v1/frota/app/abastecimento/solicitacoes/{idAparelho}/realizado` | `AbastecimentoAppResponse` | — |  | ✓ |

#### AbastecimentoFrotaController

`modules/frota/infrastructure/web/AbastecimentoFrotaController.java` · base `/api/v1/frota/abastecimentos`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem ≠ detalhe (AbastecimentoResumoResponse / AbastecimentoDetalheResponse); Request separado (AprovarAbastecimentoRequest, AbastecimentoAvulsoRequest, …)
- (d) /options: não
- (e) status nas listagens: situacao: enum cru; situacaoRotulo: String
- (f) OpenAPI: 9/9 (via `AbastecimentoFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/abastecimentos` | `PageResponse<AbastecimentoResumoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/abastecimentos/{id}` | `AbastecimentoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/abastecimentos/{id}/aprovacao` | `AbastecimentoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/abastecimentos/avulsos` | `AbastecimentoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/abastecimentos/{id}/reprovacao` | `AbastecimentoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/abastecimentos/{id}/liberacao` | `AbastecimentoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/abastecimentos/{id}/cancelamento` | `AbastecimentoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/abastecimentos/{id}/avisos/{idAviso}/aberto` | `AbastecimentoDetalheResponse` | — |  | ✓ |
| GET | `/api/v1/frota/abastecimentos/{id}/fotos/{idFoto}` | `Resource` | — |  | ✓ |

#### AgendaFrotaController

`modules/frota/infrastructure/web/AgendaFrotaController.java` · base `/api/v1/frota/agenda`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 1/1 (via `AgendaFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/agenda` | `AgendaFrotaResponse` | — |  | ✓ |

#### AnaliseIaFrotaController

`modules/frota/infrastructure/web/AnaliseIaFrotaController.java` · base `/api/v1/frota`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `AnaliseIaFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/ordens-servico/{id}/analise-ia` | `AnaliseIaResponse.Estado` | — |  | ✓ |
| POST | `/api/v1/frota/ordens-servico/{id}/analise-ia` | `AnaliseIaResponse` | — |  | ✓ |
| GET | `/api/v1/frota/checklists/{id}/analise-ia` | `AnaliseIaResponse.Estado` | — |  | ✓ |
| POST | `/api/v1/frota/checklists/{id}/analise-ia` | `AnaliseIaResponse` | — |  | ✓ |
| GET | `/api/v1/frota/abastecimentos/{id}/analise-ia` | `AnaliseIaResponse.Estado` | — |  | ✓ |
| POST | `/api/v1/frota/abastecimentos/{id}/analise-ia` | `AnaliseIaResponse` | — |  | ✓ |

#### AnexoOrdemServicoFrotaController

`modules/frota/infrastructure/web/AnexoOrdemServicoFrotaController.java` · base `/api/v1/frota/ordens-servico/{id}/anexos`

- (a) listagem: List ×1
- (b) ordenação: n/a
- (c) DTOs: detalhe `Resource`
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 4/4 (via `AnexoOrdemServicoFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/ordens-servico/{id}/anexos` | `List<AnexoOrdemServicoResponse>` | List |  | ✓ |
| POST | `/api/v1/frota/ordens-servico/{id}/anexos` | `List<AnexoOrdemServicoResponse>` | — |  | ✓ |
| GET | `/api/v1/frota/ordens-servico/{id}/anexos/{idAnexo}` | `Resource` | — |  | ✓ |
| DELETE | `/api/v1/frota/ordens-servico/{id}/anexos/{idAnexo}` | `List<AnexoOrdemServicoResponse>` | — |  | ✓ |

#### ApoliceFrotaController

`modules/frota/infrastructure/web/ApoliceFrotaController.java` · base `/api/v1/frota/apolices`

- (a) listagem: PageResponse ×1, List ×2
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `ApoliceResponse`); Request separado (ApoliceRequest, CoberturaApoliceRequest, …)
- (d) /options: não
- (e) status nas listagens: situacao: enum cru; situacaoRotulo: String
- (f) OpenAPI: 18/18 (via `ApoliceFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/apolices` | `PageResponse<ApoliceResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/apolices/cobrindo` | `List<ApoliceResponse>` | List |  | ✓ |
| GET | `/api/v1/frota/apolices/veiculos` | `List<CoberturaVeiculoResponse>` | List |  | ✓ |
| GET | `/api/v1/frota/apolices/{id}` | `ApoliceResponse` | — |  | ✓ |
| POST | `/api/v1/frota/apolices` | `ApoliceResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/apolices/{id}` | `ApoliceResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/apolices/{id}` | `Void` | — |  | ✓ |
| POST | `/api/v1/frota/apolices/{id}/veiculos` | `ApoliceResponse` | — |  | ✓ |
| POST | `/api/v1/frota/apolices/{id}/veiculos/{idCobertura}/encerramento` | `ApoliceResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/apolices/{id}/veiculos/{idCobertura}` | `ApoliceResponse` | — |  | ✓ |
| POST | `/api/v1/frota/apolices/{id}/parcelas/geracao` | `ApoliceResponse` | — |  | ✓ |
| POST | `/api/v1/frota/apolices/{id}/parcelas` | `ApoliceResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/apolices/{id}/parcelas/{idParcela}` | `ApoliceResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/apolices/{id}/parcelas/{idParcela}` | `ApoliceResponse` | — |  | ✓ |
| GET | `/api/v1/frota/apolices/parcelas/{idParcela}/preenchimento-financeiro` | `PreenchimentoFinanceiroResponse` | — |  | ✓ |
| POST | `/api/v1/frota/apolices/{id}/anexos` | `ApoliceResponse` | — |  | ✓ |
| GET | `/api/v1/frota/apolices/{id}/anexos/{idAnexo}` | `Resource` | — |  | ✓ |
| DELETE | `/api/v1/frota/apolices/{id}/anexos/{idAnexo}` | `ApoliceResponse` | — |  | ✓ |

#### AprovacaoAbastecimentoAppFrotaController

`modules/frota/infrastructure/web/AprovacaoAbastecimentoAppFrotaController.java` · base `/api/v1/frota/app/abastecimento/aprovacoes`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem ≠ detalhe (AbastecimentoResumoResponse / AprovacaoAbastecimentoAppResponse); Request separado (AprovarAbastecimentoRequest, JustificativaRequest)
- (d) /options: não
- (e) status nas listagens: situacao: enum cru; situacaoRotulo: String
- (f) OpenAPI: 6/6 (via `AprovacaoAbastecimentoAppFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/app/abastecimento/aprovacoes` | `List<AbastecimentoResumoResponse>` | List |  | ✓ |
| GET | `/api/v1/frota/app/abastecimento/aprovacoes/carteira` | `PageResponse<AbastecimentoResumoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/app/abastecimento/aprovacoes/{id}` | `AprovacaoAbastecimentoAppResponse` | — |  | ✓ |
| POST | `/api/v1/frota/app/abastecimento/aprovacoes/{id}/aprovacao` | `AprovacaoAbastecimentoAppResponse` | — |  | ✓ |
| POST | `/api/v1/frota/app/abastecimento/aprovacoes/{id}/reprovacao` | `AprovacaoAbastecimentoAppResponse` | — |  | ✓ |
| GET | `/api/v1/frota/app/abastecimento/aprovacoes/{id}/fotos/{idFoto}` | `Resource` | — |  | ✓ |

#### ChecklistAppFrotaController

`modules/frota/infrastructure/web/ChecklistAppFrotaController.java` · base `/api/v1/frota/app`

- (a) listagem: List ×2
- (b) ordenação: n/a
- (c) DTOs: detalhe `ChecklistDetalheResponse, Resource`; Request separado (RegistrarChecklistRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 7/7 (via `ChecklistAppFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/app/checklist/catalogo` | `CatalogoChecklistAppResponse` | — |  | ✓ |
| POST | `/api/v1/frota/app/checklists` | `ChecklistRegistradoResponse` | — |  | ✓ |
| POST | `/api/v1/frota/app/checklists/{idAparelho}/fotos/{idFoto}` | `ChecklistRegistradoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/app/checklists` | `List<ChecklistAppItemResponse>` | List |  | ✓ |
| GET | `/api/v1/frota/app/checklists/veiculo/{idVeiculo}` | `List<ChecklistAppItemResponse>` | List |  | ✓ |
| GET | `/api/v1/frota/app/checklists/{id}` | `ChecklistDetalheResponse` | — |  | ✓ |
| GET | `/api/v1/frota/app/checklists/{id}/fotos/{idFoto}` | `Resource` | — |  | ✓ |

#### ChecklistFrotaController

`modules/frota/infrastructure/web/ChecklistFrotaController.java` · base `/api/v1/frota/checklists`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem ≠ detalhe (ChecklistResumoResponse / ChecklistDetalheResponse)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 4/4 (via `ChecklistFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/checklists` | `PageResponse<ChecklistResumoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/checklists/sem-checklist-hoje` | `List<VeiculoSemChecklistResponse>` | List |  | ✓ |
| GET | `/api/v1/frota/checklists/{id}` | `ChecklistDetalheResponse` | — |  | ✓ |
| GET | `/api/v1/frota/checklists/{id}/fotos/{idFoto}` | `Resource` | — |  | ✓ |

#### CondutorFrotaController

`modules/frota/infrastructure/web/CondutorFrotaController.java` · base `/api/`

- (a) listagem: PageResponse ×2
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `CondutorResponse`); Request separado (CondutorRequest, EncerrarPeriodoRequest)
- (d) /options: não
- (e) status nas listagens: situacaoCnh: enum cru
- (f) OpenAPI: 6/6 (via `CondutorFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/condutores` | `PageResponse<CondutorResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/condutores/{idColaborador}` | `CondutorResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/condutores/{idColaborador}` | `CondutorResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/condutores/{idColaborador}` | `Void` | — |  | ✓ |
| GET | `/api/v1/frota/condutores/{idColaborador}/veiculos` | `PageResponse<VinculoCondutorResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/frota/vinculos-condutor/{idVinculo}/encerramento` | `VinculoCondutorResponse` | — |  | ✓ |

#### ConfiguracaoAbastecimentoFrotaController

`modules/frota/infrastructure/web/ConfiguracaoAbastecimentoFrotaController.java` · base `/api/v1/frota/abastecimento`

- (a) listagem: PageResponse ×2, List ×3
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `PostoAbastecimentoResponse`); Request separado (PrecoPostoRequest, PostoAbastecimentoRequest, …)
- (d) /options: não
- (e) status nas listagens: situacao: Situacao; situacaoRotulo: String
- (f) OpenAPI: 20/20 (via `ConfiguracaoAbastecimentoFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/abastecimento/postos/{id}/precos` | `List<PrecoPostoResponse>` | List |  | ✓ |
| POST | `/api/v1/frota/abastecimento/postos/{id}/precos` | `PrecoPostoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/abastecimento/sugestoes-preco` | `List<SugestaoPrecoPostoResponse>` | List |  | ✓ |
| POST | `/api/v1/frota/abastecimento/sugestoes-preco/{id}/confirmacao` | `SugestaoPrecoPostoResponse` | — |  | ✓ |
| POST | `/api/v1/frota/abastecimento/sugestoes-preco/{id}/descarte` | `SugestaoPrecoPostoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/abastecimento/postos` | `PageResponse<PostoAbastecimentoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/abastecimento/postos/{id}` | `PostoAbastecimentoResponse` | — |  | ✓ |
| POST | `/api/v1/frota/abastecimento/postos` | `PostoAbastecimentoResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/abastecimento/postos/{id}` | `PostoAbastecimentoResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/abastecimento/postos/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/frota/abastecimento/postos/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/frota/abastecimento/produtos` | `PageResponse<ProdutoAbastecimentoResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/frota/abastecimento/produtos` | `ProdutoAbastecimentoResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/abastecimento/produtos/{id}` | `ProdutoAbastecimentoResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/abastecimento/produtos/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/frota/abastecimento/produtos/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/frota/abastecimento/carteiras` | `List<CarteiraAprovacaoResponse>` | List |  | ✓ |
| GET | `/api/v1/frota/abastecimento/carteiras/{idUsuario}` | `CarteiraAprovacaoResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/abastecimento/carteiras/{idUsuario}` | `CarteiraAprovacaoResponse` | — |  | ✓ |
| POST | `/api/v1/frota/abastecimento/carteiras/{idUsuario}/bases` | `CarteiraAprovacaoResponse` | — |  | ✓ |

#### ConfiguracaoFrotaController

`modules/frota/infrastructure/web/ConfiguracaoFrotaController.java` · base `/api/v1/frota`

- (a) listagem: PageResponse ×2
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem `TipoVeiculoResponse, TipoImplementoResponse`; Request separado (ParametrosFrotaRequest, TipoVeiculoRequest, …)
- (d) /options: equivalente (`/opcoes`)
- (e) status nas listagens: —
- (f) OpenAPI: 13/13 (via `ConfiguracaoFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/opcoes` | `OpcoesFrotaResponse` | — |  | ✓ |
| GET | `/api/v1/frota/parametros` | `ParametrosFrotaResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/parametros` | `ParametrosFrotaResponse` | — |  | ✓ |
| GET | `/api/v1/frota/tipos-veiculo` | `PageResponse<TipoVeiculoResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/frota/tipos-veiculo` | `TipoVeiculoResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/tipos-veiculo/{id}` | `TipoVeiculoResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/tipos-veiculo/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/frota/tipos-veiculo/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/frota/tipos-implemento` | `PageResponse<TipoImplementoResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/frota/tipos-implemento` | `TipoImplementoResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/tipos-implemento/{id}` | `TipoImplementoResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/tipos-implemento/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/frota/tipos-implemento/{id}/ativar` | `Void` | — |  | ✓ |

#### DespesaVeiculoFrotaController

`modules/frota/infrastructure/web/DespesaVeiculoFrotaController.java` · base `/api/v1/frota/despesas`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `DespesaVeiculoResponse`); Request separado (DespesaVeiculoRequest, List<DespesaImportacaoLinha>)
- (d) /options: não
- (e) status nas listagens: situacaoPagamento: enum cru; situacaoPagamentoRotulo: String
- (f) OpenAPI: 13/13 (via `DespesaVeiculoFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/despesas` | `PageResponse<DespesaVeiculoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/despesas/resumo` | `ResumoDespesasResponse` | — |  | ✓ |
| GET | `/api/v1/frota/despesas/{id}` | `DespesaVeiculoResponse` | — |  | ✓ |
| POST | `/api/v1/frota/despesas` | `DespesaVeiculoResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/despesas/{id}` | `DespesaVeiculoResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/despesas/{id}` | `Void` | — |  | ✓ |
| POST | `/api/v1/frota/despesas/{id}/anexos` | `DespesaVeiculoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/despesas/{id}/anexos/{idAnexo}` | `Resource` | — |  | ✓ |
| DELETE | `/api/v1/frota/despesas/{id}/anexos/{idAnexo}` | `DespesaVeiculoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/despesas/{id}/preenchimento-financeiro` | `PreenchimentoFinanceiroResponse` | — |  | ✓ |
| POST | `/api/v1/frota/despesas/importacao` | `ImportacaoDespesasResponse` | — |  | ✓ |
| POST | `/api/v1/frota/despesas/importacao/confirmacao` | `ImportacaoDespesasResponse` | — |  | ✓ |
| GET | `/api/v1/frota/despesas/importacao/modelo` | `byte[]` | — |  | ✓ |

#### DocumentoFiscalOrdemServicoFrotaController

`modules/frota/infrastructure/web/DocumentoFiscalOrdemServicoFrotaController.java` · base `/api/v1/frota/ordens-servico/{id}/documentos-fiscais`

- (a) listagem: List ×1
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 5/5 (via `DocumentoFiscalOrdemServicoFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/ordens-servico/{id}/documentos-fiscais` | `List<DocumentoFiscalOrdemServicoResponse>` | List |  | ✓ |
| POST | `/api/v1/frota/ordens-servico/{id}/documentos-fiscais` | `DocumentoFiscalOrdemServicoResponse` | — |  | ✓ |
| POST | `/api/v1/frota/ordens-servico/{id}/documentos-fiscais/{idDocumento}/arquivo` | `DocumentoFiscalOrdemServicoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/ordens-servico/{id}/documentos-fiscais/{idDocumento}/arquivo` | `Resource` | — |  | ✓ |
| DELETE | `/api/v1/frota/ordens-servico/{id}/documentos-fiscais/{idDocumento}` | `Void` | — |  | ✓ |

#### DocumentoFrotaController

`modules/frota/infrastructure/web/DocumentoFrotaController.java` · base `/api/v1/frota/documentos`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `DocumentoFrotaResponse`); Request separado (DocumentoFrotaRequest)
- (d) /options: não
- (e) status nas listagens: situacaoVencimento: enum cru
- (f) OpenAPI: 7/7 (via `DocumentoFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/documentos` | `PageResponse<DocumentoFrotaResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/documentos/{id}` | `DocumentoFrotaResponse` | — |  | ✓ |
| POST | `/api/v1/frota/documentos` | `DocumentoFrotaResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/documentos/{id}` | `DocumentoFrotaResponse` | — |  | ✓ |
| POST | `/api/v1/frota/documentos/{id}/arquivo` | `DocumentoFrotaResponse` | — |  | ✓ |
| GET | `/api/v1/frota/documentos/{id}/arquivo` | `Resource` | — |  | ✓ |
| DELETE | `/api/v1/frota/documentos/{id}` | `Void` | — |  | ✓ |

#### EstoqueOficinaFrotaController

`modules/frota/infrastructure/web/EstoqueOficinaFrotaController.java` · base `/api/v1/frota/estoque`

- (a) listagem: PageResponse ×2, List ×3
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem `EstoqueFrotaApi.Peca, MovimentoEstoqueFrotaResponse`; Request separado (AlmoxarifadoFrotaRequest, PecaFrotaRequest, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 17/17 (via `EstoqueOficinaFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/estoque/almoxarifados` | `List<AlmoxarifadoFrotaResponse>` | List |  | ✓ |
| POST | `/api/v1/frota/estoque/almoxarifados` | `AlmoxarifadoFrotaResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/estoque/almoxarifados/{id}` | `AlmoxarifadoFrotaResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/estoque/almoxarifados/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/frota/estoque/pecas` | `PageResponse<EstoqueFrotaApi.Peca>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/estoque/pecas/grupos` | `List<String>` | List |  | ✓ |
| POST | `/api/v1/frota/estoque/pecas` | `EstoqueFrotaApi.Peca` | — |  | ✓ |
| PUT | `/api/v1/frota/estoque/pecas/{id}` | `EstoqueFrotaApi.Peca` | — |  | ✓ |
| DELETE | `/api/v1/frota/estoque/pecas/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/frota/estoque/saldos` | `List<EstoqueFrotaApi.SaldoPeca>` | List |  | ✓ |
| GET | `/api/v1/frota/estoque/resumo` | `EstoqueFrotaApi.Resumo` | — |  | ✓ |
| PUT | `/api/v1/frota/estoque/almoxarifados/{idEstoque}/pecas/{idMaterial}` | `EstoqueFrotaApi.SaldoPeca` | — |  | ✓ |
| GET | `/api/v1/frota/estoque/movimentos` | `PageResponse<MovimentoEstoqueFrotaResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/frota/estoque/entradas` | `List<MovimentoEstoqueFrotaResponse>` | — |  | ✓ |
| POST | `/api/v1/frota/estoque/saidas` | `List<MovimentoEstoqueFrotaResponse>` | — |  | ✓ |
| POST | `/api/v1/frota/estoque/transferencias` | `List<MovimentoEstoqueFrotaResponse>` | — |  | ✓ |
| POST | `/api/v1/frota/estoque/ajustes` | `MovimentoEstoqueFrotaResponse` | — |  | ✓ |

#### ExecucaoOrdemServicoFrotaController

`modules/frota/infrastructure/web/ExecucaoOrdemServicoFrotaController.java` · base `/api/v1/frota/ordens-servico/{id}`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: só Request (ServicoOrdemServicoRequest, MecanicoParaTodosRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 8/8 (via `ExecucaoOrdemServicoFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/frota/ordens-servico/{id}/servicos` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/ordens-servico/{id}/servicos/{idServico}` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/ordens-servico/{id}/servicos/{idServico}` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/ordens-servico/{id}/servicos/mecanico` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/ordens-servico/{id}/ajustes` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/ordens-servico/{id}/pecas` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/ordens-servico/{id}/pecas/{idPeca}` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/ordens-servico/{id}/pecas/{idPeca}` | `OrdemServicoDetalheResponse` | — |  | ✓ |

#### FaturaPostoFrotaController

`modules/frota/infrastructure/web/FaturaPostoFrotaController.java` · base `/api/v1/frota/abastecimento/faturas`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem `FaturaPostoResponse`; Request separado (FaturaPostoRequest, ConferirFaturaRequest)
- (d) /options: não
- (e) status nas listagens: situacao: Situacao; situacaoRotulo: String
- (f) OpenAPI: 6/6 (via `FaturaPostoFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/abastecimento/faturas` | `PageResponse<FaturaPostoResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/frota/abastecimento/faturas` | `FaturaPostoResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/abastecimento/faturas/{id}` | `FaturaPostoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/abastecimento/faturas/{id}/conferencia` | `ConferenciaFaturaResponse` | — |  | ✓ |
| POST | `/api/v1/frota/abastecimento/faturas/{id}/conferencia` | `FaturaPostoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/abastecimento/faturas/{id}/preenchimento-financeiro` | `PreenchimentoFinanceiroResponse` | — |  | ✓ |

#### ImplementoFrotaController

`modules/frota/infrastructure/web/ImplementoFrotaController.java` · base `/api/v1/frota/implementos`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `ImplementoResponse`); Request separado (ImplementoRequest, AcoplarImplementoRequest, …)
- (d) /options: não
- (e) status nas listagens: situacao: enum cru
- (f) OpenAPI: 9/9 (via `ImplementoFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/implementos` | `PageResponse<ImplementoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/implementos/{id}` | `ImplementoResponse` | — |  | ✓ |
| POST | `/api/v1/frota/implementos` | `ImplementoResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/implementos/{id}` | `ImplementoResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/implementos/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/frota/implementos/{id}/ativar` | `Void` | — |  | ✓ |
| POST | `/api/v1/frota/implementos/{id}/acoplamentos` | `AcoplamentoImplementoResponse` | — |  | ✓ |
| POST | `/api/v1/frota/implementos/{id}/desacoplamento` | `AcoplamentoImplementoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/implementos/{id}/acoplamentos` | `List<AcoplamentoImplementoResponse>` | List |  | ✓ |

#### ItemManutencaoFrotaController

`modules/frota/infrastructure/web/ItemManutencaoFrotaController.java` · base `/api/v1/frota/itens-manutencao`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `ItemManutencaoResponse`); Request separado (ItemManutencaoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `ItemManutencaoFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/itens-manutencao` | `PageResponse<ItemManutencaoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/itens-manutencao/{id}` | `ItemManutencaoResponse` | — |  | ✓ |
| POST | `/api/v1/frota/itens-manutencao` | `ItemManutencaoResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/itens-manutencao/{id}` | `ItemManutencaoResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/itens-manutencao/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/frota/itens-manutencao/{id}/ativar` | `Void` | — |  | ✓ |

#### LiberacaoCnhFrotaController

`modules/frota/infrastructure/web/LiberacaoCnhFrotaController.java` · base `/api/`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem `LiberacaoCnhResponse`; Request separado (LiberacaoCnhRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 3/3 (via `LiberacaoCnhFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/condutores/{idColaborador}/aptidao` | `AptidaoConducaoResponse` | — |  | ✓ |
| POST | `/api/v1/frota/liberacoes-cnh` | `LiberacaoCnhResponse` | — |  | ✓ |
| GET | `/api/v1/frota/liberacoes-cnh` | `PageResponse<LiberacaoCnhResponse>` | PageResponse | ✓ | ✓ |

#### ModeloChecklistFrotaController

`modules/frota/infrastructure/web/ModeloChecklistFrotaController.java` · base `/api/v1/frota/checklist/modelos`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem ≠ detalhe (ModeloChecklistResumoResponse / ModeloChecklistResponse); Request separado (ModeloChecklistRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 7/7 (via `ModeloChecklistFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/checklist/modelos` | `PageResponse<ModeloChecklistResumoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/checklist/modelos/{id}` | `ModeloChecklistResponse` | — |  | ✓ |
| POST | `/api/v1/frota/checklist/modelos` | `ModeloChecklistResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/checklist/modelos/{id}` | `ModeloChecklistResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/checklist/modelos/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/frota/checklist/modelos/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/frota/checklist/modelos/veiculo/{idVeiculo}` | `ModelosVeiculoChecklistResponse` | — |  | ✓ |

#### OdometroFrotaController

`modules/frota/infrastructure/web/OdometroFrotaController.java` · base `/api/v1/frota/odometro`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem `LeituraOdometroResponse`; Request separado (JustificativaRequest)
- (d) /options: não
- (e) status nas listagens: situacao: enum cru; motivoSituacao: String
- (f) OpenAPI: 3/3 (via `OdometroFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/odometro` | `PageResponse<LeituraOdometroResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/frota/odometro/{id}/anulacao` | `LeituraOdometroResponse` | — |  | ✓ |
| POST | `/api/v1/frota/odometro/{id}/confirmacao` | `LeituraOdometroResponse` | — |  | ✓ |

#### OrdemServicoFrotaController

`modules/frota/infrastructure/web/OrdemServicoFrotaController.java` · base `/api/v1/frota/ordens-servico`

- (a) listagem: PageResponse ×1, List ×2
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem ≠ detalhe (OrdemServicoResponse / OrdemServicoDetalheResponse); Request separado (AbrirOrdemServicoRequest, EditarOrdemServicoRequest, …)
- (d) /options: não
- (e) status nas listagens: situacao: enum cru; situacaoAprovacao: enum cru
- (f) OpenAPI: 16/16 (via `OrdemServicoFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/ordens-servico` | `PageResponse<OrdemServicoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/ordens-servico/painel` | `PainelOrdensServicoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/ordens-servico/{id}` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/ordens-servico` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/ordens-servico/{id}` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/ordens-servico/{id}/agendamento` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/ordens-servico/{id}/inicio` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/ordens-servico/{id}/previsao` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/ordens-servico/{id}/conclusao` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/ordens-servico/{id}/baixa` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/ordens-servico/{id}/reabertura` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/ordens-servico/{id}/cancelamento` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/ordens-servico/{id}/parada` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| GET | `/api/v1/frota/ordens-servico/{id}/preenchimento-financeiro` | `PreenchimentoFinanceiroResponse` | — |  | ✓ |
| GET | `/api/v1/frota/ordens-servico/repeticoes` | `List<PreviaRepeticaoResponse>` | List |  | ✓ |
| GET | `/api/v1/frota/ordens-servico/fornecedores` | `List<FornecedorFrotaResponse>` | List |  | ✓ |

#### PendenciaChecklistFrotaController

`modules/frota/infrastructure/web/PendenciaChecklistFrotaController.java` · base `/api/v1/frota/checklist/pendencias`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem `PendenciaChecklistResponse`; Request separado (AbrirOsPendenciasRequest, ResolverPendenciasRequest, …)
- (d) /options: não
- (e) status nas listagens: situacao: enum cru; situacaoRotulo: String
- (f) OpenAPI: 4/4 (via `PendenciaChecklistFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/checklist/pendencias` | `PageResponse<PendenciaChecklistResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/frota/checklist/pendencias/ordem-servico` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/checklist/pendencias/resolucao` | `OrdemServicoDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/checklist/pendencias/{id}/descarte` | `PendenciaChecklistResponse` | — |  | ✓ |

#### PneuFrotaController

`modules/frota/infrastructure/web/PneuFrotaController.java` · base `/api/v1/frota/pneus`

- (a) listagem: PageResponse ×3, List ×2
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `PneuResponse`); Request separado (PneuRequest, EnvioPneuRequest, …)
- (d) /options: não
- (e) status nas listagens: situacao: enum cru; situacaoRotulo: String
- (f) OpenAPI: 17/17 (via `PneuFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/pneus` | `PageResponse<PneuResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/pneus/resumo` | `ResumoPneusResponse` | — |  | ✓ |
| GET | `/api/v1/frota/pneus/marcas` | `List<String>` | List |  | ✓ |
| GET | `/api/v1/frota/pneus/{id}` | `PneuResponse` | — |  | ✓ |
| POST | `/api/v1/frota/pneus` | `PneuResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/pneus/{id}` | `PneuResponse` | — |  | ✓ |
| GET | `/api/v1/frota/pneus/{id}/historico` | `List<EventoPneuResponse>` | List |  | ✓ |
| GET | `/api/v1/frota/pneus/eventos` | `PageResponse<EventoPneuResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/frota/pneus/{id}/envio` | `PneuResponse` | — |  | ✓ |
| POST | `/api/v1/frota/pneus/{id}/retorno` | `PneuResponse` | — |  | ✓ |
| POST | `/api/v1/frota/pneus/{id}/descarte` | `PneuResponse` | — |  | ✓ |
| POST | `/api/v1/frota/pneus/{id}/transferencia` | `PneuResponse` | — |  | ✓ |
| GET | `/api/v1/frota/pneus/veiculos/{idVeiculo}` | `VeiculoPneusResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/pneus/veiculos/{idVeiculo}/diagrama` | `VeiculoPneusResponse` | — |  | ✓ |
| POST | `/api/v1/frota/pneus/movimentacoes` | `VeiculoPneusResponse` | — |  | ✓ |
| GET | `/api/v1/frota/pneus/inspecoes` | `PageResponse<InspecaoPneuResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/frota/pneus/inspecoes` | `InspecaoPneuResponse` | — |  | ✓ |

#### PreventivaFrotaController

`modules/frota/infrastructure/web/PreventivaFrotaController.java` · base `/api/v1/frota/preventiva`

- (a) listagem: List ×2
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: detalhe `PlanoPreventivoResponse, PreventivaVeiculoResponse`; Request separado (PlanoPreventivoRequest, InformarRealizacaoPreventivaRequest, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 11/11 (via `PreventivaFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/preventiva/planos` | `List<PlanoPreventivoResponse>` | List |  | ✓ |
| GET | `/api/v1/frota/preventiva/planos/{id}` | `PlanoPreventivoResponse` | — |  | ✓ |
| POST | `/api/v1/frota/preventiva/planos` | `PlanoPreventivoResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/preventiva/planos/{id}` | `PlanoPreventivoResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/preventiva/planos/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/frota/preventiva/planos/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/frota/preventiva/acompanhamento` | `AcompanhamentoPreventivaResponse` | — | ✓ | ✓ |
| POST | `/api/v1/frota/preventiva/controles/{idControle}/realizacao` | `ControlePreventivoResponse` | — |  | ✓ |
| POST | `/api/v1/frota/preventiva/controles/abrir-os` | `OsPreventivaAbertaResponse` | — |  | ✓ |
| GET | `/api/v1/frota/preventiva/veiculos/{idVeiculo}` | `PreventivaVeiculoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/preventiva/corretivas` | `List<CorretivaPorItemResponse>` | List |  | ✓ |

#### RelatorioGerencialFrotaController

`modules/frota/infrastructure/web/RelatorioGerencialFrotaController.java` · base `/api/v1/frota/relatorios`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `RelatorioGerencialFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/relatorios/gerencial` | `RelatorioGerencialFrotaResponse` | — |  | ✓ |
| GET | `/api/v1/frota/relatorios/detalhe/custos` | `RelatorioFrotaDetalheResponse.Custos` | — |  | ✓ |
| GET | `/api/v1/frota/relatorios/detalhe/manutencao` | `RelatorioFrotaDetalheResponse.Manutencao` | — |  | ✓ |
| GET | `/api/v1/frota/relatorios/detalhe/combustivel` | `RelatorioFrotaDetalheResponse.Combustivel` | — |  | ✓ |
| GET | `/api/v1/frota/relatorios/detalhe/uso` | `RelatorioFrotaDetalheResponse.Uso` | — |  | ✓ |
| GET | `/api/v1/frota/relatorios/detalhe/conformidade` | `RelatorioFrotaDetalheResponse.Conformidade` | — |  | ✓ |

#### SeguradoraFrotaController

`modules/frota/infrastructure/web/SeguradoraFrotaController.java` · base `/api/v1/frota/seguradoras`

- (a) listagem: List ×1
- (b) ordenação: n/a
- (c) DTOs: só Request (SeguradoraFrotaRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 5/5 (via `SeguradoraFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/seguradoras` | `List<SeguradoraFrotaResponse>` | List |  | ✓ |
| POST | `/api/v1/frota/seguradoras` | `SeguradoraFrotaResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/seguradoras/{id}` | `SeguradoraFrotaResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/seguradoras/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/frota/seguradoras/{id}/ativar` | `Void` | — |  | ✓ |

#### SinistroFrotaController

`modules/frota/infrastructure/web/SinistroFrotaController.java` · base `/api/v1/frota/sinistros`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `SinistroResponse`); Request separado (SinistroRequest, AbrirReparoSinistroRequest, …)
- (d) /options: não
- (e) status nas listagens: situacao: enum cru; situacaoRotulo: String
- (f) OpenAPI: 12/12 (via `SinistroFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/sinistros` | `PageResponse<SinistroResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/sinistros/resumo` | `ResumoSinistrosResponse` | — |  | ✓ |
| GET | `/api/v1/frota/sinistros/{id}` | `SinistroResponse` | — |  | ✓ |
| POST | `/api/v1/frota/sinistros` | `SinistroResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/sinistros/{id}` | `SinistroResponse` | — |  | ✓ |
| POST | `/api/v1/frota/sinistros/{id}/ordem-servico` | `SinistroResponse` | — |  | ✓ |
| POST | `/api/v1/frota/sinistros/{id}/seguradora` | `SinistroResponse` | — |  | ✓ |
| POST | `/api/v1/frota/sinistros/{id}/finalizacao` | `SinistroResponse` | — |  | ✓ |
| POST | `/api/v1/frota/sinistros/{id}/cancelamento` | `SinistroResponse` | — |  | ✓ |
| POST | `/api/v1/frota/sinistros/{id}/anexos` | `SinistroResponse` | — |  | ✓ |
| GET | `/api/v1/frota/sinistros/{id}/anexos/{idAnexo}` | `Resource` | — |  | ✓ |
| DELETE | `/api/v1/frota/sinistros/{id}/anexos/{idAnexo}` | `SinistroResponse` | — |  | ✓ |

#### TelemetriaFrotaController

`modules/frota/infrastructure/web/TelemetriaFrotaController.java` · base `/api/v1/frota/telemetria`

- (a) listagem: PageResponse ×2
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `RastreadorResponse`); Request separado (VincularRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 15/15 (via `TelemetriaFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/telemetria/situacao` | `SituacaoResponse` | — |  | ✓ |
| POST | `/api/v1/frota/telemetria/sincronizacao` | `SituacaoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/telemetria/rastreadores` | `PageResponse<RastreadorResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/telemetria/rastreadores/{id}` | `RastreadorResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/telemetria/rastreadores/{id}/veiculo` | `RastreadorResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/telemetria/rastreadores/{id}/veiculo` | `RastreadorResponse` | — |  | ✓ |
| POST | `/api/v1/frota/telemetria/rastreadores/{id}/ignorar` | `RastreadorResponse` | — |  | ✓ |
| POST | `/api/v1/frota/telemetria/rastreadores/{id}/reativar` | `RastreadorResponse` | — |  | ✓ |
| GET | `/api/v1/frota/telemetria/eventos` | `PageResponse<EventoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/telemetria/eventos/{id}` | `EventoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/telemetria/saude` | `SaudeResponse` | — |  | ✓ |
| GET | `/api/v1/frota/telemetria/mapa` | `MapaResponse` | — |  | ✓ |
| GET | `/api/v1/frota/telemetria/veiculos/{idVeiculo}` | `VeiculoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/telemetria/veiculos/{idVeiculo}/trajeto` | `TrajetoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/telemetria/abastecimentos/{idAbastecimento}/consumo` | `ConsumoAbastecimentoResponse` | — |  | ✓ |

#### TipoDespesaFrotaController

`modules/frota/infrastructure/web/TipoDespesaFrotaController.java` · base `/api/v1/frota/despesas/tipos`

- (a) listagem: List ×1
- (b) ordenação: n/a
- (c) DTOs: só Request (TipoDespesaRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 5/5 (via `TipoDespesaFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/despesas/tipos` | `List<TipoDespesaResponse>` | List |  | ✓ |
| POST | `/api/v1/frota/despesas/tipos` | `TipoDespesaResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/despesas/tipos/{id}` | `TipoDespesaResponse` | — |  | ✓ |
| DELETE | `/api/v1/frota/despesas/tipos/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/frota/despesas/tipos/{id}/ativar` | `Void` | — |  | ✓ |

#### VeiculoAppFrotaController

`modules/frota/infrastructure/web/VeiculoAppFrotaController.java` · base `/api/v1/frota/app/veiculos`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 2/2 (via `VeiculoAppFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/app/veiculos/{idVeiculo}/situacao` | `SituacaoVeiculoAppResponse` | — |  | ✓ |
| GET | `/api/v1/frota/app/veiculos/{idVeiculo}/documentos/{idDocumento}/arquivo` | `org.springframework.core.io.Resource` | — |  | ✓ |

#### VeiculoFrotaController

`modules/frota/infrastructure/web/VeiculoFrotaController.java` · base `/api/v1/frota/veiculos`

- (a) listagem: PageResponse ×3, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem ≠ detalhe (VeiculoFrotaResumoResponse / VeiculoFrotaDetalheResponse); Request separado (VeiculoFrotaRequest, VincularCondutorRequest, …)
- (d) /options: não
- (e) status nas listagens: situacao: enum cru; motivoSituacao: String
- (f) OpenAPI: 12/12 (via `VeiculoFrotaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/frota/veiculos` | `PageResponse<VeiculoFrotaResumoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/frota/veiculos/{idVeiculo}` | `VeiculoFrotaDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/frota/veiculos` | `VeiculoFrotaDetalheResponse` | — |  | ✓ |
| PUT | `/api/v1/frota/veiculos/{idVeiculo}` | `VeiculoFrotaDetalheResponse` | — |  | ✓ |
| GET | `/api/v1/frota/veiculos/{idVeiculo}/uso` | `UsoVeiculoResponse` | — |  | ✓ |
| GET | `/api/v1/frota/veiculos/{idVeiculo}/condutores` | `PageResponse<VinculoCondutorResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/frota/veiculos/{idVeiculo}/condutores` | `VinculoCondutorResponse` | — |  | ✓ |
| GET | `/api/v1/frota/veiculos/{idVeiculo}/condutor-em` | `VinculoCondutorResponse` | — |  | ✓ |
| GET | `/api/v1/frota/veiculos/{idVeiculo}/implementos` | `List<AcoplamentoImplementoResponse>` | List |  | ✓ |
| GET | `/api/v1/frota/veiculos/{idVeiculo}/odometro` | `PageResponse<LeituraOdometroResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/frota/veiculos/{idVeiculo}/odometro` | `LeituraOdometroResponse` | — |  | ✓ |
| POST | `/api/v1/frota/veiculos/{idVeiculo}/odometro/troca-painel` | `LeituraOdometroResponse` | — |  | ✓ |

### Módulo `iam`

#### AuditController

`modules/iam/infrastructure/web/AuditController.java` · base `/api/v1/auditoria`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: detalhe `HistoricoRegistroResponse`
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 1/1 (via `AuditControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/auditoria/{registroId}` | `HistoricoRegistroResponse` | — |  | ✓ |

#### AuthController

`modules/iam/infrastructure/web/AuthController.java` · base `/api/v1/auth`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: só Request (LoginRequest, AlterarSenhaRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 4/4 (via `AuthControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/login` | `TokenResponse` | — |  | ✓ |
| POST | `/api/v1/auth/refresh` | `TokenResponse` | — |  | ✓ |
| POST | `/api/v1/auth/logout` | `Void` | — |  | ✓ |
| POST | `/api/v1/auth/alterar-senha` | `Void` | — |  | ✓ |

#### PerfilAcessoController

`modules/iam/infrastructure/web/PerfilAcessoController.java` · base `/api/v1/iam/perfis`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `PerfilAcessoResponse`); Request separado (PerfilAcessoRequest, PermissoesPerfilRequest, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 13/13 (via `PerfilAcessoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/iam/perfis` | `PerfilAcessoResponse` | — |  | ✓ |
| PUT | `/api/v1/iam/perfis/{id}` | `PerfilAcessoResponse` | — |  | ✓ |
| PUT | `/api/v1/iam/perfis/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/iam/perfis/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/iam/perfis/{id}` | `PerfilAcessoResponse` | — |  | ✓ |
| GET | `/api/v1/iam/perfis` | `PageResponse<PerfilAcessoResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/iam/perfis/{id}/permissoes/{idPermissao}` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/iam/perfis/{id}/permissoes/{idPermissao}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/iam/perfis/{id}/permissoes` | `List<PermissaoResponse>` | — |  | ✓ |
| GET | `/api/v1/iam/perfis/{id}/permissoes` | `List<PermissaoResponse>` | List |  | ✓ |
| POST | `/api/v1/iam/perfis/importar` | `ImportacaoPerfilAcessoResponse` | — |  | ✓ |
| POST | `/api/v1/iam/perfis/importar/confirmar` | `ImportacaoPerfilAcessoResponse` | — |  | ✓ |
| GET | `/api/v1/iam/perfis/importar/modelo` | `byte[]` | — |  | ✓ |

#### PermissaoController

`modules/iam/infrastructure/web/PermissaoController.java` · base `/api/v1/iam/permissoes`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `PermissaoResponse`); Request separado (PermissaoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 5/5 (via `PermissaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/iam/permissoes` | `PermissaoResponse` | — |  | ✓ |
| PUT | `/api/v1/iam/permissoes/{id}` | `PermissaoResponse` | — |  | ✓ |
| PATCH | `/api/v1/iam/permissoes/{id}/status` | `Void` | — |  | ✓ |
| GET | `/api/v1/iam/permissoes/{id}` | `PermissaoResponse` | — |  | ✓ |
| GET | `/api/v1/iam/permissoes` | `PageResponse<PermissaoResponse>` | PageResponse | ✓ | ✓ |

#### UsuarioController

`modules/iam/infrastructure/web/UsuarioController.java` · base `/api/v1/iam/usuarios`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `UsuarioResponse`); Request separado (UsuarioRequest, ConfirmarImportacaoUsuarioRequest, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 15/15 (via `UsuarioControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/iam/usuarios` | `UsuarioResponse` | — |  | ✓ |
| POST | `/api/v1/iam/usuarios/importar` | `ImportacaoUsuarioResponse` | — |  | ✓ |
| POST | `/api/v1/iam/usuarios/confirmar-importacao` | `ImportacaoUsuarioResponse` | — |  | ✓ |
| GET | `/api/v1/iam/usuarios/importar/modelo` | `byte[]` | — |  | ✓ |
| PUT | `/api/v1/iam/usuarios/{id}` | `UsuarioResponse` | — |  | ✓ |
| PUT | `/api/v1/iam/usuarios/{id}/colaborador` | `UsuarioResponse` | — |  | ✓ |
| PUT | `/api/v1/iam/usuarios/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/iam/usuarios/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/iam/usuarios/{id}` | `UsuarioResponse` | — |  | ✓ |
| GET | `/api/v1/iam/usuarios` | `PageResponse<UsuarioResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/iam/usuarios/me` | `UsuarioResponse` | — |  | ✓ |
| GET | `/api/v1/iam/usuarios/me/favoritos` | `List<FavoritoResponse>` | List |  | ✓ |
| POST | `/api/v1/iam/usuarios/me/favoritos` | `FavoritoResponse` | — |  | ✓ |
| DELETE | `/api/v1/iam/usuarios/me/favoritos/{id}` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/iam/usuarios/me/preferencias` | `Void` | — |  | ✓ |

### Módulo `lookup`

#### LookupController

`modules/lookup/infrastructure/web/LookupController.java` · base `/api/lookups`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 1/1 (via `LookupControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/lookups/bootstrap` | `LookupBootstrapDto` | — |  | ✓ |

### Módulo `mencao`

#### MencaoController

`modules/mencao/infrastructure/web/MencaoController.java` · base `/api/v1/mencoes`

- (a) listagem: List ×1
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 1/1 (via `MencaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/mencoes/usuarios` | `List<UsuarioMencionavel>` | List |  | ✓ |

### Módulo `notificacao`

#### ComunicadoController

`modules/notificacao/infrastructure/web/ComunicadoController.java` · base `/api/v1/comunicados`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `ComunicadoResponse`); Request separado (ComunicadoRequest, CorrigirTextoComunicadoRequest, …)
- (d) /options: não
- (e) status nas listagens: status: enum cru; statusRotulo: String; prioridadeNotificacao: enum cru
- (f) OpenAPI: 12/12 (via `ComunicadoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/comunicados` | `PageResponse<ComunicadoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/comunicados/{id}` | `ComunicadoResponse` | — |  | ✓ |
| POST | `/api/v1/comunicados` | `ComunicadoResponse` | — |  | ✓ |
| PUT | `/api/v1/comunicados/{id}` | `ComunicadoResponse` | — |  | ✓ |
| PATCH | `/api/v1/comunicados/{id}/texto` | `ComunicadoResponse` | — |  | ✓ |
| POST | `/api/v1/comunicados/{id}/publicacao` | `ComunicadoResponse` | — |  | ✓ |
| PATCH | `/api/v1/comunicados/{id}/arquivamento` | `ComunicadoResponse` | — |  | ✓ |
| DELETE | `/api/v1/comunicados/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/comunicados/{id}/confirmacoes` | `RelatorioConfirmacaoResponse` | — |  | ✓ |
| POST | `/api/v1/comunicados/{id}/anexos` | `AnexoComunicadoResponse` | — |  | ✓ |
| GET | `/api/v1/comunicados/{id}/anexos/{idAnexo}` | `Resource` | — |  | ✓ |
| DELETE | `/api/v1/comunicados/{id}/anexos/{idAnexo}` | `Void` | — |  | ✓ |

#### MuralController

`modules/notificacao/infrastructure/web/MuralController.java` · base `/api/v1/mural`

- (a) listagem: List ×1
- (b) ordenação: n/a
- (c) DTOs: detalhe `Resource`
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `MuralControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/mural` | `List<ComunicadoMuralResponse>` | List |  | ✓ |
| PATCH | `/api/v1/mural/{id}/visualizacao` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/mural/{id}` | `Void` | — |  | ✓ |
| POST | `/api/v1/mural/{id}/adiamento` | `Void` | — |  | ✓ |
| POST | `/api/v1/mural/{id}/confirmacao` | `Void` | — |  | ✓ |
| GET | `/api/v1/mural/{id}/anexos/{idAnexo}` | `Resource` | — |  | ✓ |

#### NotificacaoController

`modules/notificacao/infrastructure/web/NotificacaoController.java` · base `/api/v1/notificacoes`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem `NotificacaoResponse`
- (d) /options: não
- (e) status nas listagens: prioridade: enum cru; prioridadeRotulo: String
- (f) OpenAPI: 7/7 (via `NotificacaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/notificacoes` | `PageResponse<NotificacaoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/notificacoes/resumo` | `ResumoNotificacoesResponse` | — |  | ✓ |
| PATCH | `/api/v1/notificacoes/{id}/leitura` | `NotificacaoResponse` | — |  | ✓ |
| DELETE | `/api/v1/notificacoes/{id}/leitura` | `NotificacaoResponse` | — |  | ✓ |
| PATCH | `/api/v1/notificacoes/leitura` | `ResumoNotificacoesResponse` | — |  | ✓ |
| DELETE | `/api/v1/notificacoes/{id}` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/notificacoes/lidas` | `ResumoNotificacoesResponse` | — |  | ✓ |

#### PoliticaObservabilidadeController

`modules/notificacao/infrastructure/web/PoliticaObservabilidadeController.java` · base `/api/internal/observability/notification-policy`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 1/1 (via `PoliticaObservabilidadeControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/internal/observability/notification-policy` | `PoliticaObservabilidadeResponse` | — |  | ✓ |

#### PoliticaRoteamentoController

`modules/notificacao/infrastructure/web/PoliticaRoteamentoController.java` · base `/api/v1/notificacoes/politicas-roteamento`

- (a) listagem: List ×1
- (b) ordenação: n/a
- (c) DTOs: detalhe `PoliticaRoteamentoResponse`; Request separado (PoliticaRoteamentoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `PoliticaRoteamentoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/notificacoes/politicas-roteamento` | `List<PoliticaRoteamentoResponse>` | List |  | ✓ |
| GET | `/api/v1/notificacoes/politicas-roteamento/{id}` | `PoliticaRoteamentoResponse` | — |  | ✓ |
| POST | `/api/v1/notificacoes/politicas-roteamento` | `PoliticaRoteamentoResponse` | — |  | ✓ |
| PUT | `/api/v1/notificacoes/politicas-roteamento/{id}` | `PoliticaRoteamentoResponse` | — |  | ✓ |
| PATCH | `/api/v1/notificacoes/politicas-roteamento/{id}/ativacao` | `PoliticaRoteamentoResponse` | — |  | ✓ |
| PATCH | `/api/v1/notificacoes/politicas-roteamento/{id}/desativacao` | `PoliticaRoteamentoResponse` | — |  | ✓ |

#### PreferenciaNotificacaoController

`modules/notificacao/infrastructure/web/PreferenciaNotificacaoController.java` · base `/api/v1/notificacoes/preferencias`

- (a) listagem: List ×1
- (b) ordenação: n/a
- (c) DTOs: só Request (PreferenciasNotificacaoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 2/2 (via `PreferenciaNotificacaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/notificacoes/preferencias` | `List<PreferenciaNotificacaoResponse>` | List |  | ✓ |
| PUT | `/api/v1/notificacoes/preferencias` | `List<PreferenciaNotificacaoResponse>` | — |  | ✓ |

#### RegraNotificacaoController

`modules/notificacao/infrastructure/web/RegraNotificacaoController.java` · base `/api/v1/notificacoes/regras`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `RegraNotificacaoResponse`); Request separado (RegraNotificacaoRequest)
- (d) /options: não
- (e) status nas listagens: prioridade: enum cru
- (f) OpenAPI: 8/8 (via `RegraNotificacaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/notificacoes/regras/gatilhos` | `List<GatilhoResponse>` | List |  | ✓ |
| GET | `/api/v1/notificacoes/regras` | `PageResponse<RegraNotificacaoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/notificacoes/regras/{id}` | `RegraNotificacaoResponse` | — |  | ✓ |
| POST | `/api/v1/notificacoes/regras` | `RegraNotificacaoResponse` | — |  | ✓ |
| PUT | `/api/v1/notificacoes/regras/{id}` | `RegraNotificacaoResponse` | — |  | ✓ |
| PATCH | `/api/v1/notificacoes/regras/{id}/ativacao` | `RegraNotificacaoResponse` | — |  | ✓ |
| PATCH | `/api/v1/notificacoes/regras/{id}/desativacao` | `RegraNotificacaoResponse` | — |  | ✓ |
| DELETE | `/api/v1/notificacoes/regras/{id}` | `Void` | — |  | ✓ |

### Módulo `obras`

#### AgenteResponsavelController

`modules/obras/infrastructure/web/AgenteResponsavelController.java` · base `/api/v1/obras/agentes`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `AgenteResponsavelResponse`); Request separado (AgenteResponsavelRequest)
- (d) /options: equivalente (`/todos-ativos`)
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `AgenteResponsavelControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/obras/agentes` | `AgenteResponsavelResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/agentes/{id}` | `AgenteResponsavelResponse` | — |  | ✓ |
| GET | `/api/v1/obras/agentes/{id}` | `AgenteResponsavelResponse` | — |  | ✓ |
| GET | `/api/v1/obras/agentes` | `PageResponse<AgenteResponsavelResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/obras/agentes/todos-ativos` | `List<AgenteResponsavelResponse>` | List |  | ✓ |
| DELETE | `/api/v1/obras/agentes/{id}` | `Void` | — |  | ✓ |

#### BookObraController

`modules/obras/infrastructure/web/BookObraController.java` · base `/api/v1/obras`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 3/3 (via `BookObraControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/obras/{id}/documentacao/painel` | `BookObraResponses.Painel` | — |  | ✓ |
| GET | `/api/v1/obras/{id}/documentacao/comparativo` | `BookObraResponses.Comparativo` | — |  | ✓ |
| GET | `/api/v1/obras/book/consolidado` | `BookObraResponses.Consolidado` | — |  | ✓ |

#### CarteiraObraController

`modules/obras/infrastructure/web/CarteiraObraController.java` · base `/api/v1/obras`

- (a) listagem: List ×2
- (b) ordenação: n/a
- (c) DTOs: só Request (CarteiraObraRequest, StatusOperacionalObraRequest)
- (d) /options: não
- (e) status nas listagens: statusAnteriorId: UUID; statusAnteriorNome: String; statusNovoId: UUID; statusNovoNome: String; statusNome: String
- (f) OpenAPI: 8/8 (via `CarteiraObraControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/obras/{id}/carteira` | `CarteiraObraResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/{id}/carteira` | `CarteiraObraResponse` | — |  | ✓ |
| POST | `/api/v1/obras/{id}/status-operacional` | `CarteiraObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/{id}/historico-status` | `List<HistoricoStatusObraResponse>` | List |  | ✓ |
| POST | `/api/v1/obras/{id}/deslocamento/recalcular` | `CarteiraObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/{id}/orcamento` | `OrcamentoObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/{id}/proximas` | `List<ObraProximaResponse>` | List |  | ✓ |
| GET | `/api/v1/obras/indicadores` | `IndicadoresCarteiraResponse` | — |  | ✓ |

#### DocumentacaoTecnicaController

`modules/obras/infrastructure/web/DocumentacaoTecnicaController.java` · base `/api/v1/obras/{id}/documentacao`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: só Request (DocumentacaoTecnicaRequests.Visita, DocumentacaoTecnicaRequests.Ficha)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 21/21 (via `DocumentacaoTecnicaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/obras/{id}/documentacao` | `DocumentacaoTecnicaResponses.Documentacao` | — |  | ✓ |
| POST | `/api/v1/obras/{id}/documentacao/visitas` | `DocumentacaoTecnicaResponses.Visita` | — |  | ✓ |
| PUT | `/api/v1/obras/{id}/documentacao/visitas/{idVisita}` | `DocumentacaoTecnicaResponses.Visita` | — |  | ✓ |
| DELETE | `/api/v1/obras/{id}/documentacao/visitas/{idVisita}` | `Void` | — |  | ✓ |
| GET | `/api/v1/obras/{id}/documentacao/visitas/{idVisita}/pdf` | `byte[]` | — |  | ✓ |
| PUT | `/api/v1/obras/{id}/documentacao/fichas/{idPonto}` | `Void` | — |  | ✓ |
| POST | `/api/v1/obras/{id}/documentacao/as-built` | `DocumentacaoTecnicaResponses.Documento` | — |  | ✓ |
| POST | `/api/v1/obras/{id}/documentacao/pontos/{idPonto}/evidencias` | `UUID` | — |  | ✓ |
| PUT | `/api/v1/obras/{id}/documentacao/evidencias/{idEvidencia}/etapa` | `Void` | — |  | ✓ |
| POST | `/api/v1/obras/{id}/documentacao/book` | `DocumentacaoTecnicaResponses.Documento` | — |  | ✓ |
| POST | `/api/v1/obras/{id}/documentacao/visitas/{idVisita}/evidencias` | `DocumentacaoTecnicaResponses.EvidenciaVisita` | — |  | ✓ |
| PUT | `/api/v1/obras/{id}/documentacao/visitas/{idVisita}/evidencias/{idEvidencia}/legenda` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/obras/{id}/documentacao/visitas/{idVisita}/evidencias/{idEvidencia}` | `Void` | — |  | ✓ |
| GET | `/api/v1/obras/{id}/documentacao/visitas/{idVisita}/evidencias/{idEvidencia}/arquivo` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/obras/{id}/documentacao/visitas/{idVisita}/evidencias/{idEvidencia}/miniatura` | `StreamingResponseBody` | — |  | ✓ |
| PUT | `/api/v1/obras/{id}/documentacao/evidencias/{idEvidencia}/legenda` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/obras/{id}/documentacao/evidencias/{idEvidencia}` | `Void` | — |  | ✓ |
| GET | `/api/v1/obras/{id}/documentacao/evidencias/{idEvidencia}/arquivo` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/obras/{id}/documentacao/evidencias/{idEvidencia}/miniatura` | `StreamingResponseBody` | — |  | ✓ |
| PUT | `/api/v1/obras/{id}/documentacao/equipamentos/{idPonto}` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/obras/{id}/documentacao/equipamentos/{idPonto}` | `Void` | — |  | ✓ |

#### ImportacaoObraController

`modules/obras/infrastructure/web/ImportacaoObraController.java` · base `/api/v1/obras/importacoes`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `HistoricoImportacaoResponse`); Request separado (ConfirmarImportacaoPlanilhaRequest<CarteiraImportacaoLinha>, ConfirmarImportacaoPlanilhaRequest<OrcamentoImportacaoLinha>)
- (d) /options: não
- (e) status nas listagens: status: Status
- (f) OpenAPI: 10/10 (via `ImportacaoObraControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/obras/importacoes` | `PageResponse<HistoricoImportacaoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/obras/importacoes/{id}` | `HistoricoImportacaoResponse` | — |  | ✓ |
| POST | `/api/v1/obras/importacoes/carteira/validacao` | `PreviaImportacaoObraResponse<CarteiraImportacaoLinha>` | — |  | ✓ |
| POST | `/api/v1/obras/importacoes/carteira/revalidacao` | `PreviaImportacaoObraResponse<CarteiraImportacaoLinha>` | — |  | ✓ |
| POST | `/api/v1/obras/importacoes/carteira/confirmacao` | `PreviaImportacaoObraResponse<CarteiraImportacaoLinha>` | — |  | ✓ |
| GET | `/api/v1/obras/importacoes/carteira/modelo` | `byte[]` | — |  | ✓ |
| POST | `/api/v1/obras/importacoes/orcamento/validacao` | `PreviaImportacaoObraResponse<OrcamentoImportacaoLinha>` | — |  | ✓ |
| POST | `/api/v1/obras/importacoes/orcamento/revalidacao` | `PreviaImportacaoObraResponse<OrcamentoImportacaoLinha>` | — |  | ✓ |
| POST | `/api/v1/obras/importacoes/orcamento/confirmacao` | `PreviaImportacaoObraResponse<OrcamentoImportacaoLinha>` | — |  | ✓ |
| GET | `/api/v1/obras/importacoes/orcamento/modelo` | `byte[]` | — |  | ✓ |

#### KitConstrutivoController

`modules/obras/infrastructure/web/KitConstrutivoController.java` · base `/api/v1/obras/kits`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `KitConstrutivoResponse`); Request separado (KitConstrutivoRequest, ConfirmarImportacaoPlanilhaRequest<KitImportacaoLinha>)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 10/10 (via `KitConstrutivoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/obras/kits` | `KitConstrutivoResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/kits/{id}` | `KitConstrutivoResponse` | — |  | ✓ |
| GET | `/api/v1/obras/kits/{id}` | `KitConstrutivoResponse` | — |  | ✓ |
| GET | `/api/v1/obras/kits` | `PageResponse<KitConstrutivoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/obras/kits/grupos` | `List<String>` | List |  | ✓ |
| DELETE | `/api/v1/obras/kits/{id}` | `Void` | — |  | ✓ |
| POST | `/api/v1/obras/kits/importacoes/validacao` | `PreviaImportacaoObraResponse<KitImportacaoLinha>` | — |  | ✓ |
| POST | `/api/v1/obras/kits/importacoes/revalidacao` | `PreviaImportacaoObraResponse<KitImportacaoLinha>` | — |  | ✓ |
| POST | `/api/v1/obras/kits/importacoes/confirmacao` | `PreviaImportacaoObraResponse<KitImportacaoLinha>` | — |  | ✓ |
| GET | `/api/v1/obras/kits/importacoes/modelo` | `byte[]` | — |  | ✓ |

#### MedicaoObraController

`modules/obras/infrastructure/web/MedicaoObraController.java` · base `/api/v1/obras`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem ≠ detalhe (MedicaoResponses.MedicaoResumo / MedicaoResponses.MedicaoDetalhe); Request separado (MedicaoRequests.Gerar, MedicaoRequests.Estornar, …)
- (d) /options: equivalente (`/opcoes`)
- (e) status nas listagens: —
- (f) OpenAPI: 16/16 (via `MedicaoObraControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/obras/pre-fechamento` | `MedicaoResponses.PreFechamento` | — |  | ✓ |
| POST | `/api/v1/obras/{idObra}/levantamento/conclusao` | `MedicaoResponses.LinhaPreFechamento` | — |  | ✓ |
| POST | `/api/v1/obras/{idObra}/levantamento/reabertura` | `MedicaoResponses.LinhaPreFechamento` | — |  | ✓ |
| GET | `/api/v1/obras/medicoes/a-medir` | `List<MedicaoResponses.ObraAMedir>` | List |  | ✓ |
| GET | `/api/v1/obras/{idObra}/medicao` | `MedicaoResponses.MedicaoDaObra` | — |  | ✓ |
| GET | `/api/v1/obras/{idObra}/medicao/ciclo` | `MedicaoResponses.Ciclo` | — |  | ✓ |
| POST | `/api/v1/obras/{idObra}/medicoes` | `MedicaoResponses.MedicaoDetalhe` | — |  | ✓ |
| GET | `/api/v1/obras/medicoes` | `PageResponse<MedicaoResponses.MedicaoResumo>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/obras/medicoes/opcoes` | `MedicaoResponses.OpcoesMedicoes` | — |  | ✓ |
| GET | `/api/v1/obras/medicoes/{id}` | `MedicaoResponses.MedicaoDetalhe` | — |  | ✓ |
| POST | `/api/v1/obras/medicoes/{id}/estorno` | `MedicaoResponses.MedicaoDetalhe` | — |  | ✓ |
| POST | `/api/v1/obras/fechamento` | `MedicaoResponses.Fechamento` | — |  | ✓ |
| POST | `/api/v1/obras/fechamento/exportacao` | `byte[]` | — |  | ✓ |
| GET | `/api/v1/obras/medicoes/relatorio-detalhado/modelo` | `byte[]` | — |  | ✓ |
| POST | `/api/v1/obras/medicoes/relatorio-detalhado/analise` | `MedicaoResponses.AnaliseOrcadoFaturado` | — |  | ✓ |
| POST | `/api/v1/obras/medicoes/relatorio-detalhado` | `byte[]` | — |  | ✓ |

#### ModeloChecklistObraController

`modules/obras/infrastructure/web/ModeloChecklistObraController.java` · base `/api/v1/obras/checklists`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `ModeloChecklistObraResponse`); Request separado (ModeloChecklistObraRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 7/7 (via `ModeloChecklistObraControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/obras/checklists` | `ModeloChecklistObraResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/checklists/{id}` | `ModeloChecklistObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/checklists/{id}` | `ModeloChecklistObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/checklists` | `PageResponse<ModeloChecklistObraResponse>` | PageResponse | ✓ | ✓ |
| POST | `/api/v1/obras/checklists/{id}/duplicacao` | `ModeloChecklistObraResponse` | — |  | ✓ |
| DELETE | `/api/v1/obras/checklists/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/obras/checklists/{id}/ativar` | `Void` | — |  | ✓ |

#### ObraController

`modules/obras/infrastructure/web/ObraController.java` · base `/api/v1/obras`

- (a) listagem: PageResponse ×1, List ×2
- (b) ordenação: mapeamento parcial (ObraSpecification)
- (c) DTOs: listagem ≠ detalhe (ObraResumoResponse / ObraResponse); Request separado (ObraRequest, VinculoProjetoRequest, …)
- (d) /options: não
- (e) status nas listagens: statusId: UUID; statusNome: String; statusConcluida: boolean
- (f) OpenAPI: 20/20 (via `ObraControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/obras` | `ObraResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/{id}` | `ObraResponse` | — |  | ✓ |
| PATCH | `/api/v1/obras/{id}/status` | `ObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/{id}` | `ObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras` | `PageResponse<ObraResumoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/obras/{id}/projetos-relacionados` | `List<ProjetoRelacionadoResponse>` | List |  | ✓ |
| POST | `/api/v1/obras/{id}/projetos-relacionados` | `ProjetoRelacionadoResponse` | — |  | ✓ |
| DELETE | `/api/v1/obras/{id}/projetos-relacionados/{idProjetoRelacionado}` | `Void` | — |  | ✓ |
| POST | `/api/v1/obras/{id}/subprojetos` | `ObraResponse` | — |  | ✓ |
| DELETE | `/api/v1/obras/{id}/subprojetos/{idFilho}` | `ObraResponse` | — |  | ✓ |
| DELETE | `/api/v1/obras/{id}` | `Void` | — |  | ✓ |
| POST | `/api/v1/obras/{id}/anexos` | `AnexoObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/{id}/anexos` | `List<AnexoObraResponse>` | List |  | ✓ |
| GET | `/api/v1/obras/{id}/anexos/{idAnexo}/download` | `StreamingResponseBody` | — |  | ✓ |
| DELETE | `/api/v1/obras/{id}/anexos/{idAnexo}` | `Void` | — |  | ✓ |
| POST | `/api/v1/obras/importar/validar` | `ImportacaoObraResponse` | — |  | ✓ |
| POST | `/api/v1/obras/importar/confirmar` | `ImportacaoObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/importar/modelo` | `byte[]` | — |  | ✓ |
| GET | `/api/v1/obras/exportar/resumo` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/obras/exportar/detalhado` | `StreamingResponseBody` | — |  | ✓ |

#### PlanejamentoObraController

`modules/obras/infrastructure/web/PlanejamentoObraController.java` · base `/api/v1/obras/{idObra}/planejamento`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: detalhe `PlanejamentoObraRequests.AnaliseResponse`; Request separado (PlanejamentoObraRequests.DefinirProjetoMestre, PlanejamentoObraRequests.GirarPagina, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 24/24 (via `PlanejamentoObraControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/obras/{idObra}/planejamento` | `PlanejamentoObraResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/{idObra}/planejamento/projeto-mestre` | `PlanejamentoObraResponse` | — |  | ✓ |
| POST | `/api/v1/obras/{idObra}/planejamento/projeto-mestre` | `PlanejamentoObraResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/{idObra}/planejamento/paginas/{pagina}/rotacao` | `PlanejamentoObraResponse` | — |  | ✓ |
| POST | `/api/v1/obras/{idObra}/planejamento/pontos` | `PlanejamentoObraResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/{idObra}/planejamento/pontos/{idPonto}` | `PlanejamentoObraResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/{idObra}/planejamento/pontos/{idPonto}/posicao` | `PlanejamentoObraResponse.Ponto` | — |  | ✓ |
| DELETE | `/api/v1/obras/{idObra}/planejamento/pontos/{idPonto}` | `PlanejamentoObraResponse` | — |  | ✓ |
| POST | `/api/v1/obras/{idObra}/planejamento/vaos` | `PlanejamentoObraResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/{idObra}/planejamento/vaos/{idVao}` | `PlanejamentoObraResponse` | — |  | ✓ |
| DELETE | `/api/v1/obras/{idObra}/planejamento/vaos/{idVao}` | `PlanejamentoObraResponse` | — |  | ✓ |
| POST | `/api/v1/obras/{idObra}/planejamento/kits` | `PlanejamentoObraRequests.ResultadoAplicacaoKit` | — |  | ✓ |
| PUT | `/api/v1/obras/{idObra}/planejamento/kits/{idKitAplicado}/quantidade` | `PlanejamentoObraResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/{idObra}/planejamento/kits/{idKitAplicado}/executado-antes` | `PlanejamentoObraResponse` | — |  | ✓ |
| DELETE | `/api/v1/obras/{idObra}/planejamento/kits/{idKitAplicado}` | `PlanejamentoObraResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/{idObra}/planejamento/kits/{idKitAplicado}/itens/{idItem}` | `PlanejamentoObraResponse` | — |  | ✓ |
| DELETE | `/api/v1/obras/{idObra}/planejamento/kits/{idKitAplicado}/itens/{idItem}` | `PlanejamentoObraResponse` | — |  | ✓ |
| POST | `/api/v1/obras/{idObra}/planejamento/anotacoes` | `PlanejamentoObraResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/{idObra}/planejamento/anotacoes/{idAnotacao}` | `PlanejamentoObraResponse` | — |  | ✓ |
| DELETE | `/api/v1/obras/{idObra}/planejamento/anotacoes/{idAnotacao}` | `PlanejamentoObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/{idObra}/planejamento/analises/disponibilidade` | `PlanejamentoObraRequests.DisponibilidadeAnalise` | — | m | ✓ |
| POST | `/api/v1/obras/{idObra}/planejamento/analises` | `PlanejamentoObraRequests.AnaliseResponse` | — |  | ✓ |
| GET | `/api/v1/obras/{idObra}/planejamento/analises/{idAnalise}` | `PlanejamentoObraRequests.AnaliseResponse` | — |  | ✓ |
| POST | `/api/v1/obras/{idObra}/planejamento/analises/{idAnalise}/aceite` | `PlanejamentoObraResponse` | — |  | ✓ |

#### ProgramacaoObraController

`modules/obras/infrastructure/web/ProgramacaoObraController.java` · base `/api/v1/obras`

- (a) listagem: PageResponse ×1, List ×3
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem ≠ detalhe (ProgramacaoResponses.Evento / ProgramacaoResponses.ProgramacaoDetalhe); Request separado (ProgramacaoRequests.Previa, ProgramacaoRequests.Programar, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 14/14 (via `ProgramacaoObraControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/obras/{idObra}/programacoes/previa` | `ProgramacaoResponses.Previa` | — |  | ✓ |
| POST | `/api/v1/obras/{idObra}/programacoes` | `ProgramacaoResponses.Resultado` | — |  | ✓ |
| GET | `/api/v1/obras/{idObra}/programacoes` | `List<ProgramacaoResponses.ProgramacaoDetalhe>` | List |  | ✓ |
| GET | `/api/v1/obras/programacoes/gantt` | `ProgramacaoResponses.Gantt` | — |  | ✓ |
| GET | `/api/v1/obras/programacoes/historico` | `PageResponse<ProgramacaoResponses.Evento>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/obras/programacoes/painel` | `ProgramacaoResponses.Painel` | — |  | ✓ |
| GET | `/api/v1/obras/programacoes/a-programar` | `List<ProgramacaoResponses.ObraAProgramar>` | List |  | ✓ |
| GET | `/api/v1/obras/planejamento/resumos` | `List<ProgramacaoResponses.ResumoPlanejamento>` | List |  | ✓ |
| GET | `/api/v1/obras/programacoes/{id}` | `ProgramacaoResponses.ProgramacaoDetalhe` | — |  | ✓ |
| PUT | `/api/v1/obras/programacoes/{id}` | `ProgramacaoResponses.ProgramacaoDetalhe` | — |  | ✓ |
| POST | `/api/v1/obras/programacoes/{id}/reprogramacao` | `ProgramacaoResponses.ProgramacaoDetalhe` | — |  | ✓ |
| POST | `/api/v1/obras/programacoes/{id}/cancelamento` | `ProgramacaoResponses.ProgramacaoDetalhe` | — |  | ✓ |
| POST | `/api/v1/obras/programacoes/{id}/exclusao` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/obras/programacoes/{id}/itens/{idItem}` | `ProgramacaoResponses.ProgramacaoDetalhe` | — |  | ✓ |

#### StatusObraController

`modules/obras/infrastructure/web/StatusObraController.java` · base `/api/v1/obras/status`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `StatusObraResponse`); Request separado (StatusObraRequest)
- (d) /options: equivalente (`/todos-ativos`)
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `StatusObraControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/obras/status` | `StatusObraResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/status/{id}` | `StatusObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/status/{id}` | `StatusObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/status` | `PageResponse<StatusObraResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/obras/status/todos-ativos` | `List<StatusObraResponse>` | List |  | ✓ |
| DELETE | `/api/v1/obras/status/{id}` | `Void` | — |  | ✓ |

#### TipoAnexoObraController

`modules/obras/infrastructure/web/TipoAnexoObraController.java` · base `/api/v1/obras/tipos-anexos`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `TipoAnexoObraResponse`); Request separado (TipoAnexoObraRequest)
- (d) /options: equivalente (`/todos-ativos`)
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `TipoAnexoObraControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/obras/tipos-anexos` | `TipoAnexoObraResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/tipos-anexos/{id}` | `TipoAnexoObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/tipos-anexos/{id}` | `TipoAnexoObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/tipos-anexos` | `PageResponse<TipoAnexoObraResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/obras/tipos-anexos/todos-ativos` | `List<TipoAnexoObraResponse>` | List |  | ✓ |
| DELETE | `/api/v1/obras/tipos-anexos/{id}` | `Void` | — |  | ✓ |

#### TipoDeObraController

`modules/obras/infrastructure/web/TipoDeObraController.java` · base `/api/v1/obras/tipos-obra`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `TipoDeObraResponse`); Request separado (TipoDeObraRequest)
- (d) /options: equivalente (`/todos-ativos`)
- (e) status nas listagens: —
- (f) OpenAPI: 7/7 (via `TipoDeObraControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/obras/tipos-obra` | `TipoDeObraResponse` | — |  | ✓ |
| PUT | `/api/v1/obras/tipos-obra/{id}` | `TipoDeObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/tipos-obra/{id}` | `TipoDeObraResponse` | — |  | ✓ |
| GET | `/api/v1/obras/tipos-obra` | `PageResponse<TipoDeObraResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/obras/tipos-obra/todos-ativos` | `List<TipoDeObraResponse>` | List |  | ✓ |
| DELETE | `/api/v1/obras/tipos-obra/{id}` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/obras/tipos-obra/{id}/reativar` | `Void` | — |  | ✓ |

#### TurnoObraController

`modules/obras/infrastructure/web/TurnoObraController.java` · base `/api/v1/obras`

- (a) listagem: sem listagem
- (b) ordenação: mapeamento parcial (ConsultarTurnosObra)
- (c) DTOs: detalhe `TurnoObraResponses.Detalhe`; Request separado (TurnoObraRequests.Atividade, TurnoObraRequests.Relatorio, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 18/18 (via `TurnoObraControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/obras/turnos` | `TurnoObraResponses.Lista` | — | ✓ | ✓ |
| GET | `/api/v1/obras/turnos/boletim` | `TurnoObraResponses.Boletim` | — |  | ✓ |
| GET | `/api/v1/obras/turnos/{id}` | `TurnoObraResponses.Detalhe` | — |  | ✓ |
| POST | `/api/v1/obras/turnos/{id}/atividades` | `TurnoObraResponses.Detalhe` | — |  | ✓ |
| DELETE | `/api/v1/obras/turnos/{id}/atividades/{idAtividade}` | `TurnoObraResponses.Detalhe` | — |  | ✓ |
| PUT | `/api/v1/obras/turnos/{id}/relatorio` | `TurnoObraResponses.Detalhe` | — |  | ✓ |
| POST | `/api/v1/obras/turnos/{id}/ocorrencias` | `TurnoObraResponses.Detalhe` | — |  | ✓ |
| PUT | `/api/v1/obras/turnos/{id}/ocorrencias/{idOcorrencia}` | `TurnoObraResponses.Detalhe` | — |  | ✓ |
| DELETE | `/api/v1/obras/turnos/{id}/ocorrencias/{idOcorrencia}` | `TurnoObraResponses.Detalhe` | — |  | ✓ |
| POST | `/api/v1/obras/turnos/{id}/aprs` | `TurnoObraResponses.Detalhe` | — |  | ✓ |
| PUT | `/api/v1/obras/turnos/{id}/aprs/{idApr}` | `TurnoObraResponses.Detalhe` | — |  | ✓ |
| POST | `/api/v1/obras/turnos/{id}/aprs/{idApr}/conclusao` | `TurnoObraResponses.Detalhe` | — |  | ✓ |
| DELETE | `/api/v1/obras/turnos/{id}/aprs/{idApr}` | `TurnoObraResponses.Detalhe` | — |  | ✓ |
| POST | `/api/v1/obras/turnos/{id}/anexos` | `TurnoObraResponses.Detalhe` | — |  | ✓ |
| GET | `/api/v1/obras/turnos/{id}/anexos/{idAnexo}/download` | `StreamingResponseBody` | — |  | ✓ |
| DELETE | `/api/v1/obras/turnos/{id}/anexos/{idAnexo}` | `TurnoObraResponses.Detalhe` | — |  | ✓ |
| POST | `/api/v1/obras/programacoes/{idProgramacao}/apontamentos` | `ProgramacaoResponses.ProgramacaoDetalhe` | — |  | ✓ |
| DELETE | `/api/v1/obras/apontamentos/{idApontamento}` | `Void` | — |  | ✓ |

### Módulo `rh`

#### BaseOperacionalController

`modules/rh/infrastructure/web/BaseOperacionalController.java` · base `/api/v1/bases-operacionais`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `BaseOperacionalResponse`); Request separado (BaseOperacionalRequest, ConfirmarImportacaoBaseRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 9/9 (via `BaseOperacionalControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/bases-operacionais` | `BaseOperacionalResponse` | — |  | ✓ |
| POST | `/api/v1/bases-operacionais/importar` | `ImportacaoBaseOperacionalResponse` | — |  | ✓ |
| POST | `/api/v1/bases-operacionais/confirmar-importacao` | `ImportacaoBaseOperacionalResponse` | — |  | ✓ |
| PUT | `/api/v1/bases-operacionais/{id}` | `BaseOperacionalResponse` | — |  | ✓ |
| DELETE | `/api/v1/bases-operacionais/{id}` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/bases-operacionais/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/bases-operacionais/{id}` | `BaseOperacionalResponse` | — |  | ✓ |
| GET | `/api/v1/bases-operacionais` | `PageResponse<BaseOperacionalResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/bases-operacionais/importar/modelo` | `byte[]` | — |  | ✓ |

#### CentroFaturamentoController

`modules/rh/infrastructure/web/CentroFaturamentoController.java` · base `/api/v1/centros-faturamento`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `CentroFaturamentoResponse`); Request separado (CentroFaturamentoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `CentroFaturamentoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/centros-faturamento` | `CentroFaturamentoResponse` | — |  | ✓ |
| GET | `/api/v1/centros-faturamento/{id}` | `CentroFaturamentoResponse` | — |  | ✓ |
| GET | `/api/v1/centros-faturamento` | `PageResponse<CentroFaturamentoResponse>` | PageResponse | ✓ | ✓ |
| PUT | `/api/v1/centros-faturamento/{id}` | `CentroFaturamentoResponse` | — |  | ✓ |
| PUT | `/api/v1/centros-faturamento/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/centros-faturamento/{id}` | `Void` | — |  | ✓ |

#### ColaboradorController

`modules/rh/infrastructure/web/ColaboradorController.java` · base `/api/v1/rh/colaboradores`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `ColaboradorResponse`); Request separado (ColaboradorRequest, ConfirmarImportacaoRequest, …)
- (d) /options: sim (`/options`, `LookupPageDto`)
- (e) status nas listagens: —
- (f) OpenAPI: 12/12 (via `ColaboradorControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/rh/colaboradores` | `ColaboradorResponse` | — |  | ✓ |
| POST | `/api/v1/rh/colaboradores/importar` | `ImportacaoColaboradorResponse` | — |  | ✓ |
| POST | `/api/v1/rh/colaboradores/confirmar-importacao` | `ImportacaoColaboradorResponse` | — |  | ✓ |
| POST | `/api/v1/rh/colaboradores/gerar-acesso` | `ColaboradorResponse` | — |  | ✓ |
| PUT | `/api/v1/rh/colaboradores/{id}` | `ColaboradorResponse` | — |  | ✓ |
| PUT | `/api/v1/rh/colaboradores/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/rh/colaboradores/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/rh/colaboradores/{id}` | `ColaboradorResponse` | — |  | ✓ |
| GET | `/api/v1/rh/colaboradores/options` | `LookupPageDto<LookupOptionDto>` | — |  | ✓ |
| GET | `/api/v1/rh/colaboradores` | `PageResponse<ColaboradorResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/rh/colaboradores/coordenadores-supervisores` | `java.util.List<ColaboradorMinResponse>` | — |  | ✓ |
| GET | `/api/v1/rh/colaboradores/importar/modelo` | `byte[]` | — |  | ✓ |

#### ConfiguracaoMedidaDisciplinarController

`modules/rh/infrastructure/web/ConfiguracaoMedidaDisciplinarController.java` · base `/api/v1/rh/medidas-disciplinares/configuracao`

- (a) listagem: List ×2
- (b) ordenação: n/a
- (c) DTOs: só Request (TipoMedidaDisciplinarRequest, MotivoMedidaDisciplinarRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 12/12 (via `ConfiguracaoMedidaDisciplinarControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/rh/medidas-disciplinares/configuracao/tipos` | `List<TipoMedidaDisciplinarResponse>` | List |  | ✓ |
| POST | `/api/v1/rh/medidas-disciplinares/configuracao/tipos` | `TipoMedidaDisciplinarResponse` | — |  | ✓ |
| PUT | `/api/v1/rh/medidas-disciplinares/configuracao/tipos/{id}` | `TipoMedidaDisciplinarResponse` | — |  | ✓ |
| PATCH | `/api/v1/rh/medidas-disciplinares/configuracao/tipos/{id}/ativar` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/rh/medidas-disciplinares/configuracao/tipos/{id}/desativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/rh/medidas-disciplinares/configuracao/motivos` | `List<MotivoMedidaDisciplinarResponse>` | List |  | ✓ |
| POST | `/api/v1/rh/medidas-disciplinares/configuracao/motivos` | `MotivoMedidaDisciplinarResponse` | — |  | ✓ |
| PUT | `/api/v1/rh/medidas-disciplinares/configuracao/motivos/{id}` | `MotivoMedidaDisciplinarResponse` | — |  | ✓ |
| PATCH | `/api/v1/rh/medidas-disciplinares/configuracao/motivos/{id}/ativar` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/rh/medidas-disciplinares/configuracao/motivos/{id}/desativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/rh/medidas-disciplinares/configuracao/parametros` | `ParametrosRhResponse` | — |  | ✓ |
| PUT | `/api/v1/rh/medidas-disciplinares/configuracao/parametros` | `ParametrosRhResponse` | — |  | ✓ |

#### CoordenadorController

`modules/rh/infrastructure/web/CoordenadorController.java` · base `/api/v1/rh/coordenadores`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `CoordenadorResponse`); Request separado (CoordenadorRequest, ConfirmarImportacaoCoordenadorRequest)
- (d) /options: equivalente (`/min`)
- (e) status nas listagens: —
- (f) OpenAPI: 10/10 (via `CoordenadorControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/rh/coordenadores` | `CoordenadorResponse` | — |  | ✓ |
| POST | `/api/v1/rh/coordenadores/importar` | `ImportacaoCoordenadorResponse` | — |  | ✓ |
| POST | `/api/v1/rh/coordenadores/confirmar-importacao` | `ImportacaoCoordenadorResponse` | — |  | ✓ |
| PUT | `/api/v1/rh/coordenadores/{id}` | `CoordenadorResponse` | — |  | ✓ |
| PUT | `/api/v1/rh/coordenadores/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/rh/coordenadores/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/rh/coordenadores/{id}` | `CoordenadorResponse` | — |  | ✓ |
| GET | `/api/v1/rh/coordenadores` | `PageResponse<CoordenadorResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/rh/coordenadores/min` | `List<CoordenadorMinResponse>` | List |  | ✓ |
| GET | `/api/v1/rh/coordenadores/importar/modelo` | `byte[]` | — |  | ✓ |

#### EquipeController

`modules/rh/infrastructure/web/EquipeController.java` · base `/api/v1/equipes`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `EquipeResponse`); Request separado (EquipeRequest, EquipeMembroRequest, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 14/14 (via `EquipeControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/equipes/importar` | `ImportacaoEquipeResponse` | — |  | ✓ |
| POST | `/api/v1/equipes/confirmar-importacao` | `ImportacaoEquipeResponse` | — |  | ✓ |
| POST | `/api/v1/equipes` | `EquipeResponse` | — |  | ✓ |
| PUT | `/api/v1/equipes/{id}` | `EquipeResponse` | — |  | ✓ |
| PUT | `/api/v1/equipes/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/equipes/{id}` | `EquipeResponse` | — |  | ✓ |
| GET | `/api/v1/equipes` | `PageResponse<EquipeResponse>` | PageResponse | ✓ | ✓ |
| DELETE | `/api/v1/equipes/{id}` | `Void` | — |  | ✓ |
| POST | `/api/v1/equipes/{id}/membros` | `Void` | — |  | ✓ |
| POST | `/api/v1/equipes/{id}/membros/batch` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/equipes/{id}/membros/{colaboradorId}` | `Void` | — |  | ✓ |
| PATCH | `/api/v1/equipes/{id}/responsabilidade/{colaboradorId}` | `Void` | — |  | ✓ |
| GET | `/api/v1/equipes/{id}/membros` | `List<EquipeMembroResponse>` | List |  | ✓ |
| GET | `/api/v1/equipes/importar/modelo` | `byte[]` | — |  | ✓ |

#### FuncaoController

`modules/rh/infrastructure/web/FuncaoController.java` · base `/api/v1/rh/funcoes`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `FuncaoResponse`); Request separado (FuncaoRequest, ConfirmarImportacaoFuncaoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 9/9 (via `FuncaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/rh/funcoes` | `FuncaoResponse` | — |  | ✓ |
| POST | `/api/v1/rh/funcoes/importar` | `ImportacaoFuncaoResponse` | — |  | ✓ |
| POST | `/api/v1/rh/funcoes/confirmar-importacao` | `ImportacaoFuncaoResponse` | — |  | ✓ |
| PUT | `/api/v1/rh/funcoes/{id}` | `FuncaoResponse` | — |  | ✓ |
| PUT | `/api/v1/rh/funcoes/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/rh/funcoes/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/rh/funcoes/{id}` | `FuncaoResponse` | — |  | ✓ |
| GET | `/api/v1/rh/funcoes` | `PageResponse<FuncaoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/rh/funcoes/importar/modelo` | `byte[]` | — |  | ✓ |

#### MedidaDisciplinarController

`modules/rh/infrastructure/web/MedidaDisciplinarController.java` · base `/api/v1/rh/medidas-disciplinares`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `MedidaDisciplinarResponse`); Request separado (MedidaDisciplinarRequest, CancelarMedidaDisciplinarRequest)
- (d) /options: não
- (e) status nas listagens: situacao: enum cru; situacaoRotulo: String
- (f) OpenAPI: 9/9 (via `MedidaDisciplinarControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/rh/medidas-disciplinares` | `PageResponse<MedidaDisciplinarResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/rh/medidas-disciplinares/{id}` | `MedidaDisciplinarResponse` | — |  | ✓ |
| GET | `/api/v1/rh/medidas-disciplinares/reincidencia` | `ReincidenciaMedidaDisciplinarResponse` | — |  | ✓ |
| POST | `/api/v1/rh/medidas-disciplinares` | `MedidaDisciplinarResponse` | — |  | ✓ |
| PUT | `/api/v1/rh/medidas-disciplinares/{id}` | `MedidaDisciplinarResponse` | — |  | ✓ |
| POST | `/api/v1/rh/medidas-disciplinares/{id}/cancelamento` | `MedidaDisciplinarResponse` | — |  | ✓ |
| POST | `/api/v1/rh/medidas-disciplinares/{id}/anexos` | `MedidaDisciplinarResponse` | — |  | ✓ |
| GET | `/api/v1/rh/medidas-disciplinares/{id}/anexos/{idAnexo}` | `Resource` | — |  | ✓ |
| DELETE | `/api/v1/rh/medidas-disciplinares/{id}/anexos/{idAnexo}` | `MedidaDisciplinarResponse` | — |  | ✓ |

#### MetaFaturamentoController

`modules/rh/infrastructure/web/MetaFaturamentoController.java` · base `/api/v1/metas-faturamento`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `MetaFaturamentoResponse`); Request separado (MetaFaturamentoRequest, MetaFaturamentoUpdateRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `MetaFaturamentoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/metas-faturamento` | `List<MetaFaturamentoResponse>` | — |  | ✓ |
| GET | `/api/v1/metas-faturamento/{id}` | `MetaFaturamentoResponse` | — |  | ✓ |
| GET | `/api/v1/metas-faturamento` | `PageResponse<MetaFaturamentoResponse>` | PageResponse | ✓ | ✓ |
| PUT | `/api/v1/metas-faturamento/{id}` | `MetaFaturamentoResponse` | — |  | ✓ |
| DELETE | `/api/v1/metas-faturamento/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/metas-faturamento/{id}/ativar` | `Void` | — |  | ✓ |

#### MunicipioController

`modules/rh/infrastructure/web/MunicipioController.java` · base `/api/v1/municipios`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `MunicipioResponse`); Request separado (MunicipioRequest, ConfirmarImportacaoMunicipioRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 9/9 (via `MunicipioControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/municipios` | `MunicipioResponse` | — |  | ✓ |
| POST | `/api/v1/municipios/importar` | `ImportacaoMunicipioResponse` | — |  | ✓ |
| POST | `/api/v1/municipios/confirmar-importacao` | `ImportacaoMunicipioResponse` | — |  | ✓ |
| PUT | `/api/v1/municipios/{id}` | `MunicipioResponse` | — |  | ✓ |
| PUT | `/api/v1/municipios/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/municipios/{id}` | `MunicipioResponse` | — |  | ✓ |
| GET | `/api/v1/municipios` | `PageResponse<MunicipioResponse>` | PageResponse | ✓ | ✓ |
| DELETE | `/api/v1/municipios/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/municipios/importar/modelo` | `byte[]` | — |  | ✓ |

#### ProcessoNegocioController

`modules/rh/infrastructure/web/ProcessoNegocioController.java` · base `/api/v1/processos-negocio`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `ProcessoNegocioResponse`); Request separado (ProcessoNegocioRequest, ConfirmarImportacaoProcessoNegocioRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 9/9 (via `ProcessoNegocioControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/processos-negocio` | `ProcessoNegocioResponse` | — |  | ✓ |
| POST | `/api/v1/processos-negocio/importar` | `ImportacaoProcessoNegocioResponse` | — |  | ✓ |
| POST | `/api/v1/processos-negocio/confirmar-importacao` | `ImportacaoProcessoNegocioResponse` | — |  | ✓ |
| PUT | `/api/v1/processos-negocio/{id}` | `ProcessoNegocioResponse` | — |  | ✓ |
| PUT | `/api/v1/processos-negocio/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/processos-negocio/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/processos-negocio/{id}` | `ProcessoNegocioResponse` | — |  | ✓ |
| GET | `/api/v1/processos-negocio` | `PageResponse<ProcessoNegocioResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/processos-negocio/importar/modelo` | `byte[]` | — |  | ✓ |

#### SupervisorController

`modules/rh/infrastructure/web/SupervisorController.java` · base `/api/v1/rh/supervisores`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `SupervisorResponse`); Request separado (SupervisorRequest, ConfirmarImportacaoSupervisorRequest)
- (d) /options: equivalente (`/min`)
- (e) status nas listagens: —
- (f) OpenAPI: 10/10 (via `SupervisorControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/rh/supervisores` | `SupervisorResponse` | — |  | ✓ |
| POST | `/api/v1/rh/supervisores/importar` | `ImportacaoSupervisorResponse` | — |  | ✓ |
| POST | `/api/v1/rh/supervisores/confirmar-importacao` | `ImportacaoSupervisorResponse` | — |  | ✓ |
| PUT | `/api/v1/rh/supervisores/{id}` | `SupervisorResponse` | — |  | ✓ |
| PUT | `/api/v1/rh/supervisores/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/rh/supervisores/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/rh/supervisores/{id}` | `SupervisorResponse` | — |  | ✓ |
| GET | `/api/v1/rh/supervisores` | `PageResponse<SupervisorResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/rh/supervisores/min` | `List<SupervisorMinResponse>` | List |  | ✓ |
| GET | `/api/v1/rh/supervisores/importar/modelo` | `byte[]` | — |  | ✓ |

#### TipoEquipeController

`modules/rh/infrastructure/web/TipoEquipeController.java` · base `/api/v1/rh/tipos-equipe`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `TipoEquipeResponse`); Request separado (TipoEquipeRequest, ConfirmarImportacaoTipoEquipeRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 9/9 (via `TipoEquipeControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/rh/tipos-equipe` | `TipoEquipeResponse` | — |  | ✓ |
| PUT | `/api/v1/rh/tipos-equipe/{id}` | `TipoEquipeResponse` | — |  | ✓ |
| PUT | `/api/v1/rh/tipos-equipe/{id}/ativar` | `Void` | — |  | ✓ |
| GET | `/api/v1/rh/tipos-equipe/{id}` | `TipoEquipeResponse` | — |  | ✓ |
| GET | `/api/v1/rh/tipos-equipe` | `PageResponse<TipoEquipeResponse>` | PageResponse | ✓ | ✓ |
| DELETE | `/api/v1/rh/tipos-equipe/{id}` | `Void` | — |  | ✓ |
| POST | `/api/v1/rh/tipos-equipe/importar` | `ImportacaoTipoEquipeResponse` | — |  | ✓ |
| POST | `/api/v1/rh/tipos-equipe/importar/confirmar` | `ImportacaoTipoEquipeResponse` | — |  | ✓ |
| GET | `/api/v1/rh/tipos-equipe/importar/modelo` | `byte[]` | — |  | ✓ |

#### VeiculoController

`modules/rh/infrastructure/web/VeiculoController.java` · base `/api/v1/veiculos`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `VeiculoResponse`); Request separado (VeiculoRequest, ConfirmarImportacaoVeiculoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 9/9 (via `VeiculoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/veiculos` | `VeiculoResponse` | — |  | ✓ |
| POST | `/api/v1/veiculos/importar` | `ImportacaoVeiculoResponse` | — |  | ✓ |
| POST | `/api/v1/veiculos/confirmar-importacao` | `ImportacaoVeiculoResponse` | — |  | ✓ |
| GET | `/api/v1/veiculos/{id}` | `VeiculoResponse` | — |  | ✓ |
| GET | `/api/v1/veiculos` | `PageResponse<VeiculoResponse>` | PageResponse | ✓ | ✓ |
| PUT | `/api/v1/veiculos/{id}` | `VeiculoResponse` | — |  | ✓ |
| PUT | `/api/v1/veiculos/{id}/ativar` | `Void` | — |  | ✓ |
| DELETE | `/api/v1/veiculos/{id}` | `Void` | — |  | ✓ |
| GET | `/api/v1/veiculos/importar/modelo` | `byte[]` | — |  | ✓ |

### Módulo `sincronizacao`

#### SincronizacaoController

`modules/sincronizacao/infrastructure/web/SincronizacaoController.java` · base `/api/`

- (a) listagem: PageResponse ×1
- (b) ordenação: mapeamento parcial (SincronizacaoUseCases)
- (c) DTOs: listagem = detalhe (DTO único `CasoResponse`); Request separado (OperacaoRequest, AtribuicaoRequest, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 0/9 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sincronizacao/operacoes` | `OperacaoResponse` | — |  | ✗ |
| GET | `/api/v1/sincronizacao/operacoes/{idOperacaoLocal}` | `OperacaoResponse` | — |  | ✗ |
| GET | `/api/v1/sincronizacao/casos` | `PageResponse<CasoResponse>` | PageResponse | ✓ | ✗ |
| GET | `/api/v1/sincronizacao/casos/{id}` | `CasoResponse` | — |  | ✗ |
| GET | `/api/v1/sincronizacao/casos/{id}/anexos/{idAnexo}` | `byte[]` | — |  | ✗ |
| POST | `/api/v1/sincronizacao/casos/{id}/atribuicao` | `CasoResponse` | — |  | ✗ |
| POST | `/api/v1/sincronizacao/casos/{id}/correcoes` | `CasoResponse` | — |  | ✗ |
| POST | `/api/v1/sincronizacao/casos/{id}/reprocessamento` | `CasoResponse` | — |  | ✗ |
| POST | `/api/v1/sincronizacao/casos/{id}/descarte` | `CasoResponse` | — |  | ✗ |

### Módulo `sst`

#### AcaoGovernancaSstController

`modules/sst/infrastructure/web/AcaoGovernancaSstController.java` · base `/api/v1/sst/governanca/acoes`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `AcaoGovernancaSstResponse`); Request separado (AcaoGovernancaSstRequest, VersaoGovernancaRequest, …)
- (d) /options: não
- (e) status nas listagens: prioridade: enum cru; status: enum cru; statusPrazo: enum cru
- (f) OpenAPI: 11/11 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/governanca/acoes` | `AcaoGovernancaSstResponse` | — |  | ✓ |
| GET | `/api/v1/sst/governanca/acoes/{id}` | `AcaoGovernancaSstResponse` | — |  | ✓ |
| GET | `/api/v1/sst/governanca/acoes` | `PageResponse<AcaoGovernancaSstResponse>` | PageResponse | ✓ | ✓ |
| PUT | `/api/v1/sst/governanca/acoes/{id}` | `AcaoGovernancaSstResponse` | — |  | ✓ |
| POST | `/api/v1/sst/governanca/acoes/{id}/inicio` | `AcaoGovernancaSstResponse` | — |  | ✓ |
| POST | `/api/v1/sst/governanca/acoes/{id}/conclusao` | `AcaoGovernancaSstResponse` | — |  | ✓ |
| POST | `/api/v1/sst/governanca/acoes/{id}/cancelamento` | `AcaoGovernancaSstResponse` | — |  | ✓ |
| POST | `/api/v1/sst/governanca/acoes/{id}/evidencias` | `EvidenciaGovernancaResponse` | — |  | ✓ |
| GET | `/api/v1/sst/governanca/acoes/{id}/evidencias` | `List<EvidenciaGovernancaResponse>` | List |  | ✓ |
| GET | `/api/v1/sst/governanca/acoes/{id}/evidencias/{idEvidencia}/arquivo` | `InputStreamResource` | — |  | ✓ |
| DELETE | `/api/v1/sst/governanca/acoes/{id}/evidencias/{idEvidencia}` | `Void` | — |  | ✓ |

#### AtividadeSstController

`modules/sst/infrastructure/web/AtividadeSstController.java` · base `/api/v1/sst/atividades`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `AtividadeSstResponse`); Request separado (AtividadeSstRequest)
- (d) /options: equivalente (`/opcoes`)
- (e) status nas listagens: —
- (f) OpenAPI: 7/7 (via `AtividadeSstControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/atividades` | `AtividadeSstResponse` | — |  | ✓ |
| GET | `/api/v1/sst/atividades/{id}` | `AtividadeSstResponse` | — |  | ✓ |
| GET | `/api/v1/sst/atividades` | `PageResponse<AtividadeSstResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/sst/atividades/opcoes` | `List<AtividadeSstResponse>` | List |  | ✓ |
| PUT | `/api/v1/sst/atividades/{id}` | `AtividadeSstResponse` | — |  | ✓ |
| DELETE | `/api/v1/sst/atividades/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/sst/atividades/{id}/ativar` | `Void` | — |  | ✓ |

#### CatalogoSstController

`modules/sst/infrastructure/web/CatalogoSstController.java` · base `/api/v1/sst/catalogos`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `CatalogoSstResponse`); Request separado (CatalogoSstRequest)
- (d) /options: equivalente (`/opcoes`)
- (e) status nas listagens: —
- (f) OpenAPI: 7/7 (via `CatalogoSstControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/catalogos` | `CatalogoSstResponse` | — |  | ✓ |
| GET | `/api/v1/sst/catalogos/{id}` | `CatalogoSstResponse` | — |  | ✓ |
| GET | `/api/v1/sst/catalogos` | `PageResponse<CatalogoSstResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/sst/catalogos/opcoes` | `List<CatalogoSstResponse>` | List |  | ✓ |
| PUT | `/api/v1/sst/catalogos/{id}` | `CatalogoSstResponse` | — |  | ✓ |
| DELETE | `/api/v1/sst/catalogos/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/sst/catalogos/{id}/ativar` | `Void` | — |  | ✓ |

#### CorpoGovernancaSstController

`modules/sst/infrastructure/web/CorpoGovernancaSstController.java` · base `/api/v1/sst/governanca/corpos`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem ≠ detalhe (CorpoGovernancaSstResponse / CorpoGovernancaSstDetalheResponse); Request separado (CorpoGovernancaSstRequest, CorpoGovernancaSstUpdateRequest, …)
- (d) /options: não
- (e) status nas listagens: status: enum cru
- (f) OpenAPI: 9/9 (via `CorpoGovernancaSstControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/governanca/corpos` | `CorpoGovernancaSstDetalheResponse` | — |  | ✓ |
| GET | `/api/v1/sst/governanca/corpos/{id}` | `CorpoGovernancaSstDetalheResponse` | — |  | ✓ |
| GET | `/api/v1/sst/governanca/corpos` | `PageResponse<CorpoGovernancaSstResponse>` | PageResponse | ✓ | ✓ |
| PUT | `/api/v1/sst/governanca/corpos/{id}` | `CorpoGovernancaSstDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/sst/governanca/corpos/{idCorpo}/membros` | `MembroCorpoSstResponse` | — |  | ✓ |
| POST | `/api/v1/sst/governanca/corpos/{idCorpo}/membros/{idMembro}/saida` | `MembroCorpoSstResponse` | — |  | ✓ |
| POST | `/api/v1/sst/governanca/corpos/{idCorpo}/membros/{idMembro}/substituicao` | `MembroCorpoSstResponse` | — |  | ✓ |
| POST | `/api/v1/sst/governanca/corpos/{id}/ativacao` | `CorpoGovernancaSstDetalheResponse` | — |  | ✓ |
| POST | `/api/v1/sst/governanca/corpos/{id}/encerramento` | `CorpoGovernancaSstDetalheResponse` | — |  | ✓ |

#### DashboardGovernancaSstController

`modules/sst/infrastructure/web/DashboardGovernancaSstController.java` · base `/api/v1/sst/governanca/dashboard`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 0/1 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/sst/governanca/dashboard` | `DashboardGovernancaSstDto.Response` | — |  | ✗ |

#### DashboardSstController

`modules/sst/infrastructure/web/DashboardSstController.java` · base `/api/v1/sst/dashboards`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: —
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 3/3 (via `DashboardSstControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/sst/dashboards/inspecoes` | `DashboardInspecoesResponse` | — |  | ✓ |
| GET | `/api/v1/sst/dashboards/desvios` | `DashboardDesviosResponse` | — |  | ✓ |
| GET | `/api/v1/sst/dashboards/eventos` | `DashboardEventosSstResponse` | — |  | ✓ |

#### DesvioSegurancaController

`modules/sst/infrastructure/web/DesvioSegurancaController.java` · base `/api/v1/sst/desvios`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `DesvioDetalhadoResponse`)
- (d) /options: não
- (e) status nas listagens: statusInspecao: enum cru; status: enum cru
- (f) OpenAPI: 2/2 (via `DesvioSegurancaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/sst/desvios` | `PageResponse<DesvioDetalhadoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/sst/desvios/{idDesvio}` | `DesvioDetalhadoResponse` | — |  | ✓ |

#### DocumentoGovernancaSstController

`modules/sst/infrastructure/web/DocumentoGovernancaSstController.java` · base `/api/v1/sst/governanca`

- (a) listagem: PageResponse ×2, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `CategoriaDocumentoSstResponse`); Request separado (CategoriaDocumentoSstRequest, ConferenciaDocumentoSstRequest, …)
- (d) /options: não
- (e) status nas listagens: situacaoConferencia: enum cru; statusValidade: enum cru
- (f) OpenAPI: 0/13 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/governanca/categorias-documento` | `CategoriaDocumentoSstResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/categorias-documento/{id}/nova-versao` | `CategoriaDocumentoSstResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/categorias-documento/{id}/confirmacao` | `CategoriaDocumentoSstResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/categorias-documento/{id}` | `CategoriaDocumentoSstResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/categorias-documento` | `PageResponse<CategoriaDocumentoSstResponse>` | PageResponse | ✓ | ✗ |
| POST | `/api/v1/sst/governanca/documentos` | `DocumentoSstResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/documentos` | `PageResponse<DocumentoSstResponse>` | PageResponse | ✓ | ✗ |
| GET | `/api/v1/sst/governanca/documentos/resumo` | `ResumoDocumentosSstResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/documentos/{id}` | `DocumentoSstResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/documentos/{id}/historico` | `List<DocumentoSstResponse>` | List |  | ✗ |
| POST | `/api/v1/sst/governanca/documentos/{id}/conferencia` | `DocumentoSstResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/documentos/{id}/arquivamento` | `DocumentoSstResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/documentos/{id}/arquivo` | `InputStreamResource` | — |  | ✗ |

#### EventoSstController

`modules/sst/infrastructure/web/EventoSstController.java` · base `/api/v1/sst/eventos`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem ≠ detalhe (EventoSstResumoResponse / EventoSstResponse); Request separado (EventoSstRequest, ConfirmarImportacaoEventoSstRequest, …)
- (d) /options: não
- (e) status nas listagens: status: enum cru
- (f) OpenAPI: 17/17 (via `EventoSstControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/eventos` | `EventoSstResponse` | — |  | ✓ |
| POST | `/api/v1/sst/eventos/importar` | `ImportacaoEventoSstResponse` | — |  | ✓ |
| POST | `/api/v1/sst/eventos/confirmar-importacao` | `ImportacaoEventoSstResponse` | — |  | ✓ |
| GET | `/api/v1/sst/eventos/importar/modelo` | `byte[]` | — |  | ✓ |
| PUT | `/api/v1/sst/eventos/{id}` | `EventoSstResponse` | — |  | ✓ |
| GET | `/api/v1/sst/eventos/{id}` | `EventoSstResponse` | — |  | ✓ |
| GET | `/api/v1/sst/eventos` | `PageResponse<EventoSstResumoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/sst/eventos/exportar` | `StreamingResponseBody` | — |  | ✓ |
| PUT | `/api/v1/sst/eventos/{id}/tratativa` | `EventoSstResponse` | — |  | ✓ |
| PUT | `/api/v1/sst/eventos/{id}/conclusao` | `EventoSstResponse` | — |  | ✓ |
| PUT | `/api/v1/sst/eventos/{id}/cancelamento` | `EventoSstResponse` | — |  | ✓ |
| PUT | `/api/v1/sst/eventos/{id}/reabertura` | `EventoSstResponse` | — |  | ✓ |
| DELETE | `/api/v1/sst/eventos/{id}` | `Void` | — |  | ✓ |
| POST | `/api/v1/sst/eventos/{id}/anexos` | `AnexoEventoResponse` | — |  | ✓ |
| GET | `/api/v1/sst/eventos/{id}/anexos` | `List<AnexoEventoResponse>` | List |  | ✓ |
| GET | `/api/v1/sst/eventos/{id}/anexos/{idAnexo}` | `InputStreamResource` | — |  | ✓ |
| DELETE | `/api/v1/sst/eventos/{id}/anexos/{idAnexo}` | `Void` | — |  | ✓ |

#### ExecucaoChecklistGovernancaSstController

`modules/sst/infrastructure/web/ExecucaoChecklistGovernancaSstController.java` · base `/api/v1/sst/governanca/checklists/execucoes`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `ExecucaoChecklistGovernancaResponse`); Request separado (CriarExecucaoChecklistGovernancaRequest, SalvarRespostasChecklistGovernancaRequest, …)
- (d) /options: não
- (e) status nas listagens: status: enum cru
- (f) OpenAPI: 10/10 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/governanca/checklists/execucoes` | `ExecucaoChecklistGovernancaResponse` | — |  | ✓ |
| GET | `/api/v1/sst/governanca/checklists/execucoes/{id}` | `ExecucaoChecklistGovernancaResponse` | — |  | ✓ |
| GET | `/api/v1/sst/governanca/checklists/execucoes` | `PageResponse<ExecucaoChecklistGovernancaResponse>` | PageResponse | ✓ | ✓ |
| PUT | `/api/v1/sst/governanca/checklists/execucoes/{id}/respostas` | `ExecucaoChecklistGovernancaResponse` | — |  | ✓ |
| POST | `/api/v1/sst/governanca/checklists/execucoes/{id}/conclusao` | `ExecucaoChecklistGovernancaResponse` | — |  | ✓ |
| POST | `/api/v1/sst/governanca/checklists/execucoes/{id}/constatacoes/{idConstatacao}/acao` | `AcaoGovernancaSstResponse` | — |  | ✓ |
| POST | `/api/v1/sst/governanca/checklists/execucoes/{id}/evidencias` | `EvidenciaGovernancaResponse` | — |  | ✓ |
| GET | `/api/v1/sst/governanca/checklists/execucoes/{id}/evidencias` | `List<EvidenciaGovernancaResponse>` | List |  | ✓ |
| GET | `/api/v1/sst/governanca/checklists/execucoes/{id}/evidencias/{idEvidencia}/arquivo` | `InputStreamResource` | — |  | ✓ |
| DELETE | `/api/v1/sst/governanca/checklists/execucoes/{id}/evidencias/{idEvidencia}` | `Void` | — |  | ✓ |

#### FormularioInspecaoController

`modules/sst/infrastructure/web/FormularioInspecaoController.java` · base `/api/v1/sst/formularios-inspecao`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem ≠ detalhe (FormularioInspecaoResumoResponse / FormularioInspecaoResponse); Request separado (CriarFormularioRequest, AtualizarFormularioDadosRequest, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 14/14 (via `FormularioInspecaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/formularios-inspecao` | `FormularioInspecaoResponse` | — |  | ✓ |
| GET | `/api/v1/sst/formularios-inspecao/{id}` | `FormularioInspecaoResponse` | — |  | ✓ |
| GET | `/api/v1/sst/formularios-inspecao` | `PageResponse<FormularioInspecaoResumoResponse>` | PageResponse | ✓ | ✓ |
| PUT | `/api/v1/sst/formularios-inspecao/{id}/estrutura` | `FormularioInspecaoResponse` | — |  | ✓ |
| PATCH | `/api/v1/sst/formularios-inspecao/{id}` | `FormularioInspecaoResponse` | — |  | ✓ |
| POST | `/api/v1/sst/formularios-inspecao/{id}/duplicar` | `FormularioInspecaoResponse` | — |  | ✓ |
| PATCH | `/api/v1/sst/formularios-inspecao/{id}/grupos/ordenacao` | `FormularioInspecaoResponse` | — |  | ✓ |
| PATCH | `/api/v1/sst/formularios-inspecao/{id}/grupos/{idGrupo}/perguntas/ordenacao` | `FormularioInspecaoResponse` | — |  | ✓ |
| PATCH | `/api/v1/sst/formularios-inspecao/{id}/grupos/{idGrupo}/perguntas/{idPergunta}/opcoes/ordenacao` | `FormularioInspecaoResponse` | — |  | ✓ |
| DELETE | `/api/v1/sst/formularios-inspecao/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/sst/formularios-inspecao/{id}/ativar` | `Void` | — |  | ✓ |
| POST | `/api/v1/sst/formularios-inspecao/importar` | `ImportacaoFormularioInspecaoResponse` | — |  | ✓ |
| POST | `/api/v1/sst/formularios-inspecao/confirmar-importacao` | `ImportacaoFormularioInspecaoResponse` | — |  | ✓ |
| GET | `/api/v1/sst/formularios-inspecao/importar/modelo` | `byte[]` | — |  | ✓ |

#### InspecaoSegurancaController

`modules/sst/infrastructure/web/InspecaoSegurancaController.java` · base `/api/v1/sst/inspecoes`

- (a) listagem: PageResponse ×2
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `InspecaoSegurancaResponse`); Request separado (RegistrarInspecaoRequest, TratarDesvioRequest, …)
- (d) /options: não
- (e) status nas listagens: status: enum cru
- (f) OpenAPI: 20/20 (via `InspecaoSegurancaControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/inspecoes` | `InspecaoSegurancaResponse` | — |  | ✓ |
| POST | `/api/v1/sst/inspecoes/anexos` | `EvidenciaInspecaoResponse` | — |  | ✓ |
| DELETE | `/api/v1/sst/inspecoes/anexos/{idAnexo}` | `Void` | — |  | ✓ |
| POST | `/api/v1/sst/inspecoes/{idInspecao}/anexos` | `EvidenciaInspecaoResponse` | — |  | ✓ |
| GET | `/api/v1/sst/inspecoes/{idInspecao}/anexos/{idAnexo}` | `InputStreamResource` | — |  | ✓ |
| DELETE | `/api/v1/sst/inspecoes/{idInspecao}/anexos/{idAnexo}` | `Void` | — |  | ✓ |
| GET | `/api/v1/sst/inspecoes/{id}` | `InspecaoSegurancaResponse` | — |  | ✓ |
| GET | `/api/v1/sst/inspecoes` | `PageResponse<InspecaoSegurancaResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/sst/inspecoes/minhas` | `PageResponse<InspecaoSegurancaResponse>` | PageResponse | ✓ | ✓ |
| PUT | `/api/v1/sst/inspecoes/{idInspecao}/desvios/{idDesvio}/tratamento` | `InspecaoSegurancaResponse` | — |  | ✓ |
| PUT | `/api/v1/sst/inspecoes/{id}` | `InspecaoSegurancaResponse` | — |  | ✓ |
| PUT | `/api/v1/sst/inspecoes/{id}/cabecalho` | `InspecaoSegurancaResponse` | — |  | ✓ |
| GET | `/api/v1/sst/inspecoes/{id}/historico` | `HistoricoInspecaoResponse` | — | ✓ | ✓ |
| POST | `/api/v1/sst/inspecoes/{idInspecao}/desvios/{idDesvio}/anexos` | `AnexoDesvioResponse` | — |  | ✓ |
| GET | `/api/v1/sst/inspecoes/{idInspecao}/desvios/{idDesvio}/anexos/{idAnexo}` | `InputStreamResource` | — |  | ✓ |
| DELETE | `/api/v1/sst/inspecoes/{idInspecao}/desvios/{idDesvio}/anexos/{idAnexo}` | `Void` | — |  | ✓ |
| GET | `/api/v1/sst/inspecoes/exportar/resumo` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/sst/inspecoes/exportar/detalhado` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/sst/inspecoes/desvios/exportar/resumo` | `StreamingResponseBody` | — |  | ✓ |
| GET | `/api/v1/sst/inspecoes/desvios/exportar/detalhado` | `StreamingResponseBody` | — |  | ✓ |

#### MetaInspecaoController

`modules/sst/infrastructure/web/MetaInspecaoController.java` · base `/api/v1/sst/metas-inspecao`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `MetaInspecaoResponse`); Request separado (MetaInspecaoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 7/7 (via `MetaInspecaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/metas-inspecao` | `MetaInspecaoResponse` | — |  | ✓ |
| GET | `/api/v1/sst/metas-inspecao/{id}` | `MetaInspecaoResponse` | — |  | ✓ |
| GET | `/api/v1/sst/metas-inspecao` | `PageResponse<MetaInspecaoResponse>` | PageResponse | ✓ | ✓ |
| PUT | `/api/v1/sst/metas-inspecao/{id}` | `MetaInspecaoResponse` | — |  | ✓ |
| GET | `/api/v1/sst/metas-inspecao/acompanhamento` | `AcompanhamentoMetasResponse` | — |  | ✓ |
| DELETE | `/api/v1/sst/metas-inspecao/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/sst/metas-inspecao/{id}/ativar` | `Void` | — |  | ✓ |

#### MeuDesvioController

`modules/sst/infrastructure/web/MeuDesvioController.java` · base `/api/v1/sst/desvios/meus`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem `MeuDesvioResponse`; Request separado (TratarDesvioRequest, TratarDesviosEmMassaRequest)
- (d) /options: não
- (e) status nas listagens: status: enum cru
- (f) OpenAPI: 3/3 (via `MeuDesvioControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/sst/desvios/meus` | `PageResponse<MeuDesvioResponse>` | PageResponse | ✓ | ✓ |
| PUT | `/api/v1/sst/desvios/meus/{idDesvio}/tratamento` | `MeuDesvioResponse` | — |  | ✓ |
| PUT | `/api/v1/sst/desvios/meus/tratamento-em-massa` | `TratamentoDesviosEmMassaResponse` | — |  | ✓ |

#### ModeloAtaSstController

`modules/sst/infrastructure/web/ModeloAtaSstController.java` · base `/api/v1/sst/governanca/modelos-ata`

- (a) listagem: List ×2
- (b) ordenação: n/a
- (c) DTOs: detalhe `ModeloAtaSstDto.Response`; Request separado (ModeloAtaSstDto.Request, ModeloAtaSstDto.AtualizarRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 0/10 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/governanca/modelos-ata` | `ModeloAtaSstDto.Response` | — |  | ✗ |
| PUT | `/api/v1/sst/governanca/modelos-ata/{id}` | `ModeloAtaSstDto.Response` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/modelos-ata/{id}` | `ModeloAtaSstDto.Response` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/modelos-ata` | `List<ModeloAtaSstDto.Response>` | List |  | ✗ |
| GET | `/api/v1/sst/governanca/modelos-ata/aplicaveis` | `List<ModeloAtaSstDto.Response>` | List |  | ✗ |
| POST | `/api/v1/sst/governanca/modelos-ata/{id}/duplicacao` | `ModeloAtaSstDto.Response` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/modelos-ata/{id}/nova-revisao` | `ModeloAtaSstDto.Response` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/modelos-ata/{id}/publicacao` | `ModeloAtaSstDto.Response` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/modelos-ata/{id}/retirada` | `ModeloAtaSstDto.Response` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/modelos-ata/{id}/base-docx` | `ModeloAtaSstDto.ArquivoResponse` | — |  | ✗ |

#### ModeloChecklistGovernancaSstController

`modules/sst/infrastructure/web/ModeloChecklistGovernancaSstController.java` · base `/api/v1/sst/governanca/modelos-checklist`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `ModeloChecklistGovernancaResponse`); Request separado (ModeloChecklistGovernancaRequest, DuplicarModeloChecklistGovernancaRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 7/7 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/governanca/modelos-checklist` | `ModeloChecklistGovernancaResponse` | — |  | ✓ |
| GET | `/api/v1/sst/governanca/modelos-checklist/{id}` | `ModeloChecklistGovernancaResponse` | — |  | ✓ |
| GET | `/api/v1/sst/governanca/modelos-checklist` | `PageResponse<ModeloChecklistGovernancaResponse>` | PageResponse | ✓ | ✓ |
| PUT | `/api/v1/sst/governanca/modelos-checklist/{id}` | `ModeloChecklistGovernancaResponse` | — |  | ✓ |
| POST | `/api/v1/sst/governanca/modelos-checklist/{id}/duplicacao` | `ModeloChecklistGovernancaResponse` | — |  | ✓ |
| DELETE | `/api/v1/sst/governanca/modelos-checklist/{id}` | `Void` | — |  | ✓ |
| PUT | `/api/v1/sst/governanca/modelos-checklist/{id}/ativar` | `Void` | — |  | ✓ |

#### NormalizacaoTranscricaoSstController

`modules/sst/infrastructure/web/NormalizacaoTranscricaoSstController.java` · base `/api/v1/sst/governanca/reunioes/{idReuniao}/normalizacoes`

- (a) listagem: List ×1
- (b) ordenação: n/a
- (c) DTOs: só Request (NormalizacaoTranscricaoDto.SolicitarRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 0/3 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/governanca/reunioes/{idReuniao}/normalizacoes` | `NormalizacaoTranscricaoDto.Response` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/reunioes/{idReuniao}/normalizacoes/{idNormalizacao}/confirmacao` | `NormalizacaoTranscricaoDto.Response` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/reunioes/{idReuniao}/normalizacoes` | `List<NormalizacaoTranscricaoDto.Response>` | List |  | ✗ |

#### PerfilNormativoGovernancaSstController

`modules/sst/infrastructure/web/PerfilNormativoGovernancaSstController.java` · base `/api/v1/sst/governanca/perfis-normativos`

- (a) listagem: PageResponse ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `PerfilNormativoGovernancaSstResponse`); Request separado (PerfilNormativoGovernancaSstRequest, ConfirmacaoPerfilNormativoSstRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 4/4 (via `PerfilNormativoGovernancaSstControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/governanca/perfis-normativos` | `PerfilNormativoGovernancaSstResponse` | — |  | ✓ |
| POST | `/api/v1/sst/governanca/perfis-normativos/{id}/confirmar` | `PerfilNormativoGovernancaSstResponse` | — |  | ✓ |
| GET | `/api/v1/sst/governanca/perfis-normativos/{id}` | `PerfilNormativoGovernancaSstResponse` | — |  | ✓ |
| GET | `/api/v1/sst/governanca/perfis-normativos` | `PageResponse<PerfilNormativoGovernancaSstResponse>` | PageResponse | ✓ | ✓ |

#### ReferenciasGovernancaSstController

`modules/sst/infrastructure/web/ReferenciasGovernancaSstController.java` · base `/api/v1/sst/governanca`

- (a) listagem: List ×3
- (b) ordenação: n/a
- (c) DTOs: só Request (ReferenciaGovernancaSstDto.ProcessoRequest, ReferenciaGovernancaSstDto.InstituicaoRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 0/12 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/v1/sst/governanca/processos-treinamento` | `List<ReferenciaGovernancaSstDto.ProcessoResponse>` | List |  | ✗ |
| POST | `/api/v1/sst/governanca/processos-treinamento` | `ReferenciaGovernancaSstDto.ProcessoResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/processos-treinamento/{id}/confirmacao` | `ReferenciaGovernancaSstDto.ProcessoResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/instituicoes-treinamento` | `List<ReferenciaGovernancaSstDto.InstituicaoResponse>` | List |  | ✗ |
| POST | `/api/v1/sst/governanca/instituicoes-treinamento` | `ReferenciaGovernancaSstDto.InstituicaoResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/instituicoes-treinamento/{idInstituicao}/homologacoes/{id}/confirmacao` | `ReferenciaGovernancaSstDto.HomologacaoResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/ativos-inspecionaveis` | `List<ReferenciaGovernancaSstDto.AtivoResponse>` | List |  | ✗ |
| POST | `/api/v1/sst/governanca/ativos-inspecionaveis` | `ReferenciaGovernancaSstDto.AtivoResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/ativos-inspecionaveis/{id}/confirmacao` | `ReferenciaGovernancaSstDto.AtivoResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/importacoes/matriz-treinamentos` | `ReferenciaGovernancaSstDto.ImportacaoResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/importacoes/escolas` | `ReferenciaGovernancaSstDto.ImportacaoResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/importacoes/ativos-inspecionaveis` | `ReferenciaGovernancaSstDto.ImportacaoResponse` | — |  | ✗ |

#### ReuniaoGovernancaSstController

`modules/sst/infrastructure/web/ReuniaoGovernancaSstController.java` · base `/api/v1/sst/governanca/reunioes`

- (a) listagem: PageResponse ×1, List ×5
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `ReuniaoGovernancaDto.Response`); Request separado (ReuniaoGovernancaDto.AgendarRequest, ReuniaoGovernancaDto.PresencaRequest, …)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 0/28 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/governanca/reunioes` | `ReuniaoGovernancaDto.Response` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/reunioes` | `PageResponse<ReuniaoGovernancaDto.Response>` | PageResponse | ✓ | ✗ |
| GET | `/api/v1/sst/governanca/reunioes/{id}` | `ReuniaoGovernancaDto.Response` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/reunioes/capabilities` | `ReuniaoGovernancaDto.CapabilitiesResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/reunioes/{id}/inicio` | `ReuniaoGovernancaDto.Response` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/reunioes/{id}/participacoes` | `List<ReuniaoGovernancaDto.ParticipacaoResponse>` | List |  | ✗ |
| PUT | `/api/v1/sst/governanca/reunioes/{id}/participacoes/{idParticipacao}/presenca` | `ReuniaoGovernancaDto.ParticipacaoResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/reunioes/{id}/convidados` | `ReuniaoGovernancaDto.ConvidadoResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/reunioes/{id}/convidados` | `List<ReuniaoGovernancaDto.ConvidadoResponse>` | List |  | ✗ |
| PUT | `/api/v1/sst/governanca/reunioes/{id}/secretario` | `ReuniaoGovernancaDto.Response` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/reunioes/{id}/presencas/conclusao` | `ReuniaoGovernancaDto.Response` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/reunioes/{id}/transcricao` | `ReuniaoGovernancaDto.TranscricaoResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/reunioes/{id}/transcricoes` | `List<ReuniaoGovernancaDto.TranscricaoResponse>` | List |  | ✗ |
| POST | `/api/v1/sst/governanca/reunioes/{id}/transcricoes/{idRevisao}/confirmacao` | `ReuniaoGovernancaDto.TranscricaoResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/reunioes/{id}/atas/manual` | `AtaGovernancaDto.VersaoResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/reunioes/{id}/atas/geracao` | `AtaGovernancaDto.TentativaResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/reunioes/{id}/atas` | `List<AtaGovernancaDto.VersaoResponse>` | List |  | ✗ |
| POST | `/api/v1/sst/governanca/reunioes/{id}/atas/{idVersao}/aprovacao` | `AtaGovernancaDto.VersaoResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/reunioes/{id}/evidencias` | `AtaGovernancaDto.EvidenciaFotoResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/reunioes/{id}/evidencias` | `List<AtaGovernancaDto.EvidenciaFotoResponse>` | List |  | ✗ |
| GET | `/api/v1/sst/governanca/reunioes/{id}/evidencias/{idFoto}/arquivo` | `InputStreamResource` | — |  | ✗ |
| DELETE | `/api/v1/sst/governanca/reunioes/{id}/evidencias/{idFoto}` | `Void` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/reunioes/{id}/atas/{idVersao}/copia-assinada` | `AtaGovernancaDto.ArquivoResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/reunioes/{id}/atas/{idVersao}/copia-assinada/arquivo` | `InputStreamResource` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/reunioes/{id}/atas/{idVersao}/docx` | `AtaGovernancaDto.ArquivoResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/reunioes/{id}/atas/docx/{idArquivo}/arquivo` | `InputStreamResource` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/reunioes/{id}/finalizacao` | `Void` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/reunioes/{id}/reabertura` | `Void` | — |  | ✗ |

#### TipoInspecaoController

`modules/sst/infrastructure/web/TipoInspecaoController.java` · base `/api/v1/sst/tipos-inspecao`

- (a) listagem: PageResponse ×1, List ×1
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `TipoInspecaoResponse`); Request separado (TipoInspecaoRequest)
- (d) /options: equivalente (`/opcoes`)
- (e) status nas listagens: —
- (f) OpenAPI: 6/6 (via `TipoInspecaoControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/tipos-inspecao` | `TipoInspecaoResponse` | — |  | ✓ |
| GET | `/api/v1/sst/tipos-inspecao/{id}` | `TipoInspecaoResponse` | — |  | ✓ |
| GET | `/api/v1/sst/tipos-inspecao` | `PageResponse<TipoInspecaoResponse>` | PageResponse | ✓ | ✓ |
| GET | `/api/v1/sst/tipos-inspecao/opcoes` | `List<TipoInspecaoResponse>` | List |  | ✓ |
| PUT | `/api/v1/sst/tipos-inspecao/{id}` | `TipoInspecaoResponse` | — |  | ✓ |
| PATCH | `/api/v1/sst/tipos-inspecao/{id}/status` | `Void` | — |  | ✓ |

#### TreinamentoGovernancaSstController

`modules/sst/infrastructure/web/TreinamentoGovernancaSstController.java` · base `/api/v1/sst/governanca`

- (a) listagem: PageResponse ×3
- (b) ordenação: não — `Pageable` repassado sem filtro
- (c) DTOs: listagem = detalhe (DTO único `TreinamentoGovernancaSstResponse`); Request separado (TreinamentoGovernancaSstRequest, ExigenciaTreinamentoSstRequest)
- (d) /options: não
- (e) status nas listagens: status: enum cru
- (f) OpenAPI: 0/12 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/sst/governanca/treinamentos` | `TreinamentoGovernancaSstResponse` | — |  | ✗ |
| PUT | `/api/v1/sst/governanca/treinamentos/{id}` | `TreinamentoGovernancaSstResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/treinamentos/{id}` | `TreinamentoGovernancaSstResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/treinamentos` | `PageResponse<TreinamentoGovernancaSstResponse>` | PageResponse | ✓ | ✗ |
| DELETE | `/api/v1/sst/governanca/treinamentos/{id}` | `Void` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/exigencias-treinamento` | `ExigenciaTreinamentoSstResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/exigencias-treinamento/{id}/nova-versao` | `ExigenciaTreinamentoSstResponse` | — |  | ✗ |
| POST | `/api/v1/sst/governanca/exigencias-treinamento/{id}/confirmacao-fonte` | `ExigenciaTreinamentoSstResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/exigencias-treinamento/{id}` | `ExigenciaTreinamentoSstResponse` | — |  | ✗ |
| GET | `/api/v1/sst/governanca/exigencias-treinamento` | `PageResponse<ExigenciaTreinamentoSstResponse>` | PageResponse | ✓ | ✗ |
| GET | `/api/v1/sst/governanca/matriz` | `PageResponse<MatrizTreinamentoSstResponse>` | PageResponse | ✓ | ✗ |
| GET | `/api/v1/sst/governanca/matriz/resumo` | `ResumoMatrizTreinamentoSstResponse` | — |  | ✗ |

### Módulo `status`

#### ModuleHealthController

`modules/status/infrastructure/web/ModuleHealthController.java` · base `/api/internal/observability/modules`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: detalhe `ModuleHealthResult`
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 0/1 (sem interface Doc)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| GET | `/api/internal/observability/modules/{module}` | `ModuleHealthResult` | — |  | ✗ |

### Módulo `telemetria`

#### TelemetriaMobileController

`modules/telemetria/infrastructure/web/TelemetriaMobileController.java` · base `/api/`

- (a) listagem: sem listagem
- (b) ordenação: n/a
- (c) DTOs: só Request (LoteRequest)
- (d) /options: não
- (e) status nas listagens: —
- (f) OpenAPI: 1/1 (via `TelemetriaMobileControllerDoc.java`)

| Método | Caminho | Retorno | Listagem | Pageable | Doc |
|---|---|---|---|---|---|
| POST | `/api/v1/telemetria/mobile` | `LoteResponse` | — |  | ✓ |
