---
name: erp-design-system
description: Identidade visual e design tokens do ERP (estilo empresarial compacto, inspirado em interfaces como a do Claude). Use SEMPRE antes de criar ou alterar tema, cores, tipografia, espaçamento, densidade, dark mode, preset do PrimeNG (definePreset/providePrimeNG), styles.css global ou qualquer CSS visual do frontend Angular.
---

# ERP Design System — compacto, sóbrio, moderno

Você está trabalhando no design system de um ERP SaaS (Angular 22 + PrimeNG 22 em styled mode, `@primeuix/themes` 3.x, backend Spring Boot).
No GEO, o design system é o `@geo/ui` (`frontend/src/app/design-system/`): as features só consomem o `@geo/ui`.
O objetivo é uma interface **empresarial, densa e calma**: muita informação por tela, pouco ruído visual,
hierarquia feita com tipografia e espaço — não com cor, sombra ou borda.

## Princípios (em ordem de prioridade)

1. **Densidade com respiro.** Linhas de tabela de 32px, inputs de 32px, texto base 14px. Compacto, nunca apertado.
2. **Neutros fazem 90% do trabalho.** Superfícies em escala neutra levemente quente; uma única cor de acento (primary) usada com parcimônia: ação primária, foco, seleção, link.
3. **Hierarquia tipográfica, não decorativa.** Pesos 400/500/600. Nada de 700+ em UI. Títulos de página 18–20px, não 28px.
4. **Bordas hairline, sombras quase inexistentes.** 1px em `surface-200` (light) / `surface-800` (dark). Sombra só em overlays (menus, dialogs, popovers).
5. **Raio pequeno e consistente.** 6px para controles, 8px para cards/painéis, 10–12px só para dialogs.
6. **Números são cidadãos de primeira classe.** `font-variant-numeric: tabular-nums` em tabelas, KPIs e campos numéricos; alinhar à direita.
7. **Estado sempre visível.** Hover, foco (anel de foco 2px no primary), disabled, loading (skeleton, não spinner em tela cheia), vazio e erro têm tratamento definido.
8. **Dark mode desde o dia 1.** Todo valor visual vem de token; nunca hex solto em componente.

## Onde as coisas vivem

| Arquivo | Conteúdo |
|---|---|
| `src/app/design-system/core/theme/` | o preset (`definePreset(<base>-compat, …)`) — fonte única dos tokens PrimeNG. No GEO é o `geo-preset.ts` |
| `src/app/app.config.ts` | `providePrimeNG({ theme: { preset, options: { darkModeSelector: '.app-dark', cssLayer: {...} } } })` |
| `src/styles.css` | reset leve, fonte, `html { font-size }`, camadas CSS, utilitários globais mínimos |
| `src/app/design-system/styles/tokens.css` | variáveis próprias do app (no GEO, `--geo-*`) que não existem no PrimeNG (ex.: altura do header, largura da sidebar) |

Templates prontos em `assets/erp-preset.ts` e `assets/styles.css` desta skill. Copie e adapte — não reescreva do zero.
Tabela completa de tokens (valores light/dark, escala tipográfica, espaçamento) em `references/tokens.md`.

## Regras de implementação

- **Versão do pacote de temas.** PrimeNG 22 → `@primeuix/themes` 3.x. Não existe mais `colorScheme`: cada token que muda por esquema usa `light-dark(valorClaro, valorEscuro)` no próprio token (formato do `assets/erp-preset.ts`, validado contra a 3.1.1). Quando só um lado muda, repita no outro o valor do preset base.
- **Densidade compacta por padrão: preset `-compat`.** O PrimeNG 22 calibra os presets para raiz de 16px; as variantes `aura-compat`, `lara-compat` etc. mantêm os tamanhos antigos, calibrados para raiz de 14px. Use sempre a variante compat (o GEO usa `lara-compat` com raiz de 13px). A PrimeTek mantém as compat até jun/2027: antes disso, migre para o preset padrão reproduzindo a densidade compacta nos tokens do próprio preset — nunca volte ao tamanho padrão.
- **Verifique nomes de token antes de escrever.** Os nomes de design tokens mudam entre versões. Se o MCP `primeng` estiver disponível, consulte o componente/token nele antes de criar ou mudar um override. Se um token não existir, não invente: use `pt` (pass-through) ou CSS na camada `app`.
- **Ordem de preferência para customizar:** (1) token semântico no preset → (2) token de componente no preset (`components.datatable…`) → (3) `pt` pass-through no componente → (4) CSS com classe própria na camada `app`. Nunca `::ng-deep` para tema; nunca `!important`.
- **Escala via root font-size.** O PrimeNG usa `rem`. A densidade global vem de `html { font-size: 14px }`. Não diminua padding componente a componente para compensar.
- **Cores:** primary é uma paleta completa 50–950 mapeada para primitivos (`{blue.600}` etc.). Superfícies via `semantic.surface`, com `light-dark()` nos tons que mudam por esquema. Cor de status (success/warn/danger/info) só em `p-tag`, `p-message`, ícones de status e validação — nunca em fundos grandes.
- **Tipografia:** Inter Variable (via `@fontsource-variable/inter`, self-hosted). Fallback `system-ui`. Mono: `JetBrains Mono` ou `ui-monospace` para códigos, IDs, chaves.
- **Ícones:** um único set em todo o app. Lucide (`@lucide/angular`), traço 1.75, tamanho 16px em controles e 14px inline. No GEO, sempre via `<geo-icon name="…">`, que registra os ícones em `design-system/icons/geo-icons.ts`. Se o projeto ainda usa PrimeIcons, não misture — migre tela a tela.
- **Movimento:** 120–160ms, `ease-out`. O PrimeNG 22 usa animações CSS nativas; não reintroduza `@angular/animations` nem `provideAnimationsAsync`. `showTransitionOptions`/`hideTransitionOptions` foram removidos no v22.
- **Acessibilidade:** contraste AA mínimo (4.5:1 texto, 3:1 bordas de controle e ícones significativos). Foco visível por teclado em tudo. Área clicável mínima de 24px mesmo em modo compacto.

## Checklist antes de concluir qualquer mudança visual

- [ ] Nenhum hex/rgb literal novo fora de `erp-preset.ts` / `tokens.css`
- [ ] Funciona em light **e** dark (`.app-dark` no `<html>`)
- [ ] Números tabulares e alinhados à direita onde aplicável
- [ ] Estados hover/focus/disabled/loading/empty/error cobertos
- [ ] Build passa (`ng build`) e nenhuma regressão visual nas telas de referência (ver skill `ui-redesign-workflow`)
