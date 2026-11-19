# Blueprints de tela — Angular 21 + PrimeNG 21

Código de referência. Confirme APIs no MCP `primeng` antes de copiar — ajuste nomes ao projeto.

## 1. app.config.ts

```ts
import { ApplicationConfig, LOCALE_ID, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { ErpPreset } from './theme/erp-preset';
import { PT_BR } from './theme/primeng-pt-br'; // traduções do PrimeNG (datas, filtros, paginador)
import { routes } from './app.routes';
import { problemDetailInterceptor } from './core/http/problem-detail.interceptor';

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(), // default em apps novos do v21; explícito em apps migrados
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideHttpClient(withFetch(), withInterceptors([problemDetailInterceptor])),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    providePrimeNG({
      ripple: false,
      translation: PT_BR,
      theme: {
        preset: ErpPreset,
        options: {
          darkModeSelector: '.app-dark',
          cssLayer: { name: 'primeng', order: 'theme, base, primeng, app' },
        },
      },
    }),
  ],
};
```

## 2. Página de listagem (lazy table + filtros na URL)

```ts
@Component({
  selector: 'erp-pedidos-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TableModule, ButtonModule, TagModule, InputTextModule, IconFieldModule, InputIconModule,
            SelectModule, SkeletonModule, PageHeader, CurrencyPipe, DatePipe],
  templateUrl: './pedidos-list.html',
})
export class PedidosList {
  private api = inject(PedidosApi);
  private router = inject(Router);

  // estado vindo da URL (withComponentInputBinding)
  readonly page = input(0, { transform: numberAttribute });
  readonly size = input(25, { transform: numberAttribute });
  readonly sort = input<string>('criadoEm,desc');
  readonly q = input<string>('');
  readonly status = input<string | undefined>();

  readonly query = computed(() => ({
    page: this.page(), size: this.size(), sort: this.sort(), q: this.q(), status: this.status(),
  }));

  readonly result = httpResource<PageResponse<PedidoRow>>(() => this.api.listUrl(this.query()));
  readonly rows = computed(() => this.result.value()?.content ?? []);
  readonly total = computed(() => this.result.value()?.page.totalElements ?? 0);
  readonly selection = signal<PedidoRow[]>([]);

  onLazyLoad(e: TableLazyLoadEvent) {
    const size = e.rows ?? 25;
    const page = Math.floor((e.first ?? 0) / size);
    const sort = e.sortField ? `${e.sortField},${e.sortOrder === 1 ? 'asc' : 'desc'}` : this.sort();
    this.router.navigate([], { queryParams: { page, size, sort }, queryParamsHandling: 'merge' });
  }
}
```

```html
<erp-page-header title="Pedidos" subtitle="{{ total() }} registros">
  <p-button label="Exportar" icon="pi pi-download" severity="secondary" [text]="true" size="small" />
  <p-button label="Novo pedido" icon="pi pi-plus" size="small" routerLink="novo" />
</erp-page-header>

<div class="erp-panel list-panel">
  <div class="toolbar">
    <p-iconfield>
      <p-inputicon class="pi pi-search" />
      <input pInputText pSize="small" placeholder="Buscar por número, cliente…" [value]="q()"
             (input)="search($any($event.target).value)" />
    </p-iconfield>
    <p-select [options]="statusOptions" [ngModel]="status()" (ngModelChange)="filterStatus($event)"
              placeholder="Status" [showClear]="true" size="small" />
  </div>

  <p-table [value]="rows()" [lazy]="true" (onLazyLoad)="onLazyLoad($event)"
           [paginator]="true" [rows]="size()" [first]="page() * size()" [totalRecords]="total()"
           [rowsPerPageOptions]="[25, 50, 100]" [loading]="result.isLoading()"
           dataKey="id" size="small" [rowHover]="true" [scrollable]="true" scrollHeight="flex"
           [(selection)]="selection" [showLoader]="false">
    <ng-template #header>
      <tr>
        <th style="width:2.5rem"><p-tableHeaderCheckbox /></th>
        <th pSortableColumn="numero">Nº <p-sortIcon field="numero" /></th>
        <th pSortableColumn="cliente.nome">Cliente <p-sortIcon field="cliente.nome" /></th>
        <th pSortableColumn="criadoEm">Data <p-sortIcon field="criadoEm" /></th>
        <th>Status</th>
        <th class="t-num" pSortableColumn="valorTotal">Total <p-sortIcon field="valorTotal" /></th>
        <th style="width:3rem"></th>
      </tr>
    </ng-template>
    <ng-template #body let-row>
      <tr>
        <td><p-tableCheckbox [value]="row" /></td>
        <td class="mono">{{ row.numero }}</td>
        <td>{{ row.clienteNome }}</td>
        <td>{{ row.criadoEm | date: 'dd/MM/yyyy' }}</td>
        <td><p-tag [value]="row.status.label" [severity]="row.status.severity" /></td>
        <td class="t-num">{{ row.valorTotal | currency: 'BRL' }}</td>
        <td><p-button icon="pi pi-ellipsis-h" [text]="true" [rounded]="true" size="small"
                      ariaLabel="Ações" (onClick)="openMenu($event, row)" /></td>
      </tr>
    </ng-template>
    <ng-template #loadingbody>
      @for (i of [1,2,3,4,5,6,7,8]; track i) {
        <tr>@for (c of [1,2,3,4,5,6,7]; track c) { <td><p-skeleton height="0.9rem" /></td> }</tr>
      }
    </ng-template>
    <ng-template #emptymessage>
      <tr><td colspan="7">
        <erp-empty-state icon="pi pi-inbox" title="Nenhum pedido encontrado"
                         description="Ajuste os filtros ou crie um novo pedido." />
      </td></tr>
    </ng-template>
  </p-table>
</div>
```

```css
:host { display: flex; flex-direction: column; gap: var(--erp-gap); height: 100%; }
.list-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.toolbar { display: flex; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--p-content-border-color); }
```

## 3. Status → tag

O backend devolve `status: { code, label, severity }` (ver `spring-ui-api-contract`). Se o backend só manda o código, centralize o mapa:

```ts
export const PEDIDO_STATUS: Record<PedidoStatus, { label: string; severity: TagSeverity }> = {
  RASCUNHO:  { label: 'Rascunho',  severity: 'secondary' },
  PENDENTE:  { label: 'Pendente',  severity: 'warn' },
  APROVADO:  { label: 'Aprovado',  severity: 'success' },
  CANCELADO: { label: 'Cancelado', severity: 'danger' },
};
```

## 4. Formulário com erros do backend

```ts
// core/http/apply-problem-errors.ts
export function applyProblemErrors(form: FormGroup, problem: ProblemDetail) {
  for (const err of problem.errors ?? []) {
    const ctrl = form.get(err.field);
    if (ctrl) ctrl.setErrors({ ...(ctrl.errors ?? {}), server: err.message });
  }
  form.markAllAsTouched();
}
```

```html
<form [formGroup]="form" class="form-grid" (ngSubmit)="save()">
  <section class="col-12"><h3 class="t-section-title">Dados gerais</h3></section>
  <div class="field col-4">
    <label for="cnpj">CNPJ</label>
    <p-inputmask id="cnpj" mask="99.999.999/9999-99" formControlName="cnpj" [invalid]="invalid('cnpj')" />
    @if (error('cnpj'); as msg) { <small class="field-error">{{ msg }}</small> }
  </div>
  …
  <footer class="form-actions">
    <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="cancel()" />
    <p-button type="submit" label="Salvar" [loading]="saving()" />
  </footer>
</form>
```

```css
.form-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px 16px; padding: 16px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 13px; font-weight: 500; }
.field-error { font-size: 12px; color: var(--p-red-500); }
.form-actions { grid-column: 1 / -1; position: sticky; bottom: 0; display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 0 0; border-top: 1px solid var(--p-content-border-color); background: var(--p-content-background); }
.col-4 { grid-column: span 4; } .col-6 { grid-column: span 6; } .col-12 { grid-column: span 12; }
@media (max-width: 1024px) { .col-4, .col-6 { grid-column: span 12; } }
```

## 5. App shell

- `AppShell` com `<erp-topbar>`, `<erp-sidebar>` e `<router-outlet>`; grid `grid-template-columns: var(--erp-sidebar-w) 1fr; grid-template-rows: var(--erp-topbar-h) 1fr; height: 100dvh`.
- Sidebar: fundo `--p-surface-50` (light) / `--p-surface-950` (dark), item ativo com `--p-highlight-background` e barra 2px primary à esquerda; grupos colapsáveis por módulo; estado recolhido salvo em `localStorage` (try/catch).
- Topbar: fundo `--p-content-background`, borda inferior 1px; seletor de empresa/filial é um `p-select` compacto sempre visível em ERP multiempresa.
- Command palette (Ctrl+K): `p-dialog` sem header + `p-listbox` filtrável com rotas e ações recentes.

## 6. Empty state / page header (shared/ui)

```ts
@Component({
  selector: 'erp-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <i [class]="icon()" aria-hidden="true"></i>
      <p class="t-section-title">{{ title() }}</p>
      @if (description()) { <p class="t-muted t-small">{{ description() }}</p> }
      <ng-content />
    </div>`,
  styles: `.empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:40px 16px;text-align:center}
           .empty i{font-size:20px;color:var(--p-text-muted-color);margin-bottom:4px}`,
})
export class EmptyState {
  readonly icon = input('pi pi-inbox');
  readonly title = input.required<string>();
  readonly description = input<string>();
}
```
