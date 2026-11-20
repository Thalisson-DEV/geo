# Brief para a migração por módulo (subagentes)

Você está migrando um módulo do ERP GEO para a identidade nova. Repositório: `C:\Users\Thalisson\Documents\nexo`
(front em `frontend/`), branch `redesign/full`. Leia antes: `CLAUDE.md` da raiz, `frontend/AGENTS.md`,
`docs/redesign/PROGRESS.md` (decisões D1–D15) e as skills `.claude/skills/erp-design-system/SKILL.md` e
`.claude/skills/primeng-enterprise-ui/SKILL.md`.

## O que já está feito globalmente (não refaça)
- Preset novo (aura-compat, neutros zinc, um acento azul), Inter, raiz 14px, controles 32px, dark mode `.app-dark`.
- `pi pi-*` já é desenhado como Lucide (pi-lucide.css). Tailwind slate/gray → zinc; bold → 600; `uppercase` neutralizado.
- Hex literais de CSS já viraram `var(--p-*)`; pesos > 600 → 600; textos < 12px → 12px.
- Telas de referência aprovadas: `/obras` (listagem), `/obras/nova` (form drawer), `/execucao/dashboard-operacional`.
  Prints em `docs/redesign/shots/depois/`. Siga o mesmo padrão: PageHeader → filtros → painel; tabela densa;
  cards só com borda (sem sombra em repouso); acento azul só em ação primária/foco/seleção; cor de status só em
  tags/ícones; nada de degradê, moldura decorativa ou fundo colorido grande.

## Seu escopo (RESTRITO)
- Edite SOMENTE arquivos dentro das pastas `frontend/src/app/features/<seus módulos>/` (inclui os `.spec.ts` delas).
- NÃO edite `design-system/`, `shared/`, `core/`, `styles.css`, `app.*`, nem o backend. Se precisar de algo lá,
  descreva no relatório (eu aplico).
- NÃO rode comandos git que alterem estado (commit, checkout, stash, reset, add). Eu integro e commito.
- NÃO mude regra de negócio, cálculo, permissão, fluxo de autorização, nem apague telas/funcionalidades.
- NÃO crie `::ng-deep`, `!important`, hex/rgb literal, `*ngIf/*ngFor`, `@angular/animations`.
- NÃO grave dados reais: não salve edições em registros existentes. Se precisar demonstrar salvar, crie um
  registro com nome começando por `[TESTE]` e informe no relatório (para eu apagar depois). Nunca exclua dados reais.
- Não dispare `alert/confirm/prompt` nativos.

## Ferramentas (rode em `frontend/`, com `export MSYS_NO_PATHCONV=1` e sua sessão `GEO_SHOTS_STATE=<arquivo>`)
- Prints: `node tools/redesign/shots.mjs <pasta> nome=/rota ...` (claro/escuro × 1440/1280; `GEO_SHOTS_WIDTHS=1440`
  e `GEO_SHOTS_THEMES=light` reduzem). Veja os PNG com a ferramenta Read. Rascunhos: na sua pasta temporária.
- Diagnóstico: `node tools/redesign/probe.mjs /rota "<expressão JS>"` — avalia na página e lista erros de console e
  respostas HTTP ≥ 400.
- Vídeo do fluxo: `node tools/redesign/gravar.mjs <saida.webm> <passos.json>` (veja o cabeçalho do script).
- O dev server já roda em http://localhost:4200 com hot reload. Backend em 8092. Se a sessão expirar (redireciona
  para /login), PARE e avise no relatório — não tente logar.
- Testes do módulo: `npx ng test --watch=false --include='src/app/features/<modulo>/**/*.spec.ts'` (precisa passar).
- Não rode `npm run build`, `npm test` completo, `ds:check` nem `verify:design-system` (pesados; eu rodo).

## Para cada tela do seu módulo
1. Print claro e escuro 1440 (inventário das rotas em `docs/redesign/inventory.md`).
2. Lente do especialista: densidade (linhas/inputs 32px, grade de 4px), hierarquia, uma ação primária, claro e
   escuro (texto ilegível? fundo branco no escuro? borda sumindo?), estados vazio/carregando/erro, foco visível,
   console sem erro novo e nenhuma requisição falhando (probe).
3. Corrija no código da tela: remova `::ng-deep`/`!important` que só compensavam o tema antigo; troque cores
   `var(--p-zinc-*)`/classes de cor fixas por tokens `--geo-*` quando houver problema no escuro; remova moldura
   decorativa, degradê, sombra em card em repouso, `uppercase`/`tracking-*` em rótulos; alinhe a anatomia ao das
   telas de referência. Use componentes do `@geo/ui` já existentes (geo-page-header, geo-filter-panel,
   geo-data-table, geo-status, geo-status-tag, geo-empty-state, geo-filter-bar, geo-form-*, geo-button...).
4. Lente do usuário: faça a tarefa principal (listar, filtrar, abrir, editar sem salvar dado real). Melhorias
   pequenas e seguras (foco, atalho, texto de erro melhor, coluna alinhada, estado vazio com ação, menos cliques):
   implemente. Grandes ou de regra de negócio: só relate.
5. Rode os testes do módulo.

## Evidência obrigatória do módulo
- 1 tela representativa: `docs/redesign/shots/depois/<modulo>-<tela>-{claro,escuro}-{1440,1280}.png`.
- 1 vídeo do fluxo principal (listar → filtrar → abrir → editar, sem salvar dado real):
  `docs/redesign/gifs/<modulo>-fluxo.webm`.

## Relatório final (máx. ~50 linhas, em pt-BR)
- Telas revisadas (rota → o que mudou) e telas que NÃO conseguiu migrar (motivo).
- Pedidos para o design system/shared (arquivo, problema, proposta).
- Oportunidades grandes (tela | problema | proposta | impacto alto/médio/baixo | esforço).
- Registros `[TESTE]` criados (se houver).
- Resultado dos testes do módulo e erros de console/HTTP que restaram.
