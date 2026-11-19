---
name: ui-redesign-workflow
description: Processo para redesenhar o ERP tela a tela sem quebrar nada — inventário de telas, fundação (tema/shell), migração incremental por módulo, screenshots antes/depois com Playwright em light/dark e revisão visual. Use quando o pedido for "redesenhar", "modernizar", "migrar a tela X para o novo visual", "revisar visualmente" ou planejar o redesign.
---

# Workflow de redesign incremental

Redesign de ERP é maratona: dezenas de telas, usuários trabalhando todo dia. Nunca "big bang".

## Fase 0 — Inventário (uma vez)

1. Liste todas as rotas (`app.routes.ts` + lazy routes) e gere `docs/redesign/inventory.md` com: rota, módulo, tipo (listagem / formulário / detalhe / dashboard / outro), componentes PrimeNG usados, uso de CSS custom/`::ng-deep`, prioridade (uso × dor).
2. Marque 3 **telas de referência** (uma listagem densa, um formulário longo, um dashboard). Elas definem o padrão e servem de teste de regressão visual.

## Fase 1 — Fundação (um PR)

1. Aplicar `erp-design-system`: `erp-preset.ts`, `styles.css`, fonte Inter, `cssLayer`, dark mode (`.app-dark`) com toggle persistido.
2. Remover `provideAnimationsAsync`/`@angular/animations` se ainda existirem; remover CSS de tema legado (`primeng/resources/...`).
3. Novo app shell (topbar 48px, sidebar recolhível, breadcrumb).
4. Componentes base em `src/app/shared/ui/`: `PageHeader`, `EmptyState`, `FilterBar`, `StatusTag`, `FormSection`, `ConfirmAction`.
5. Screenshots "antes" das telas de referência ANTES de mergear (ver Fase 3).

## Fase 2 — Migração por módulo (um PR por módulo ou por 3–5 telas)

Para cada tela:
1. Ler a tela atual e anotar comportamento que não pode mudar (atalhos, regras, permissões).
2. Reestruturar para os blueprints de `primeng-enterprise-ui` (listagem lazy, formulário em grid, drawer).
3. Remover CSS local que só compensava o tema antigo; zero `::ng-deep`, zero `!important`, zero hex literal.
4. Se a tela precisar de dados em outro formato, ajustar o endpoint seguindo `spring-ui-api-contract` (mesmo PR ou PR irmão no backend).
5. Atualizar `inventory.md` (status: ✅ migrada).

## Fase 3 — Verificação visual (toda mudança de UI)

Com o servidor rodando (`ng serve` ou MCP `angular-cli` `devserver.start`) e o MCP/plugin Playwright:
1. Abrir a tela em 1440×900 e 1280×720, light e dark.
2. Capturar screenshots em `docs/redesign/shots/{tela}-{tema}-{largura}.png`.
3. Comparar com o "antes" e com as telas de referência.
4. Rodar o subagente `ui-reviewer` passando os caminhos das screenshots e a lista de arquivos alterados.
5. Corrigir os itens "bloqueante" do relatório antes de concluir.

## Critérios de pronto por tela
- [ ] Segue anatomia: PageHeader → filtros → painel
- [ ] Densidade: inputs/linhas 32px, filtros 28px
- [ ] Light e dark corretos; contraste AA
- [ ] Estados loading/vazio/erro implementados
- [ ] Navegável por teclado; foco visível
- [ ] Sem regressão funcional (testes passando; fluxo principal exercitado no navegador)
- [ ] `ng build` sem warnings novos
