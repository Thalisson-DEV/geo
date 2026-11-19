---
name: spring-ui-api-contract
description: Contrato entre o backend Spring Boot e o frontend Angular/PrimeNG do ERP — paginação/ordenação/filtro compatíveis com p-table lazy, erros RFC 9457 (ProblemDetail) com erros por campo, DTOs de listagem enxutos, enums com label/severity, OpenAPI e geração de client TypeScript. Use ao criar ou alterar controllers, DTOs, exception handlers, endpoints de listagem/formulário ou quando o frontend precisar de dados num formato novo.
---

# Contrato API ↔ UI

O redesign do frontend só fica consistente se o backend entregar dados **no formato que a UI consome sem gambiarra**.
Esta skill define esse contrato. Código completo em `references/java-snippets.md`.

## Regras

### Listagens (alimentam `p-table` lazy)
- `GET /api/v1/{recurso}?page=0&size=25&sort=campo,asc&q=texto&status=X&…`
- Resposta sempre `PageResponse<T>`: `{ content: T[], page: { number, size, totalElements, totalPages } }`.
  (Equivale ao `PagedModel` do Spring Data com `@EnableSpringDataWebSupport(pageSerializationMode = VIA_DTO)`. Nunca serialize `PageImpl` direto.)
- `size` máximo 200 (configure `spring.data.web.pageable.max-page-size`). Default 25.
- `sort` só aceita campos de uma **whitelist** por recurso (mapeia nome da coluna da UI → propriedade/expressão JPA). Campo inválido → 400 ProblemDetail.
- Linha de listagem = **DTO de listagem próprio** (`PedidoRow`), plano e enxuto: só as colunas da tabela, com nomes já resolvidos (`clienteNome`, não `cliente: {…}`). Projeção JPQL/record ou query nativa — nunca entidade com lazy loading.
- Filtros complexos via `Specification` ou Querydsl; busca textual `q` em 2–4 colunas indexadas (considere `pg_trgm` no PostgreSQL).
- Multiempresa: o escopo de empresa/filial vem do contexto de segurança (header/claim), nunca de parâmetro livre que o usuário possa trocar.

### Detalhe e formulário
- `GET /{id}` devolve `XxxDetail`; `POST`/`PUT` recebem `XxxForm` (records com Bean Validation). Entidade nunca sai do controller.
- `PUT` retorna o `Detail` atualizado (a UI não precisa refazer GET). Use `version` (optimistic locking) e devolva 409 em conflito.
- Endpoints de opções para selects: `GET /api/v1/{recurso}/options?q=` → `[{ value, label, hint? }]`, limitado a 50.

### Enums e status
- Serialize enums de status como objeto: `{ "code": "APROVADO", "label": "Aprovado", "severity": "success" }`.
  `severity` ∈ `success | info | warn | danger | secondary | contrast` (valores do `p-tag`).
- Ofereça `GET /api/v1/meta/enums/{nome}` para popular filtros sem duplicar labels no front.

### Erros — RFC 9457 ProblemDetail
- `spring.mvc.problemdetails.enabled=true` + `@RestControllerAdvice` estendendo `ResponseEntityExceptionHandler`.
- Validação → 400 com `type`, `title`, `status`, `detail` e extensão `errors: [{ field, message, code }]`. `field` usa o mesmo caminho do FormControl (`endereco.cep`).
- Regras de negócio → 422 com `code` estável (ex.: `PEDIDO_JA_FATURADO`) e `detail` em pt-BR pronto para toast.
- 404/409/403 sempre ProblemDetail. Nunca stack trace; inclua `traceId` para suporte.
- Mensagens em pt-BR via `messages.properties` (ValidationMessages).

### Formatos
- Datas: ISO-8601 (`LocalDate` → `2026-11-19`, `Instant`/`OffsetDateTime` com offset). A UI formata para `dd/MM/yyyy`.
- Dinheiro: `BigDecimal` serializado como número com escala 2 (ou string se houver risco de precisão no JS — decida e documente por projeto). Nunca `double`.
- IDs: UUID ou Long, consistente no projeto inteiro.
- CNPJ/CPF/CEP: sem máscara na API; a UI aplica máscara.

### OpenAPI → client TypeScript
- springdoc-openapi (versão compatível com o seu Spring Boot) expõe `/v3/api-docs`.
- Gere o client no front (ex.: `@hey-api/openapi-ts`, `orval` ou `openapi-generator` `typescript-angular`) em `src/app/api/generated/` — nunca editar à mão. Script `npm run api:gen`.
- Todo endpoint com `@Operation(summary=…)`, DTOs com `@Schema` nos campos não óbvios, e os enums de status expostos no schema.

### Performance percebida (o "moderno" também é velocidade)
- Listagens < 300ms p95: índices nas colunas de filtro/ordenação, `count` otimizado (ou `Slice` + "carregar mais" em tabelas gigantes).
- ETag/`Cache-Control` em endpoints de metadados e opções.
- Exportação (CSV/XLSX) assíncrona para > 10k linhas, com notificação quando pronta.

## Checklist ao tocar num endpoint
- [ ] DTO de listagem/detalhe/form separados, records imutáveis
- [ ] Whitelist de ordenação e `max-page-size`
- [ ] Erros como ProblemDetail com `errors[]` por campo
- [ ] Enum de status com `label` e `severity`
- [ ] Escopo multiempresa aplicado pelo contexto de segurança
- [ ] OpenAPI anotado e client regenerado (`npm run api:gen`)
- [ ] Teste `@WebMvcTest` cobrindo 200, 400 (validação) e 422/404
