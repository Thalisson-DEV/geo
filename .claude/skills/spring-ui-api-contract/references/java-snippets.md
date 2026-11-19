# Snippets Java — contrato API ↔ UI

Baseado em Java 21+ e Spring Boot 3.3+/4.x. Ajuste pacotes ao projeto.

## PageResponse

```java
public record PageResponse<T>(List<T> content, PageMeta page) {
  public record PageMeta(int number, int size, long totalElements, int totalPages) {}

  public static <T> PageResponse<T> of(Page<T> p) {
    return new PageResponse<>(p.getContent(),
        new PageMeta(p.getNumber(), p.getSize(), p.getTotalElements(), p.getTotalPages()));
  }
}
```

Alternativa nativa: `@EnableSpringDataWebSupport(pageSerializationMode = PageSerializationMode.VIA_DTO)` e retornar `PagedModel<T>` — mesmo formato `{content, page}`.

## Whitelist de ordenação

```java
public final class SortWhitelist {
  private final Map<String, String> allowed; // campo da UI -> propriedade JPA

  public SortWhitelist(Map<String, String> allowed) { this.allowed = Map.copyOf(allowed); }

  public Pageable sanitize(Pageable in) {
    Sort sort = Sort.by(in.getSort().stream().map(o -> {
      String prop = allowed.get(o.getProperty());
      if (prop == null) throw new InvalidSortException(o.getProperty(), allowed.keySet());
      return new Sort.Order(o.getDirection(), prop);
    }).toList());
    return PageRequest.of(in.getPageNumber(), Math.min(in.getPageSize(), 200), sort);
  }
}

// uso
private static final SortWhitelist SORT = new SortWhitelist(Map.of(
    "numero", "numero", "cliente.nome", "cliente.nome", "criadoEm", "criadoEm", "valorTotal", "valorTotal"));
```

## Controller de listagem

```java
@RestController
@RequestMapping("/api/v1/pedidos")
@RequiredArgsConstructor
class PedidoController {
  private final PedidoQueryService queries;

  @Operation(summary = "Lista pedidos paginados")
  @GetMapping
  PageResponse<PedidoRow> list(PedidoFilter filter,
                               @PageableDefault(size = 25, sort = "criadoEm", direction = DESC) Pageable pageable) {
    return PageResponse.of(queries.list(filter, SORT.sanitize(pageable)));
  }
}

public record PedidoFilter(String q, PedidoStatus status, LocalDate de, LocalDate ate) {}

public record PedidoRow(UUID id, String numero, String clienteNome, LocalDate criadoEm,
                        StatusDto status, BigDecimal valorTotal) {}
```

## Enum com label/severity

```java
public enum UiSeverity { success, info, warn, danger, secondary, contrast }

public interface UiEnum { String label(); UiSeverity severity(); }

public enum PedidoStatus implements UiEnum {
  RASCUNHO("Rascunho", UiSeverity.secondary),
  PENDENTE("Pendente", UiSeverity.warn),
  APROVADO("Aprovado", UiSeverity.success),
  CANCELADO("Cancelado", UiSeverity.danger);

  private final String label; private final UiSeverity severity;
  PedidoStatus(String l, UiSeverity s) { label = l; severity = s; }
  public String label() { return label; }
  public UiSeverity severity() { return severity; }
}

public record StatusDto(String code, String label, UiSeverity severity) {
  public static StatusDto of(Enum<?> e) {
    var u = (UiEnum) e;
    return new StatusDto(e.name(), u.label(), u.severity());
  }
}
```

## ProblemDetail global

```java
@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

  @Override
  protected ResponseEntity<Object> handleMethodArgumentNotValid(
      MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest req) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Verifique os campos destacados.");
    pd.setTitle("Dados inválidos");
    pd.setType(URI.create("https://erp/errors/validation"));
    pd.setProperty("errors", ex.getBindingResult().getFieldErrors().stream()
        .map(f -> Map.of("field", f.getField(), "message", Objects.requireNonNullElse(f.getDefaultMessage(), "Inválido"),
                         "code", Objects.requireNonNullElse(f.getCode(), "invalid")))
        .toList());
    return ResponseEntity.badRequest().body(pd);
  }

  @ExceptionHandler(BusinessException.class)
  ProblemDetail business(BusinessException ex) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
    pd.setTitle("Operação não permitida");
    pd.setProperty("code", ex.code());
    return pd;
  }

  @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
  ProblemDetail conflict() {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
        "Este registro foi alterado por outro usuário. Recarregue para ver a versão atual.");
    pd.setTitle("Conflito de edição");
    return pd;
  }
}
```

`application.yml`:

```yaml
spring:
  mvc:
    problemdetails:
      enabled: true
  data:
    web:
      pageable:
        max-page-size: 200
        default-page-size: 25
```

## Interceptor Angular correspondente

```ts
export const problemDetailInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(MessageService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const pd = err.error as ProblemDetail | undefined;
      const hasFieldErrors = Array.isArray(pd?.errors) && pd!.errors.length > 0;
      if (!hasFieldErrors && err.status !== 401) {
        toast.add({ severity: 'error', summary: pd?.title ?? 'Erro', detail: pd?.detail ?? 'Falha inesperada.', life: 5000 });
      }
      return throwError(() => err); // o form trata errors[] com applyProblemErrors
    }),
  );
};
```
