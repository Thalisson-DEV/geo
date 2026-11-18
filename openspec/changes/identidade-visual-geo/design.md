## Context

O frontend é Angular 21 com PrimeNG 21 (preset `cesPreset`, derivado do Lara) consumido por `@ces/ui`, Tailwind v4 e PWA offline-first. Todo o código usa o prefixo `ces`, herdado do sistema de origem: tokens, 43 componentes, entrypoints, 141 nomes TypeScript, 87 arquivos, 19 chaves do `localStorage` (inclusive sessão e chave de criptografia), o cookie `ces_sessao` e 8 prefixos de configuração `ces.*` no backend. Hoje:

- **Tokens**: existe uma camada `@layer ces.tokens` (`design-system/styles/tokens.css`, cerca de 90 variáveis `--ces-*`) com variante `.app-dark`, mas ela cobre só uma parte do visual. A maioria das telas usa cores Tailwind fixas (≈6.900 ocorrências) e `!important` (≈7.400), e `src/styles.css` tem 1.200 linhas de ajustes globais.
- **Tema**: o `ThemeService` alterna `.app-dark`, permite trocar a cor primária (6 opções, via `updatePreset`), liga e desliga o ripple e controla a densidade.
- **Movimento**: `provideAnimationsAsync()`, `ripple: true`, 37 arquivos com `@keyframes` e cerca de 190 `transition` soltas, sem tokens. Há 73 usos de `prefers-reduced-motion`, sem política única.
- **Ícones**: PrimeIcons (`pi pi-*`) em todo o código.
- **Verificação**: o `ds:check` valida a cobertura do PrimeNG e o padrão de listagem; o `verify:design-system` roda o `ds:check`, os testes, o e2e (com axe e baselines visuais) e o build.
- **Documentação**: o `AGENTS.md` aponta para `docs/design-system/README.md` e `prime-ng-coverage.md`, que **não existem** na branch. Eles não serão criados; as referências passam para o catálogo (D11).

Restrições: o produto é white label; funciona offline (nada de CDN em tempo de execução); há trabalho paralelo em Obras e portes frequentes do sistema de origem.

O protótipo de referência visual (login, início, listagem, Bússola, relatório) foi aprovado como direção, com ajustes a fazer durante a implementação.

## Goals / Non-Goals

**Goals:**
- Um visual GEO único, enterprise (denso, sóbrio, legível), igual em todas as telas.
- Temas claro e escuro completos, e "seguir o sistema" como padrão.
- Um sistema de movimento próprio, funcional e performático, que distinga o GEO.
- Tornar a regressão ao visual antigo impossível sem que a verificação falhe.
- Migração incremental por módulo, sem congelar o desenvolvimento.

**Non-Goals:**
- Redesenhar fluxos ou regras de negócio: a mudança é visual e de linguagem.
- App de campo em `mobile/`, pacote `com.nexo`, bancos locais `ces-db`, regravar vídeos (veja a proposta).
- Temas por cliente além de nome e logo.

## Decisions

### D0. Renomeação `ces` → `geo` como etapa zero, por codemod
Antes de qualquer mudança visual, um script `tools/renomear-geo.mjs` (Node, idempotente, com testes) troca o prefixo em todo o repositório. Ele só altera ocorrências ancoradas:

| Antes | Depois |
|---|---|
| `--ces-x` | `--geo-x` |
| `<ces-x>`, `.ces-x`, `'ces-x'` (seletor, classe, nome de arquivo) | `geo-x` |
| `@ces/ui*` | `@geo/ui*` |
| `cesX` / `CesX` (identificadores TS e Java) | `geoX` / `GeoX` |
| `@layer ces.` | `@layer geo.` |
| `ces_x` (chaves) | `geo_x` |
| `ces.x` em `@ConfigurationProperties`, YAML e propriedades | `geo.x` |
| `ces-frontend` (projeto Angular, `dist/`, Dockerfile) | `geo-frontend` |

Palavras que contêm "ces" ("acesso", "processo", "necessário") ficam intactas, garantido por teste. O script também renomeia arquivos (`git mv`) e roda em modo `--check` dentro do `ds:check`. Branches abertas (como o trabalho de Obras) rodam o mesmo script antes do merge, então o conflito some.

O diff da etapa zero é **só** renomeação: nenhuma mudança visual, testes e build verdes, revisado e mergeado sozinho.
*Alternativa*: manter `ces` (decisão anterior). Foi rejeitada pelo produto: o prefixo é o nome do sistema de origem.
*Alternativa*: renomear aos poucos, por módulo. Foi rejeitada: deixaria dois prefixos convivendo por meses e dobraria a confusão nos portes.

### D0.1. Migração do que já está salvo
- **localStorage e sessionStorage**: `migrarChavesGeo()` roda no primeiro import do `main.ts`, antes de qualquer serviço. Em vez de uma lista fixa, ela move **toda** chave com prefixo `ces_`, `ces.` ou `ces:` (também `ces.table.*`, `ces.vs.*`, `ces.nav`) para o nome com `geo`, sem sobrescrever uma chave nova, e apaga a antiga. Com isso a sessão (`ces_session_enc`) e a chave de criptografia (`ces_key_segredo`) seguem valendo, ninguém é deslogado e a fila do IndexedDB continua legível. O script de tema do `index.html` roda antes do `main.ts` e por isso também lê `ces_theme_mode`. O nome do banco Dexie (`CesDatabase`) **não muda**, para não perder dados.
- **Outros nomes já gravados** (descobertos na implementação): as credenciais de IA externa emitidas com `ces_` continuam aceitas (as novas saem com `geo_`); os escopos OAuth `ces.leitura`/`ces.escrita` pedidos por clientes já conectados são lidos como `geo.*`; os nós de automação gravados como `ces.query`/`ces.people`/`ces.collaborator` são lidos como `geo.*` no backend (registro `No`) e no editor (`normalizar`). Os botões de navegação antigos com a chave `CES_HOME` em conversas salvas deixam de aparecer, o que é aceito.
- **O que fica como está**: as migrações Flyway (imutáveis), a coluna `id_veiculo_ces`, o serviço `ces-backend` no Railway, os bancos e containers locais `ces-db`/`ces-postgres`. O script não altera uma linha com o marcador `renomear-geo: manter` (ou a linha logo abaixo de `renomear-geo: manter a linha seguinte`). É assim que o código de migração e esses nomes de infraestrutura convivem com o `--check`.
- **Cookie**: o backend lê `geo_sessao` e, na ausência, `ces_sessao`; ao renovar, grava `geo_sessao` e expira `ces_sessao`. A leitura do cookie antigo sai depois de 30 dias, o prazo máximo do refresh token, numa tarefa marcada.
- **Configuração**: um `EnvironmentPostProcessor` falha na inicialização se encontrar qualquer propriedade `ces.*`, citando a chave `geo.*` correspondente. O release do backend leva o checklist das variáveis `CES_*` → `GEO_*` do deploy.
- **Rota**: `/bussola` e `/bussola/:id`, com redirecionamento de `/copiloto` e `/copiloto/:id`. As permissões (`assistente:*`) não mudam.

### D1. Evoluir os tokens existentes, já com o prefixo `geo`
Depois da etapa zero, os tokens `--geo-*` mantêm os nomes e mudam os valores, e entram os que faltam (`--geo-accent*`, `--geo-nav-*`, `--geo-font-*`, `--geo-text-*`, `--geo-elevation-*`, `--geo-motion-*`). Os 957 `geo-button` e os componentes do DS passam a seguir a identidade sem nenhuma edição.

### D2. Preset PrimeNG GEO sobre o Lara, mapeado aos tokens
O `geoPreset` (antigo `cesPreset`) passa a ter uma escala primária própria (`geo.50…950`, derivada de `#2563EB`/`#1E40AF`), neutros próprios e component tokens apontando para as variáveis `--geo-*`. Continua sobre o Lara para limitar regressões nos 1.750 linhas de `primeng-adapters.css`.
*Alternativa*: trocar para o Aura. É mais plano, mas obrigaria a revalidar cada adapter. Fica para avaliar depois que os adapters estiverem enxutos.

### D3. Cor primária fixa, ripple removido
`updatePrimaryColor` e `CES_PRIMARY_COLORS` saem; a preferência salva é ignorada na leitura. `providePrimeNG({ ripple: false })` e a opção de ripple saem das preferências. Entra a preferência "Reduzir movimento" (Automático | Ligado). **BREAKING** controlado: nada quebra, a escolha antiga só deixa de valer.

### D4. Tema: classe `.app-dark` aplicada antes do bootstrap
Mantém-se a estratégia `.app-dark` (já é o `darkModeSelector` do PrimeNG). Um script inline mínimo em `index.html` lê a preferência (`claro`/`escuro`/`sistema`) do `localStorage` e aplica a classe e `color-scheme` antes da primeira pintura. Com "sistema", o `ThemeService` escuta `matchMedia('(prefers-color-scheme: dark)')`. Gráficos (chart.js), Leaflet e o visualizador de PDF leem os tokens por um `ThemeTokens` reativo, não por cores próprias. A impressão força o claro com `@media print` sobre os tokens.

### D5. Fonte Manrope local
Manrope variável (OFL) em `public/fonts/`, com `@font-face` (`font-display: swap`), `preload` no `index.html` e precache no service worker. `font-variant-numeric: tabular-nums` entra nos componentes de tabela, indicador e valor monetário.

### D6. Ícones: componente `geo-icon` com Lucide, migração por mapa
Entra o componente `geo-icon` (SVG inline de traço, tamanho e espessura em tokens), com os ícones Lucide importados individualmente (tree-shaking). Um mapa `pi-* → lucide` permite que `icon="pi pi-…"` dos componentes do DS continue funcionando durante a migração. O PrimeIcons é removido quando o mapa cobrir 100% dos usos.
*Decidido*: `lucide-angular`. Os ícones são registrados num único arquivo, `design-system/icons/geo-icons.ts`; só entram no bundle os registrados, sem passo de build extra.
*Alternativas*: manter o PrimeIcons, rejeitado porque é o ícone de "cara de sistema de origem", mistura preenchido e traço e não tem o conjunto de domínio necessário. Sprite com `lucide-static`, rejeitado porque exige gerar o sprite no build e não ganha em tamanho com o registro centralizado.

### D7. Movimento: CSS primeiro, tokens e três mecanismos
- **Tokens** (`tokens.css`): `--geo-motion-instant: 90ms`, `--geo-motion-fast: 140ms`, `--geo-motion-base: 200ms`, `--geo-motion-slow: 280ms`; curvas `--geo-ease-out: cubic-bezier(.2,.8,.2,1)`, `--geo-ease-in: cubic-bezier(.4,0,1,1)`, `--geo-ease-emphasis: cubic-bezier(.3,0,0,1)`. A saída usa cerca de 70% da duração da entrada.
- **Entrar/sair de elementos**: `animate.enter`/`animate.leave` nativos do Angular 21 com classes utilitárias do DS (`geo-enter-fade`, `geo-enter-rise`, `geo-enter-slide-*`). Não entra código novo com `@angular/animations`; o `provideAnimationsAsync` continua enquanto o PrimeNG precisar.
- **Navegação**: `withViewTransitions()` no router, com transição de continuidade curta (opacidade e deslocamento de 6 px no conteúdo, menu e cabeçalho fixos via `view-transition-name`). Sem suporte, não há transição.
- **Assinaturas do GEO**: resposta de pressão (`scale(.98)` e escurecimento em 90 ms) no lugar do ripple; realce de valor alterado (`geo-valor-animado`); indicador de sincronização com estados animados; agulha da Bússola oscilando enquanto ela trabalha, parando no fim ou na interrupção; drawer com fundo e painel coordenados.
- **Reduzir movimento**: o atributo `data-motion="reduced"` no `<html>` (do sistema operacional ou da preferência) redefine os tokens de deslocamento e escala para 0 e as durações para `--geo-motion-instant`. Assim nenhum componente precisa de lógica própria.
- **Desempenho**: só `transform`, `opacity` e cor; listas com mais de 12 itens animam o contêiner, não as linhas; nada de `will-change` permanente.
*Alternativa*: uma biblioteca (GSAP/Motion One). Foi rejeitada: adiciona peso ao PWA de campo, e CSS com View Transitions cobre os padrões.

### D8. Guardas por "catraca" no `ds:check`
Um novo `tools/design-system/check-visual-rules.mjs` varre `src/app/features/**` e `src/app/shared/**` com regras de: cor literal/paleta Tailwind, `!important`, `::ng-deep`, `<p-button>` e PrimeNG não liberado, `transition`/`animation` sem token, e termos da lista de marcas proibidas. Ele compara com `visual-rules-baseline.json` (contagem por arquivo e regra): falha se a contagem subir e pede atualização se descer. O script entra no `ds:check`.
*Alternativa*: stylelint/eslint. Eles não cobrem templates inline em `.ts` nem as classes Tailwind de forma confiável; ficam como evolução.

### D9. Empresa contratante como configuração do backend
Entra um cadastro singleton em `admin` (`ConfiguracaoEmpresa`: nome, logo em anexo, assinatura de mensagem), com migração Flyway `V<próximo livre>__configuracao_empresa.sql` (número definido na aplicação, depois das migrações do porte, hoje até V260) e um endpoint de leitura para usuários autenticados (cacheado offline no frontend). `MontadorEmailHtml`, os PDFs do servidor e as mensagens de WhatsApp usam esse cadastro, com fallback "GEO".

### D10. Menu azul-marinho nos dois temas
O menu lateral usa `--geo-nav-*` (fundo azul-marinho, texto claro, ativo âmbar) nos temas claro e escuro. No escuro, o fundo da área de conteúdo fica num neutro mais escuro que o menu, e a separação vem de uma borda de token. É a assinatura visual do GEO e evita que o menu "suma" no tema claro.

### D11. Padrões de desenvolvimento: um jeito único, gerado e verificado
Para o desenvolvimento futuro não reinventar padrões, cada necessidade visual tem uma forma única (tabela na spec `padroes-de-desenvolvimento`), e três mecanismos garantem isso:
1. **Gerador**: o `ds:add` hoje gera componentes do DS (`primitive|form|pattern`). Ele ganha o comando `ds:tela <tipo> <modulo>/<nome>` (tipos `listagem|detalhe|formulario|dashboard`), com templates em `tools/design-system/generate/templates/telas/`. Os esqueletos saem conformes e testados.
2. **Catraca**: o `check-visual-rules.mjs` (D8) indica na mensagem de erro a forma única que substitui o código barrado.
3. **Receitas no catálogo**: cada padrão (tipos de tela, movimento, voz, checklist de porte) é uma página do catálogo com exemplo vivo e o código a copiar. Não há pasta de documentação separada: o `AGENTS.md` do frontend aponta para o catálogo e para o gerador.

Convenções fixadas:
- **Tokens**: `--geo-<categoria>-<papel>[-<variante>]`, nomeados por papel e nunca por cor. Todo token tem valor claro e escuro, garantido por um teste.
- **Componentes do DS**: entradas por `input()`, sem cores por input (só tom semântico: `tone="success|warning|danger|info|neutral|brand"`).
- **Movimento**: só por classes `geo-enter-*`/`geo-leave-*`, pela diretiva `geoValorAnimado` ou por tokens; nenhuma tela declara `transition` própria.
- **Ícones**: só por `<geo-icon name>`, com nome em kebab-case do Lucide.

### D12. Ordem de entrega
0. Etapa zero: renomeação `ces` → `geo` (D0, D0.1), sozinha, sem mudança visual, coordenada com quem tem branch aberta.
1. Fundamentos (tokens, preset, fonte, ícones, tema, movimento) **junto** com os componentes do DS e o shell, num único release, para o GEO "virar" de uma vez nos pontos que todo mundo vê.
2. Módulos em PRs curtos e paralelos, um por módulo, com Obras primeiro. Cada PR zera as exceções do módulo na catraca.
3. Documentos e comunicações em paralelo aos módulos.

## Risks / Trade-offs

- [A renomeação conflita com branches abertas (ex.: Obras, com 120 arquivos em andamento)] → O codemod é versionado e idempotente: a branch roda o script e faz commit antes do merge. A etapa zero é anunciada antes e mergeada num momento combinado.
- [Perda de sessão ou da fila offline na troca das chaves] → A migração copia antes de apagar, não sobrescreve chave nova, tem teste e2e com fila de 3 itens e sessão ativa, e o nome do banco Dexie não muda.
- [Deploy sobe com variáveis `CES_*` ignoradas em silêncio] → A aplicação recusa subir com propriedade `ces.*` e o release leva o checklist de variáveis.
- [O codemod troca algo que não devia] → Regras ancoradas, testes com palavras do domínio ("acesso", "processo", "sucesso"…), e revisão do diff por amostragem antes do merge.

- [Telas não migradas ficam com aparência mista entre o release 1 e a varredura do módulo] → Os tokens antigos continuam válidos, a ordem segue o uso real (Obras, Almoxarifado, Execução…) e cada módulo fecha em um PR.
- [Conflito com trabalho paralelo em Obras e com portes] → Os PRs de módulo são curtos e coordenados com quem está no módulo; o checklist de porte e a catraca barram a regressão.
- [O tema escuro revela cores fixas esquecidas] → Baselines claro/escuro por tela de referência e o axe no escuro dentro do `verify:design-system`.
- [Desempenho do movimento em Android de entrada] → Só `transform`/`opacity`, contêiner em vez de linhas, perfil no Chrome DevTools em CPU 4x mais lenta como critério de aceite.
- [View Transitions sem suporte em navegadores antigos] → Melhoria progressiva: sem suporte, a navegação é instantânea.
- [Falsos positivos da catraca (ex.: cor literal em SVG de marca)] → Lista de arquivos isentos explícita e comentada (logo, avatar, templates de e-mail).
- [Mudança de ícones em massa quebra testes que procuram `pi-*`] → O mapa `pi→lucide` mantém a API do DS; os testes são ajustados por módulo.

## Migration Plan

0. Release 0 (renomeação): mergear sozinha; o backend sobe com as variáveis `GEO_*` já trocadas no ambiente; acompanhar os logins e o tamanho das filas de sincronização no primeiro dia. Para reverter, volta o PR e as variáveis; as chaves `geo_*` já migradas no aparelho são lidas de volta por uma migração inversa incluída no próprio revert.
1. Release 1 (fundamentos + DS + shell): publicar, observar o feedback e os erros de contraste, corrigir.
2. Releases por módulo, na ordem de D12, cada um com baselines e exceções zeradas.
3. Remover o PrimeIcons e o `legacy-compat.css` quando a catraca chegar a zero.
4. **Rollback**: cada release é um PR revertível; os tokens antigos ficam disponíveis até o fim da varredura, então reverter o shell não quebra os módulos.

## Decisões já tomadas

- Ícones: `lucide-angular` (D6).
- Menu azul-marinho nos dois temas (D10).
- Não criar `docs/design-system/`: as referências do `AGENTS.md` passam a apontar para o catálogo e o gerador (D11).
- Densidade padrão automática pelo tipo de ponteiro (compacta com mouse, confortável no toque), com escolha do usuário.

## Open Questions

- Nenhuma que bloqueie o início. As decisões de detalhe visual (tons exatos, escala tipográfica) saem da frente A e são aprovadas no catálogo antes do Release 1.
