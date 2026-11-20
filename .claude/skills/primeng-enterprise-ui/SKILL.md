---
name: primeng-enterprise-ui
description: Padrões de tela e componentes do ERP com Angular 22 + PrimeNG 22 — app shell (topbar/sidebar), páginas de listagem com p-table lazy, formulários, drawers de detalhe, dialogs, toasts, estados vazios/loading/erro. Use ao criar ou redesenhar qualquer tela, componente ou layout do frontend.
---

# PrimeNG Enterprise UI — padrões de tela

Complementa `erp-design-system` (tokens/tema). Aqui ficam **estrutura de tela e uso de componentes**.
Leia `references/patterns.md` para os blueprints completos com código.

## Antes de escrever código

1. Leia a skill `erp-design-system` se ainda não leu nesta sessão.
2. Use o MCP `primeng` para confirmar API do componente (inputs, templates, `pt`) — o PrimeNG 22 removeu e transformou em signal várias propriedades (guia `v22` no MCP). Não chute a API.
3. Use o MCP `angular-cli` (`get_best_practices`, `search_documentation`) para dúvidas de Angular 22.
4. Procure um componente equivalente já existente no `@geo/ui` (`src/app/design-system/`) antes de criar outro. Features consomem só o `@geo/ui`; `primeng/*` direto só nos casos registrados em `docs/design-system/prime-ng-coverage.md`.

## Convenções Angular 22 (obrigatórias)

- Componentes standalone, app **zoneless**. No Angular 22 o OnPush é o padrão; os componentes antigos que dependiam do comportamento anterior foram migrados para `ChangeDetectionStrategy.Eager` — não use `Eager` em componente novo.
- `input()`, `output()`, `model()`, `computed()`, `signal()`, `linkedSignal()`; DI com `inject()`.
- Control flow `@if / @for (track …) / @switch / @defer`. Nada de `*ngIf`/`*ngFor`.
- Dados remotos: `httpResource()` / `resource()` ou service com signals. Evite `subscribe` manual em componente.
- Formulários: Reactive Forms tipados (Signal Forms são estáveis no v22, mas não introduza sem combinar).
- Nada de `@angular/animations`, `provideAnimationsAsync`, `showTransitionOptions`/`hideTransitionOptions` (removidos no PrimeNG 22, que anima com CSS).
- Imports de componente PrimeNG individuais (`import { TableModule } from 'primeng/table'`), nunca barrels gigantes.
- Templates do PrimeNG com variável de template (`<ng-template #body let-row>`); `pTemplate` foi removido no v22. Seletores sempre em kebab-case (`p-inputnumber`, não `p-inputNumber`).
- PrimeNG 22: nos componentes cujo host é a raiz (`p-table`, `p-select`, `p-datepicker`, `p-inputnumber`, `p-avatar`, `p-skeleton`…) use `class`, não `styleClass` — o atributo `styleClass` estático é ignorado em silêncio. Propriedades dos componentes são signals: em código e testes leia `dialog.visible()`, `picker.overlayVisible()`.

## Anatomia padrão de página

```
┌ Topbar 48px: breadcrumb · busca global (Ctrl+K) · empresa/filial · notificações · avatar
├ Sidebar 232px (recolhível 52px): grupos por módulo, ícone 16px + label 14px
└ Conteúdo (padding 20px)
   ├ PageHeader: título 18px/600 · subtítulo muted · ações à direita (primária por último)
   ├ Toolbar de filtros (inputs size="small", 28px) · chips de filtros ativos · "Limpar"
   └ Painel (borda 1px, raio 8px) com p-table / formulário / conteúdo
```

## Regras de componentes

**Tabelas (`p-table`)** — o coração do ERP
- Sempre `[lazy]="true"` para listas de backend; paginação/ordenação/filtro no servidor (contrato na skill `spring-ui-api-contract`).
- `size="small"`, `[rowHover]="true"`, `scrollable` com `scrollHeight="flex"` dentro de container de altura fixa; cabeçalho fixo.
- `dataKey` sempre definido. Seleção por checkbox na 1ª coluna; ações em massa aparecem numa barra contextual quando há seleção.
- Coluna de ações: última, largura fixa, botões `text` + `rounded` só ícone, com `pTooltip`; ou um único menu "⋯".
- Números/moeda: classe `t-num`, alinhar à direita, `CurrencyPipe` com `'BRL'` e locale `pt-BR`. Datas: `dd/MM/yyyy` (e `HH:mm` se relevante).
- Status: `p-tag` com `severity` mapeado por enum (ver patterns). Nunca colorir a linha inteira.
- Loading: `[loading]` + template de skeleton nas linhas; vazio: template `emptymessage` com ícone, frase curta e ação.
- Colunas configuráveis (mostrar/ocultar, ordem) e densidade persistidas por usuário quando a tela tiver > 8 colunas.

**Formulários**
- Grid de 12 colunas (CSS grid), labels acima do campo (13px/500), gap 12×16px.
- Seções com título `t-section-title` e divisor sutil; formulários longos ganham navegação lateral por âncoras.
- Erro de validação: borda `invalid` + `<small>` 12px abaixo; erros do backend (ProblemDetail `errors[]`) mapeados para o campo.
- Barra de ações fixa no rodapé do painel (sticky): "Cancelar" (text) à esquerda da ação primária. Atalho Ctrl+S.
- `p-floatlabel` NÃO — labels fixos acima são mais densos e escaneáveis em ERP.

**Detalhe / edição rápida**: `p-drawer` à direita (largura 480–640px) para ver/editar sem perder a lista. Página dedicada só para entidades complexas.

**Dialogs**: apenas para confirmações e formulários curtos (≤ 6 campos). `p-confirmdialog` para ações destrutivas, com o nome do item no texto e botão `severity="danger"`.

**Feedback**: `p-toast` no canto inferior direito, 4s, texto curto ("Pedido 1042 salvo"). Erros de servidor sem campo → toast `error` com `detail` do ProblemDetail.

**Menus e navegação**: `p-menu`/`p-tieredmenu` para ações; `p-tabs` para sub-áreas de uma entidade; breadcrumb sempre presente.

**Atalhos**: Ctrl+K busca/comando global, `/` foca o filtro da tabela, Esc fecha drawer/dialog, Ctrl+S salva formulário.

## Customização visual

Ordem: token do preset → token de componente → `pt` (pass-through) → classe CSS na camada `app`.
Para variações recorrentes (ex.: tabela "ultra-densa"), crie um wrapper no `@geo/ui` (`src/app/design-system/`) em vez de repetir `pt` em cada tela.
