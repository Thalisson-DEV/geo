---
name: primeng-enterprise-ui
description: Padrões de tela e componentes do ERP com Angular 21 + PrimeNG 21 — app shell (topbar/sidebar), páginas de listagem com p-table lazy, formulários, drawers de detalhe, dialogs, toasts, estados vazios/loading/erro. Use ao criar ou redesenhar qualquer tela, componente ou layout do frontend.
---

# PrimeNG Enterprise UI — padrões de tela

Complementa `erp-design-system` (tokens/tema). Aqui ficam **estrutura de tela e uso de componentes**.
Leia `references/patterns.md` para os blueprints completos com código.

## Antes de escrever código

1. Leia a skill `erp-design-system` se ainda não leu nesta sessão.
2. Use o MCP `primeng` para confirmar API do componente (inputs, templates, `pt`) — o PrimeNG 21 renomeou/deprecou várias propriedades. Não chute a API.
3. Use o MCP `angular-cli` (`get_best_practices`, `search_documentation`) para dúvidas de Angular 21.
4. Procure um componente equivalente já existente em `src/app/shared/ui/` antes de criar outro.

## Convenções Angular 21 (obrigatórias)

- Componentes standalone, `changeDetection: ChangeDetectionStrategy.OnPush`, app **zoneless**.
- `input()`, `output()`, `model()`, `computed()`, `signal()`, `linkedSignal()`; DI com `inject()`.
- Control flow `@if / @for (track …) / @switch / @defer`. Nada de `*ngIf`/`*ngFor`.
- Dados remotos: `httpResource()` / `resource()` ou service com signals. Evite `subscribe` manual em componente.
- Formulários: Reactive Forms tipados (ou Signal Forms se o projeto já adotou — são experimentais no v21; não introduza sem combinar).
- Nada de `@angular/animations`, `provideAnimationsAsync`, `showTransitionOptions`/`hideTransitionOptions` (sem efeito no PrimeNG 21).
- Imports de componente PrimeNG individuais (`import { TableModule } from 'primeng/table'`), nunca barrels gigantes.

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
Para variações recorrentes (ex.: tabela "ultra-densa"), crie um wrapper em `shared/ui/` em vez de repetir `pt` em cada tela.
