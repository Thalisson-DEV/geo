## Context

`mobile/` é um PWA Angular 20 (≈46 mil linhas) com zone.js, `@angular/animations`, Tailwind 3, Karma/Jasmine, Playwright e
Cypress. Já tem uma camada de UI própria (`src/app/ui/`: barra de topo, barra de abas, folha, lista, seletor, leitor de código,
assinatura, status de envio, indicador de rede, título grande) e tokens em `src/styles/ces-tokens.scss` (prefixo `--ces-*`, azul
`#0052A5`, Roboto, alvo de 48px, claro por padrão, `data-tema="escuro"` e `data-contraste="alto"`). Offline-first maduro: Dexie,
fila, retomada de sessão, rascunhos, envio durável.

O web (`frontend/`) usa a identidade GEO: Inter, neutros zinc, acento azul, Lucide, tokens `--geo-*`, `light-dark()`, Angular 22
zoneless. Público do app: encarregados de campo e administrativo; ~70% tablet, também celular; Android e iPhone; PWA sem loja.

## Goals / Non-Goals

**Goals:**
- Mesma marca do web, com escala e ergonomia de toque.
- Padrões de mercado consolidados para apps de campo, aplicados em todas as telas.
- Nenhuma perda de dados do aparelho na troca de nomes e de versão.

**Non-Goals:**
- Mudar regras de negócio das telas existentes.
- PrimeNG no app (o app mantém componentes próprios, leves para offline e toque).
- Capacitor/loja.

## Decisions

- **Componentes próprios, valores de marca compartilhados.** O app não adota PrimeNG: os componentes de toque já existem em `ui/`
  e são redesenhados. Os tokens do app mantêm os nomes em português que as telas usam (`--geo-fundo`, `--geo-texto`,
  `--geo-destaque`…) com os valores da paleta do web (zinc + azul 600, Inter, Lucide); renomeá-los para os nomes do web mexeria
  em todas as telas sem ganho visual. Verde, âmbar e texto terciário ficam um tom mais escuros que no web para ler sob sol. Alternativa (PrimeNG no app) rejeitada pelo peso no bundle offline e por ser calibrado para densidade
  compacta.
- **Escala de toque, não compacta.** A regra "densidade compacta sempre" vale para o web. No app: corpo 15–16px, apoio 13px,
  títulos de barra 17–20px, título grande 28–30px, alvos ≥ 48px (botão principal 52–56px), margens de 16px (24px no tablet).
- **Inter empacotada.** Fonte variável servida pelo próprio app e cacheada pelo service worker; números tabulares em quantidades.
- **Tablet primeiro.** Pontos de quebra: celular (< 600px), tablet retrato (600–899px), tablet paisagem (≥ 900px). No tablet em
  paisagem a navegação vira trilho lateral e as listas abrem o detalhe ao lado; no celular, detalhe em tela cheia.
- **Padrões de mercado adotados**: abas inferiores com 3–5 destinos; título grande que encolhe ao rolar; um botão principal por
  tela, ao alcance do polegar; folhas inferiores no lugar de diálogos; formulários longos em passos; skeleton em vez de spinner;
  puxar para atualizar; ação por arrasto sempre com alternativa visível; desfazer em vez de "tem certeza?" para ações reversíveis;
  estado de envio sempre visível; áreas seguras (`env(safe-area-inset-*)`); `100dvh`; campos com fonte ≥ 16px (sem zoom no iOS);
  sem realce de toque do navegador; retomada no ponto exato.
- **Troca `ces` → `geo` por script**, como na etapa zero do web: as chaves do `localStorage`/`sessionStorage` são migradas na
  primeira abertura (copia sem sobrescrever e apaga a antiga). Os bancos IndexedDB (fila, rascunhos, sessão), o cache dos
  documentos do veículo e as travas entre abas **mantêm o nome**, como o web fez com o banco dele: renomear exigiria copiar fila e
  fotos sem ganho para o usuário, e uma aba da versão anterior aberta durante a atualização deixaria de respeitar a trava da fila.
- **Sem Tailwind no app.** O Tailwind só servia a classes de filtro que nenhuma tela usava; o reset dele virou `styles/_reset.scss`.
  O visual do app vem dos tokens e componentes próprios.
- **Zoneless e sem `@angular/animations`.** Transições por CSS e View Transitions quando disponíveis, com os tokens de movimento.
- **Testes**: Vitest em modo navegador (Chromium headless) no lugar de Karma, porque os testes usam IndexedDB, Web Locks e
  Blob reais; Playwright mantém e2e, a11y e visual (claro/escuro × tablet/celular); Cypress sai.

## Decisões tomadas na implementação (20/11/2026)

- **Lint de estilos** (`tools/verificar-estilos.mjs`, `npm run lint:estilos`, roda no `prebuild`): hex/rgb/hsl e `!important`
  só em `geo-tokens.scss`. Novos tokens: `--geo-papel*` (assinatura, documento e PDF ficam brancos também no escuro: é o que se
  imprime), `--geo-tinta`, `--geo-sombra-sutil` e `--geo-camera-*` (leitor de código sobre a imagem da câmera, paleta fixa de
  alto contraste). Exceção só com `lint-estilos: permitido` e motivo (hoje: `prefers-reduced-motion`). `tokens.scss`,
  `typography.scss` e `animations.scss` eram órfãos e saíram.
- **Toast com folha aberta vai para o topo** (sinal `FolhaComponent.abertas`, não atributo na raiz: mudar a raiz recalculava o
  estilo da página inteira). Antes ele cobria o quadro de assinatura e engolia o traço.
- **Puxar para atualizar** como diretiva na área rolável do shell, só nas telas de topo e só com toque; alternativa visível:
  "Sincronizar agora" na Conta. Indicador fora do fluxo (`position: absolute`), anunciado como "Atualizando…".
- **Ação por arrasto** (`geo-linha-arrasto`) só como atalho: a mesma ação fica sempre como botão visível na linha.
- **FAB na barra lateral** do tablet deitado por CSS global (`html[data-nav='lateral'] .geo-fab`), sem mudar as telas.
- **Botão compacto** mantém o visual de 40 px e estende o alvo a 48 px por pseudo-elemento; **principal/perigo desabilitados**
  ficam cinza opaco (a 45% sumiam no escuro).
- **Caixa de seleção** (`.geo-selo--caixa`) nas escolhas múltiplas (APR): desmarcado precisa parecer vazio, não "alerta".
- 2.1/2.3–2.6 (migração das telas existentes): as telas já usam as primitivas unificadas (linha, grupo, folha, passos,
  interruptor) desde a 1.8; o que falta é aplicar lista + detalhe no tablet deitado em Transferências, Inspeções e Almoxarifado e
  trocar o quadro de assinatura próprio da transferência pelo `geo-assinatura`. Ficou para depois para não mexer nas garantias de
  retomada (testes de `e2e/piloto/retomada.spec.ts` usam a transferência como fluxo).

## Risks / Trade-offs

- [Atualização Angular 20 → 22 quebrar telas] → migrar por etapas (21, depois 22) com os testes de caracterização a cada passo.
- [Perder a sessão ou a fila na atualização] → bancos do aparelho mantêm o nome; migração das chaves idempotente, sem
  sobrescrever chave nova, coberta por `e2e/piloto/migracao-chaves.spec.ts` (abre a nova versão sem rede e sem pedir login).
- [Diferenças no Safari do iPhone] → testar o app instalado na tela inicial em cada release.
- [Regressão visual em massa] → baselines por tela e migração módulo a módulo.
