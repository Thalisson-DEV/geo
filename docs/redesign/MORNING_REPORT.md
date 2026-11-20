# Redesign do GEO — relatório da manhã (20/11/2026)

Branch **`redesign/full`** (a partir da `main` em 9d67b2b0). Nada foi enviado ao remoto; a `main` não foi tocada.

## Resumo (10 linhas)
1. Identidade nova no `@geo/ui`: preset sobre Aura compat com neutros **zinc** e **um acento azul**, fonte **Inter**, raiz 14px, controles de ~32px e escuro completo (`.app-dark`).
2. **Tipografia compacta**, a seu pedido no meio da noite: texto base 13px, rótulos 12px, título de página 16px (commit a041ddb0).
3. Os tokens `--geo-*` viraram camada de compatibilidade sobre os primitivos `--p-*`, e o preset passou a ser a fonte única de cor. 1.289 hex de CSS foram trocados por primitivos.
4. **Ícones:** os 6.522 usos de PrimeIcons agora desenham Lucide via máscara CSS gerada (`pi-lucide.css`), e a fonte PrimeIcons saiu do bundle.
5. **Shell:** topbar de 48px e sidebar neutra de 232px, com itens de 30px. Ctrl+K, tema claro/escuro e Ctrl+S já existiam e foram mantidos.
6. **Componentes novos no `@geo/ui`:** `geo-status-tag` (lê o `StatusDto` da API), `geo-empty-state`, `geo-filter-bar`, seletor de colunas persistido no `geo-data-table`, `align` por coluna, `.geo-cell-clamp` e `geoApplyServerErrors`.
7. **Backend:**
   - `errors[]` nos erros por campo (contrato RFC 9457);
   - 422 em regra de negócio;
   - ordenação inválida devolve 400, em vez do 500 de antes;
   - `StatusDto`/`UiSeverity` e `GET /api/v1/meta/enums/{nome}`;
   - textos de dashboard formatados em pt-BR.
8. **Telas:** as 3 de referência foram aprovadas pelo ui-reviewer, e as P1 de todos os módulos foram migradas por subagentes, com uma revisão do ui-reviewer por módulo.
9. **Bugs reais corrigidos de passagem:**
   - fundo transparente na primeira pintura;
   - `/ativos-min`, que sempre dava 400;
   - botão primário ilegível no escuro;
   - números crus nos textos dos dashboards.
10. **Verificações:** build, `npm test`, `ds:check` e e2e (ver a seção de verificações). Sem nenhum `::ng-deep` no SST; os `!important` que restam nas telas estão em `@media print`.

## Telas
**Referência (aprovadas pelo portão):** `/obras` (listagem densa), `/obras/nova` (formulário longo) e `/execucao/dashboard-operacional`.

**Migradas (P1):**

| Módulo | Telas migradas |
|---|---|
| Obras | ficha, turnos, medições, encerramento, programação (semana, mês, painel e histórico), pré-fechamento |
| Execução | comercial, turnos, metas físicas |
| Frota | ordens de serviço, veículos, abastecimentos, relatórios |
| Almoxarifado | solicitações técnicas; movimentações, saldos e relatórios revisados |
| DP | painel, novo desconto, lançamento e as filas |
| SST | inspeção (nova/editar/detalhe), evento (novo/editar/detalhe), construtor de formulário, 3 dashboards; CSS da governança |
| Financeiro | compras, pagamentos, aprovações, nova compra/pagamento, detalhe, dashboard |
| Chamados | fila, meus, detalhe |
| Notificações | mural, formulários de comunicado e automações (CSS) |
| Home e Bússola | home, Bússola |
| IAM | login, usuários, perfis, permissões, avaliações |
| RH/cadastros | 15 listagens |
| Outros | contrato, sincronismo, documentos legais |

**Não migradas, ou só com o efeito global do tema:**
- **Relatórios P2:** `/obras/encerramento/:id`, `/execucao/comercial/:id`, `/execucao/turnos/:id/detalhamento`, os relatórios de impressão da frota e os detalhes de solicitação do almoxarifado. Fica pendente o componente de página-relatório (O14).
- **Cadastros P3 e telas secundárias:** cerca de 40 telas da frota, os cadastros do almoxarifado e do SST, `/obras/:id/planejamento`, dashboard e documentos de chamados, preferências e comunicados. O motivo foi orçamento: o limite de uso foi atingido duas vezes durante a noite.
- **Sem acesso:** `/almoxarifado/solicitacoes`, a governança do SST e `/notificacoes/automacoes`. O USRADMIN local não tem a permissão, e mexer em permissões está proibido.
- `/manuais` redireciona para a home (rota oculta ou permissão).

Todas as telas recebem a identidade nova pelos efeitos globais: tema, tokens, Tailwind, ícones e tipografia.

## Evidências
- **Telas de referência, antes:** [obras-lista](shots/antes/obras-lista-claro-1440.jpg) · [obras-nova](shots/antes/obras-nova-claro-1440.jpg) · [dashboard](shots/antes/dashboard-operacional-claro-1440.jpg) (mais escuro e 1280 na mesma pasta).
- **Telas de referência, depois:** [obras-lista claro](shots/depois/obras-lista-claro-1440.png) / [escuro](shots/depois/obras-lista-escuro-1440.png) · [obras-nova claro](shots/depois/obras-nova-claro-1440.png) / [escuro](shots/depois/obras-nova-escuro-1440.png) · [dashboard claro](shots/depois/dashboard-operacional-claro-1440.png) / [escuro](shots/depois/dashboard-operacional-escuro-1440.png).
- **Uma tela por módulo:**
  - [Obras: ficha](shots/depois/obras-ficha-claro-1440.png)
  - [Execução: comercial](shots/depois/execucao-comercial-claro-1440.png)
  - [Frota: ordens de serviço](shots/depois/frota-ordens-servico-claro-1440.png)
  - [Almoxarifado: solicitações técnicas](shots/depois/almoxarifado-solicitacoes-tecnicas-claro-1440.png)
  - [DP: painel](shots/depois/dp-dashboard-claro-1440.png)
  - [SST: inspeção com checklist](shots/depois/sst-inspecao-checklist-escuro-1440.png)
  - [Financeiro: compras](shots/depois/financeiro-compras-claro-1440.png)
  - [Chamados: fila](shots/depois/chamados-fila-claro-1440.png)
  - [Notificações: mural](shots/depois/notificacoes-mural-claro-1440.png)
  - [RH: colaboradores (escuro)](shots/depois/rh-colaboradores-escuro-1440.png)
  - [Home](shots/depois/home-inicio-claro-1440.png)
  - [Bússola](shots/depois/bussola-inicio-claro-1440.png)

  Variantes claro/escuro e 1280 ficam em `shots/depois/`.
- **Vídeos dos fluxos (.webm):** o `gif_creator` do Chrome não ficou disponível. Ver o item "Chrome" em Riscos.
  - [obras](gifs/obras-fluxo.webm) · [ficha da obra](gifs/obras-ficha-fluxo.webm) · [execução](gifs/execucao-fluxo.webm)
  - [frota](gifs/frota-fluxo.webm) · [almoxarifado](gifs/almoxarifado-fluxo.webm) · [DP](gifs/dp-fluxo.webm)
  - [SST](gifs/sst-fluxo.webm) · [financeiro](gifs/financeiro-fluxo.webm) · [chamados](gifs/chamados-fluxo.webm)
  - [notificações](gifs/notificacoes-fluxo.webm) · [cadastros](gifs/cadastros-fluxo.webm)
  - Alguns passos de clique falharam na gravação: abrir linha em cadastros, "Próximo" no financeiro e "Ver turno" na execução. Nenhum vídeo salva dado.

## Decisões (uma linha cada)
| # | Decisão | Justificativa |
|---|---|---|
| D1 | Preset sobre `aura-compat`, não o Aura padrão | O Aura padrão supõe raiz de 16px; as telas têm centenas de medidas em rem. A migração está nas PENDÊNCIAS (prazo jun/2027). |
| D2 | Raiz 14px | Controles de 32px e o kit calibrado para 14px. |
| D3 | Inter self-hosted | Kit; a Manrope foi removida. |
| D4 | Neutros zinc e um acento azul (blue.600 = azul da marca) | "Neutra, um acento"; o âmbar deixou de ser acento. |
| D5 | Sidebar neutra, sem ladrilhos | O acento fica só no item ativo. |
| D6 | `--geo-*` apontam para primitivos `--p-*` | Os semânticos têm `light-dark()`, que o chart.js e o Leaflet não leem. |
| D7 | PrimeIcons por máscara Lucide em CSS | Um set de ícones na hora, sem reescrever 566 arquivos. |
| D8 | Validação pelo Playwright headless | O Chrome parou de renderizar capturas às 00:30 (tela do PC desligada). |
| D9 | `uppercase` do Tailwind neutralizado globalmente | Kit: nada em caixa alta. `.geo-caixa-alta` para exceções. |
| D10 | Hex trocado pelo primitivo mais próximo | Uma fonte de cor, preservando o claro/escuro. |
| D11 | IllegalState/Validation → 422 | Contrato; a fila offline trata todo 4xx igual. |
| D12 | Ordenação inválida → 400 no handler global | Elimina os 500 de 92 controllers de uma vez; a whitelist por recurso é a oportunidade O3. |
| D13 | `max-page-size` não limitado a 200 | 65 telas pedem 500–2000 itens para selects (depende de O2). |
| D14 | `api:gen` com openapi-typescript via `npx` | Ele declara peer TS 5; o projeto está no TS 6. |
| D15 | Novos arquivos do backend em `application/dto` e `mappers` | O `backend/CLAUDE.md` proíbe camadas extras. |
| D16 | Tipografia compacta (13/12/16px) com controles mantidos | Pedido seu durante a noite. |
| D17 | Tokens de primeira pintura com fallback hex | As `--p-*` só existem depois que o PrimeNG injeta o tema. |
| D18 | Subagentes no mesmo working tree, cada um na pasta do seu módulo | Paralelismo sem conflito; eu integrei e commitei. |
| D19 | `!important` de `@media print` mantidos | Sobrepõem o shell na impressão. |
| D20 | Erros de e2e que já existiam antes foram ajustados ou marcados como `skip` com justificativa | Seletor de cor primária removido do catálogo; título da home mudou. |

## Backend, endpoint por endpoint
- **Todos os endpoints (GlobalExceptionHandler):**
  - validação e preenchimento: ProblemDetail com `errors: [{field, message, code}]` e `code` (`fieldErrors`/`erros` mantidos);
  - `IllegalStateException` → 422 `ESTADO_INVALIDO`;
  - `ValidationException` → 422 `REGRA_NEGOCIO_VIOLADA`;
  - `PropertyReferenceException` (sort inválido) → 400 `ORDENACAO_INVALIDA`.
- **Novo `GET /api/v1/meta/enums`:** lista os nomes dos enums. Tem cache de 1h.
- **Novo `GET /api/v1/meta/enums/{nome}`:** devolve `[{code, label, severity}]`. Publicados: `status-chamado` e `status-desconto`.
- **`/v1/dp/descontos/dashboard` e `/v1/financeiro/dashboard`** (prioridades): moeda e percentual em pt-BR e plural no texto, no lugar de "(s)".
- **Front:** supervisores/coordenadores ativos agora vêm de `/v1/rh/{supervisores,coordenadores}/min`, endpoint que já existia (o `/ativos-min` nunca existiu).
- Sem migrations e sem mudança de regra de negócio, cálculo ou permissão.

## Verificações (estado final)
| Verificação | Estado | Detalhe |
|---|---|---|
| `ng build` | ✅ verde | Rodado no estado final (commit 1e39384e). Só avisos que já existiam (budget do bundle, NG8011). |
| `npm test` (Vitest) | ⚠️ não reconfirmado no estado final | A última rodada completa deu 306 de 307 arquivos. O que falhava (import-drawer, teste da regra antiga de largura) foi corrigido, e os módulos tocados depois passaram isolados: SST + import-drawer com 30 arquivos, chamados/financeiro/SST com 28. A rodada completa final **foi interrompida pelo Claude Code por falta de memória** na máquina. Rode `npm test -- --watch=false` para confirmar. |
| `ds:check` | ✅ verde | No estado final, com a linha de base do `ds:visual` atualizada: as contagens só caíram. |
| e2e (Playwright) | ⚠️ não reconfirmado no estado final | Verde na rodada de ~05:30: desktop + mobile, com 2 testes em `skip` justificados (D20). A rodada final foi interrompida por falta de memória. Rode `npm run test:e2e`. |
| Backend (`mvnw test`) | ✅ 2.350/2.353 | Os 3 erros já existiam antes (veja abaixo). |

**Atenção:** o backend que eu subi na 8092 também foi encerrado pelo Claude Code por falta de memória. Ele **não está mais no ar**; suba com o comando de "Como revisar".

Backend: 2.353 testes; os 3 que falham (`RenderizacaoAtaDocxServiceTest`) já falhavam antes, por falta de um `.docx` de referência fora do repositório.

## PENDÊNCIAS e riscos para você olhar
- **Chrome:** a extensão parou de capturar telas por volta de 00:30, provavelmente com a tela do PC desligada. Toda a validação visual foi feita pelo Playwright headless. Por isso não há GIF; os fluxos estão em .webm.
- **Limite de uso:** foi atingido 2 vezes (das 03h às 05h20 e às 07h20). Os subagentes pararam no meio e foram retomados. Por isso as telas P2/P3 ficaram fora.
- **Sessão do Playwright:** compartilhar o refresh token entre cópias de sessão as invalidou (rotação de token). Prints de alguns módulos foram refeitos depois com login novo.
- **Ao reiniciar o backend,** eu subi uma vez sem `DB_URL`, apontando para o `ces-db` de outro checkout. O Flyway **recusou na validação, sem aplicar nada**, e subi de novo no `nexo-db`. Vale conferir com `select * from flyway_schema_history order by installed_rank desc limit 5` no `ces-db` que nada mudou.
- O backend que eu subi em 8092 foi encerrado por falta de memória na máquina, junto com a rodada final de testes. Não reiniciei.
- **Aura padrão:** migrar de `aura-compat` antes de jun/2027.
- **Mudanças mecânicas globais** (hex → primitivo, `uppercase`/`bold`/tracking, fontes < 12px, escala do Tailwind): alguma tela não revisada pode ter mudado de nuance ou de tamanho de texto.
- **NG0100 (ExpressionChanged)** no `SidebarComponent` em dev: o `item.expanded` do `p-panelmenu` em `Eager`. Provavelmente já existia antes.
- **Permissões do USRADMIN local** impediram revisar 3 telas (ver Telas). Não mexi em permissões.
- `/financeiro/gestao/solicitacoes` está declarada 2x em `app.routes.ts` (só relatado).
- Restos da revisão final, ainda não feitos:
  - formato de data diferente entre módulos (um formatador único no `@geo/ui`);
  - "Exportar CSV" no cabeçalho em umas telas e na barra da tabela em outras;
  - PrimeNG direto em formulários do financeiro e do SST;
  - checklist da inspeção com botões em vez de rádio;
  - breadcrumbs em Title Case;
  - título do card repetindo o título da página.
- Arquivo solto: `C:\c\Users\...` foi criado por engano por um subagente (prints de rascunho). Pode apagar à mão.
- Registros `[TESTE]`: nenhum foi criado; nada foi salvo no banco.

## Oportunidades
Lista completa em [OPORTUNIDADES.md](OPORTUNIDADES.md). As 5 de maior impacto:
1. **O14:** componente de página-relatório no `@geo/ui`, para acabar com as barras flutuantes e com o "NOME DA EMPRESA" na tela nos relatórios P2.
2. **O2:** endpoints `/options` com busca, em vez de carregar 500–2000 itens para cada select.
3. **O4:** `StatusDto` nas linhas das listagens + `<geo-status-tag>` (a infraestrutura já existe).
4. **O1:** um único rótulo para o status de desconto (hoje "Solicitado", "Lançado" e "Aguardando validação").
5. **O10/O11:** detalhes de solicitação (almoxarifado) e de desconto (DP) ainda no layout antigo.

## Como revisar
```bash
git log main..redesign/full --oneline
git diff --stat main..redesign/full

# backend (banco nexo-db, como na nota do ambiente local)
cd backend
DB_URL=jdbc:postgresql://localhost:5433/nexo-db ./mvnw spring-boot:run -Dspring-boot.run.jvmArguments="-Dserver.port=8092 -Dgeo.email.provedor=NENHUM"

# front
cd frontend
npm start                         # http://localhost:4200
npm run build && npm test -- --watch=false && npm run ds:check && npm run test:e2e
npm run api:gen                   # com o backend no ar

# prints e vídeos
node tools/redesign/shots.mjs <pasta> nome=/rota
node tools/redesign/gravar.mjs <saida.webm> <passos.json>
```
Documentos: [PROGRESS.md](PROGRESS.md) · [inventory.md](inventory.md) · [api-gap.md](api-gap.md) · [OPORTUNIDADES.md](OPORTUNIDADES.md) · [BRIEF-MODULO.md](BRIEF-MODULO.md)
