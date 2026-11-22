# Prompt para o próximo agente — finalizar o app de campo e Obras offline

Você vai trabalhar **sozinho e sem parar** até concluir todas as frentes abaixo. O usuário saiu e espera encontrar tudo pronto,
testado e commitado. Não peça confirmação: quando houver dúvida, tome a decisão mais simples que respeite as regras abaixo,
registre-a no `design.md` da change correspondente (seção "Decisões") e siga. Só pare se algo for destrutivo/irreversível fora
do repositório (deploy, push, banco remoto) — isso você **não** faz.

## Onde você está
- Monorepo `C:\Users\Thalisson\Documents\nexo`, branch **`feat/app-campo`** (commits locais, sem push). Último commit: `f96af328`.
- Leia antes de tudo: `CLAUDE.md` e `AGENTS.md` da raiz, `backend/CLAUDE.md` + `backend/AGENTS.md`, `frontend/CLAUDE.md`,
  `mobile/CLAUDE.md` (reescrito e atual), e as duas changes OpenSpec:
  - `openspec/changes/identidade-visual-app-campo/` (redesign do app — frentes 0, 1 quase prontas)
  - `openspec/changes/execucao-campo-obras/` (Obras 100% offline — nada implementado ainda)
  Os `tasks.md` dizem o que está feito (`[x]`) e o que falta (`[ ]`). Marque cada tarefa ao concluir.
- Plataforma Windows; shell Git Bash. **Atenção:** heredoc com aspas simples dentro de `python - <<'EOF'` às vezes quebra no
  tool de shell — para scripts de edição maiores, grave o `.py` no scratchpad e rode `python arquivo.py`.

## Decisões do usuário (não reabrir)
- App de campo é **PWA** (sem Capacitor, sem loja). ~70% tablet (deitado e em pé), também celular; Android e iPhone.
- **Só o encarregado** usa o app; participantes assinam a APR na tela dele. Equipes de Obras são separadas das comerciais.
- O fluxo **comercial saiu do app** (notas, Serviços, meta) e o **pedido de material saiu do app**: a equipe de campo
  **não solicita material** — ele vem da programação dos pontos ou de solicitação manual no web. O app mostra só o material
  previsto e o que falta no caminhão. Não recrie nada disso.
- Diretriz central: **facilitar tudo para a equipe de campo** — o app diz o próximo passo, pré-preenche o que o sistema sabe,
  agrupa por ponto ("Tudo feito"), nunca trava por falta de rede; foto faltando **avisa e vira pendência, não bloqueia**.
- No processo de Obras o web (supervisor/gestor) **só programa e analisa**; turno, APR, apontamento, ocorrência e relatório são
  da equipe pelo app. Visita prévia, As Built e book: supervisor pelo web e pelo app.
- Identidade visual do app = marca GEO do web em **escala de toque** (texto 15–16 px, alvos ≥ 48 px); tablet deitado usa barra
  lateral e lista + detalhe (`geo-lista-detalhe`, `LayoutService`). Use os componentes de `mobile/src/app/ui/` (fotos com
  carimbo, folha, seletor, segmentado, passos `.geo-passos`, interruptor `.geo-interruptor`, `ToastService.desfazer`,
  estado de envio). Catálogo em `/catalogo`.
- White label: nenhum nome/logo de empresa. Textos e identificadores em pt-BR. Bancos IndexedDB `ces-field-db` /
  `ces-field-sessao`, travas entre abas e o host `ces-backend.railway.internal` mantêm o nome (`renomear-geo: manter`).

## O que entregar (nesta ordem)

### 1. Backend — frente A de `execucao-campo-obras` (Spring Boot, módulo `obras` + `sincronizacao` + IAM)
A.1–A.9, A.11, A.12 do `tasks.md` (A.10 está riscada). Siga `backend/CLAUDE.md` (Rich Domain Model, Flyway na próxima versão
livre — confira a maior `V*.sql` existente —, ProblemDetail, testes). Pontos-chave:
- Comandos de campo com **id gerado no aparelho** e idempotência (mesmo id + mesmo conteúdo devolve o existente; conteúdo
  diferente → 409/422 com ProblemDetail).
- Liberação avaliada pela **data/hora de origem** do aparelho: APR → conclusão → apontamento enviados juntos à noite funcionam.
- Comando **"ponto inteiro"**; chegada/saída na obra; GPS + precisão + hora do aparelho e do servidor nos registros.
- `GET /v1/obras/campo/pacote?desde=` restrito à equipe do usuário (403 para outra equipe); PDFs por hash.
- Tipos `OBRA_*` no envio durável com adaptadores e diagnóstico.
- Endereço/referência na obra; horário e número da manobra na programação com desligamento (com campos no web).
- Perfil "Equipe de Obras" com `obras:turno:write` e `obras:execucao:write`.
- Testes: `cd backend && ./mvnw test -Dtest=...` dos testes novos e dos que você tocar; ao final da frente, `./mvnw test` completo.
- Commit: `feat(obras): contrato offline de campo (...)`.

### 2. App — frentes B, C, D de `execucao-campo-obras` (`mobile/`)
Perfil/abas de Obras (Hoje, Obras, Material, Frota, Conta); tabelas offline (bump do `dbVersion` com migração Dexie);
PDFs/fotos em OPFS com reserva em IndexedDB + `navigator.storage.persist()`; pacote automático e "Pronto para trabalhar sem
sinal"; fila de Obras com ordem por obra e dependência APR → apontamento; **Hoje guiado**; abrir turno pré-preenchido;
**ficha da obra** (endereço, "Como chegar" abrindo o app de navegação, programação, material previsto × saldo, anexos);
chegada/saída; **APR em passos** com sugestões por condição, assinatura dos participantes e "Sem condição de executar";
**execução sobre o projeto em PDF** (pontos coloridos, "Tudo feito", parcial, duas colunas no tablet com `geo-lista-detalhe`);
**fotos do modelo com carimbo** e pendências; ocorrências (inclusive falta de material); obra não programada; As Built e
equipamentos com leitura de série/QR; relatório diário montado; avisos de reprogramação (Web Push + ao abrir);
telas do supervisor (visita prévia, As Built, book, acompanhamento das equipes).
Mock da API em `mobile/e2e/support/mock-api.ts`: acrescente as rotas de Obras e escreva e2e para cada fluxo (turno → chegada
→ APR → "Tudo feito" → fotos → relatório, **todo sem rede** e enviando uma única vez ao reconectar; conflito por programação
cancelada; app morto no meio da APR volta ao mesmo passo).
Commits por bloco (`feat(mobile): ...`).

### 3. Web — frentes E e F (`frontend/`, consumindo só `@geo/ui`)
Revisão de fotos (aprovar/reprovar com motivo, inconformidades, ranking por equipe, relatório detalhado só com aprovadas) e
status em tempo real das equipes (cálculo no backend, exibição na central/dashboard de turnos). Siga as skills
`primeng-enterprise-ui` e `erp-design-system`; listagens com `p-table` lazy + `PageResponse`. Testes específicos com
`npx vitest run <arquivo>` (não rode `ds:check` nem `verify:design-system`: são pesados e o usuário pediu só testes do que mudou).

### 4. Redesign — o que falta de `identidade-visual-app-campo`
1.4/1.5 restantes (puxar para atualizar, ação por arrasto com alternativa visível), 1.8 (FAB na barra lateral no tablet
deitado), 2.1, 2.3–2.6 (migrar Hoje, Conta, Material/saldo/transferências, Frota, Segurança, Almoxarifado e Encerramento para
os componentes novos, sem mudar regras), 3.1 (lint que barra cor fixa/`!important` fora dos tokens), 3.2, 3.4.

## Regras de qualidade (todas obrigatórias)
- **Nada fica vermelho.** No app: `cd mobile && npm run build`, `npx ng test --watch=false` e a bateria e2e completa
  `npx playwright test e2e/characterization e2e/piloto e2e/fase4 e2e/sw e2e/a11y e2e/visual` (Android e iOS) **verdes** antes
  de cada commit que toque o app. Hoje passam 132 e 4 são pulados de propósito. Qualquer falha é regressão: ache a causa (os
  últimos "flaky" eram defeito real ou teste mal montado), não aumente timeout às cegas.
- Teste visual: depois de mudança visual revisada, `npx playwright test e2e/visual --update-snapshots`.
- Toda mudança de UI termina com screenshots claro/escuro em celular, tablet em pé e deitado
  (`ETAPA=<nome> npx playwright test e2e/support/redesign-shots.spec.ts --project=android` → `docs/redesign/mobile/<etapa>/`;
  inclua as telas novas de Obras nesse roteiro) e revisão pelo subagente `ui-reviewer`; corrija bloqueantes e importantes.
- Não coloque nada do fluxo comercial nem pedido de material nos testes ou capturas.
- `openspec validate <change> --strict` deve passar; mantenha `tasks.md` e `design.md` atualizados.
- Commits pequenos e frequentes em `feat/app-campo`, mensagens em pt-BR terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Não faça push, deploy nem toque em bancos/serviços remotos.**
- Ambiente local: o backend do Nexo roda na porta **8092** sobre o container **`nexo-db`** (nunca use `ces-db` nem outras
  portas: são de outros checkouts da máquina — não os pare). Front em 4200. Login de teste USRADMIN pelo `backend/.env`.
  Massa fictícia: obras 7000001 a 7000003, equipes `FIC-*`, programações #1 a #17. O backend roda com devtools: compilar
  reinicia e aplica migrações novas no `nexo-db`.
- Upload em teste: o `backend/.env` aponta para o bucket real do R2 — para fotos de teste, sobrescreva `R2_ENDPOINT`,
  `R2_BUCKET` e as chaves com um MinIO descartável (`quay.io/minio/minio`) numa instância em outra porta. Nunca grave arquivo
  de teste no bucket real.

## Ao terminar
Escreva `docs/redesign/mobile/RELATORIO-FINAL.md` com: o que foi entregue por frente (com commits), decisões tomadas sozinho,
o que ficou de fora e por quê, resultado final dos testes (unitários, e2e app, testes do backend e do web) e os caminhos das
capturas. Atualize `mobile/CLAUDE.md`, os `tasks.md` das duas changes e o roteiro do sistema (`docs/ROTEIRO_DE_USO_NEXO.md`:
o app deixa de estar "em desenvolvimento" nas partes entregues).
