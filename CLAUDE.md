# ERP — instruções para o Claude Code

@AGENTS.md

As instruções de cada aplicação continuam valendo: `frontend/CLAUDE.md` + `frontend/AGENTS.md` e `backend/CLAUDE.md` + `backend/AGENTS.md`.

## Stack
- Frontend: Angular 21.2 (standalone, signals, zoneless, OnPush) + PrimeNG 21.1.3 (styled mode, `@primeuix/themes` 2.0.3), Tailwind CSS v4 — caminho: `frontend/`
- Backend: Java 21 + Spring Boot 4.0.3 (Spring Modulith), PostgreSQL 17.5 — caminho: `backend/`
- Build: `npm` (npm 11) no front / Maven (`./mvnw`, no Windows `mvnw.cmd`) no back

## Redesign em andamento
Estamos migrando o ERP para uma identidade **empresarial compacta e moderna** (densa, neutra, um acento, tipografia Inter, dark mode).
Antes de qualquer trabalho visual, use as skills do projeto:

| Tarefa | Skill |
|---|---|
| Tema, cores, tipografia, densidade, preset PrimeNG, CSS global | `erp-design-system` |
| Criar/redesenhar tela, tabela, formulário, layout | `primeng-enterprise-ui` |
| Controller, DTO, paginação, erros, OpenAPI | `spring-ui-api-contract` |
| Planejar/executar redesign, revisão visual | `ui-redesign-workflow` + subagente `ui-reviewer` |
| Angular em geral (oficiais) | `angular-developer`, `angular-new-app` |

### Como o kit convive com o Design System existente
- **Fica:** as features consomem só o `@geo/ui` (`@geo/ui`, `@geo/ui/*`), implementado em `frontend/src/app/design-system/`. Os blueprints das skills que importam `primeng/*` direto valem **dentro** do `@geo/ui`, não nas features. Componentes base novos (PageHeader, EmptyState, FilterBar…) entram no `@geo/ui`, não em `src/app/shared/ui/`.
- **Pode mudar:** o visual atual (preset `geoPreset` sobre Lara em `design-system/core/theme/geo-preset.ts`, fonte Manrope, tokens `--geo-*`) pode ser substituído pela identidade do kit (Aura + Inter + tokens compactos). Faça a troca dentro do design system, mantendo a API pública do `@geo/ui`.
- **PrimeNG vai subir de versão.** Ao migrar para o PrimeNG 22, o `@primeuix/themes` passa para 3.x e o preset tem de ser convertido do formato `colorScheme.light/dark` para `light-dark()`. Até lá, use themes 2.x.

## Regras inegociáveis
- Confirme APIs e nomes de token do PrimeNG no MCP `primeng`; dúvidas de Angular no MCP `angular-cli`. Não invente API.
  - O MCP `primeng` documenta o **PrimeNG 22.x** (a linha 21.x do `@primeng/mcp` não inicia). Enquanto o projeto estiver no 21, confira no `node_modules/primeng` qualquer API marcada como nova ou alterada no 22.
- Sem `::ng-deep`, `!important`, hex/rgb literal fora do preset, `*ngIf/*ngFor`, `@angular/animations`, `provideAnimationsAsync`.
- Listagens: `p-table` lazy + `PageResponse` do backend. Erros: ProblemDetail (RFC 9457) com `errors[]` por campo.
- Toda mudança de UI termina com screenshot (Playwright) light + dark e revisão pelo `ui-reviewer`.
- Textos de interface em pt-BR. **Código e identificadores também em pt-BR** (padrão atual: `desativar()`, `movimentarEstoque()`, `ContextoObras`), com sufixos técnicos em inglês (`UseCases`, `Service`, `Controller`, `Dto`). Não traduza nomes existentes.
- **Não é multiempresa.** Cada implantação atende uma única empresa (produto white label): não há tenant, empresa nem filial no modelo. O acesso é resolvido pelas permissões do usuário no contexto de segurança (JWT; no front, `route.data.permission` no `authGuard`). Centro de custo e base operacional são recortes organizacionais usados como filtros de consulta, não escopo de segurança. Se algum dia virar multiempresa, o escopo virá do contexto de segurança, nunca de parâmetro livre.
- White label: não use nome, logo ou mascote de empresa em código, textos ou dados.

## Comandos
- Front (em `frontend/`): dev `npm start` (http://localhost:4200, proxy para a API) · build `npm run build` · testes `npm test` (Vitest) · um arquivo `npx vitest run <caminho>.spec.ts` · e2e `npm run test:e2e` (Playwright)
- Design system: `npm run ds:check` e `npm run verify:design-system` (pesados; rode só quando pedido ou antes de concluir mudança de DS)
- Gerar client da API: **pendente** — não existe script. O backend já expõe OpenAPI via springdoc 3.0.2 (`/v3/api-docs`); quando for criado, o script será `npm run api:gen`.
- Back (em `backend/`): `./mvnw spring-boot:run` · testes `./mvnw test` (um teste: `./mvnw test -Dtest=NomeDoTeste`)

## Estrutura (front)
- `src/app/design-system/` — Design System (`@geo/ui`): tema/preset em `core/theme/`, tokens em `styles/tokens.css`, componentes base
- `src/app/core/` — services (offline-first via `BaseService`/`SyncService`), guards, interceptors, models
- `src/app/features/{modulo}/` — telas por módulo
- `src/app/api/generated/` — client gerado do OpenAPI (quando existir; não editar)
- `docs/redesign/` — inventário e screenshots do redesign
