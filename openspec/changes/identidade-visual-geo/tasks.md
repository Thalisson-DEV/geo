> Frentes e dependências
> - **R Renomeação `ces` → `geo`**: primeira de todas, sozinha (Release 0), sem mudança visual. Bloqueia todas as outras.
> - **A Fundamentos**: depende de R; bloqueia B, C, D e F.
> - **B Guardas**: começa junto com A (precisa só dos nomes dos tokens); deve estar ativa antes de E.
> - **C Componentes do DS**: depende de A.
> - **D Shell**: depende de A e de C.3–C.6.
> - **A + B + C + D saem num único release (Release 1).**
> - **E Módulos**: depende do Release 1; os módulos correm em paralelo entre si, um PR por módulo.
> - **F Documentos e comunicações**: depende de A; corre em paralelo a E.
> - **G Voz e linguagem**: o guia (G.1) depende de nada; a aplicação acontece dentro de cada PR de E.
> - **H Fechamento**: depende de E, F e G.

## 0. Frente R: Renomeação ces → geo (Release 0)

- [x] 0.1 Escrever `tools/renomear-geo.mjs` (regras ancoradas da tabela D0, renomeação de arquivos com `git mv`, modos `--aplicar` e `--check`, idempotente) com testes `node --test`, incluindo palavras que não podem mudar ("acesso", "processo", "sucesso", "necessário", "serviços")
- [ ] 0.2 Avisar as sessões e branches abertas, combinar a janela de merge e documentar no PR como rodar o script numa branch existente
- [x] 0.3 Rodar o script no frontend (tokens, seletores, `@geo/ui*` no `tsconfig`, nomes TS, arquivos, `@layer`, projeto `geo-frontend` no `angular.json`/Dockerfile/workflows) e garantir build e testes verdes sem nenhuma mudança visual
- [x] 0.4 `migrarChavesGeo()` no bootstrap, antes do `AuthService`: copiar as 19 chaves `ces_*` para `geo_*` sem sobrescrever e apagar as antigas; manter o nome do banco Dexie; testes unitários e e2e (sessão ativa e 3 itens na fila continuam após atualizar)
- [x] 0.5 Backend: prefixos `ces.*` → `geo.*` em `@ConfigurationProperties`, YAML, `.env.example` e testes; `EnvironmentPostProcessor` que recusa subir com `ces.*`; `CesApplication` → `GeoApplication`
- [x] 0.6 Backend: cookie `geo_sessao` com leitura do `ces_sessao` legado, regravação e expiração do antigo; testes do fluxo de renovação; tarefa datada para remover o legado depois de 30 dias
- [x] 0.7 Rota `/bussola` e `/bussola/:id` com redirecionamento de `/copiloto` e `/copiloto/:id`; atualizar links internos, notificações e e-mails que apontam para a rota
- [x] 0.8 Checklist de deploy: lista das variáveis `CES_*` → `GEO_*` e ordem (trocar as variáveis e subir o backend junto)
- [x] 0.9 Incluir `renomear-geo --check` no `ds:check`, com lista de isenções (só os arquivos de migração); **Release 0**

## 1. Frente A: Fundamentos da identidade

- [x] 1.1 Adicionar `lucide-angular` e criar o registro central `design-system/icons/geo-icons.ts` com o mapa `pi-* → lucide`
- [x] 1.2 Adicionar a fonte Manrope variável em `public/fonts/` com `@font-face`, `preload` no `index.html` e precache no service worker
- [x] 1.3 Reescrever `tokens.css` com a paleta GEO (primária `geo.50–950`, âmbar de destaque, neutros, semânticas com variantes `-soft` e `-text`) para claro e escuro
- [x] 1.4 Adicionar tokens de tipografia (família, escala display→legenda, pesos, `tabular-nums`), forma (3 raios), elevação (3 níveis), navegação (`--geo-nav-*`) e densidade
- [x] 1.5 Adicionar tokens de movimento (durações, curvas, deslocamentos) e a redefinição sob `[data-motion="reduced"]`
- [x] 1.6 Reescrever o `geoPreset` com a escala `geo` e component tokens apontando para `--geo-*`; `providePrimeNG({ ripple: false })`
- [x] 1.7 `ThemeService`: tema `claro|escuro|sistema` com `matchMedia`, preferência "Reduzir movimento" (`automático|ligado`), remoção de `updatePrimaryColor`/ripple ignorando as chaves antigas do `localStorage`; testes unitários
- [x] 1.8 Script inline no `index.html` que aplica `.app-dark`, `color-scheme` e `data-motion` antes da primeira pintura; teste e2e sem flash no escuro
- [x] 1.9 `@media print` forçando os tokens claros
- [x] 1.10 Criar `ThemeTokens` reativo para chart.js, Leaflet e o visualizador de PDF lerem cores do tema
- [x] 1.11 Teste de tokens: todo `--geo-*` em `:root` tem valor em `.app-dark` e segue a convenção `--geo-<categoria>-<papel>[-<variante>]`

## 2. Frente B: Guardas de conformidade

- [x] 2.1 Criar `tools/design-system/check-visual-rules.mjs` (cor literal/paleta Tailwind, `!important`, `::ng-deep`, `<p-button>`/PrimeNG não liberado, `transition`/`animation` sem token, termos proibidos) com testes `node --test`
- [x] 2.2 Gerar `visual-rules-baseline.json` com as contagens atuais por arquivo e regra; implementar a catraca (falha se subir, pede atualização se descer)
- [x] 2.3 Lista comentada de arquivos isentos (logo, avatar, templates de e-mail) e lista de marcas proibidas
- [x] 2.4 Incluir o script no `ds:check`, com cada mensagem de erro indicando a forma única que substitui o código barrado (ex.: "use `<geo-icon name=\"check\">`")
- [ ] 2.5 Definir as telas de referência e criar baselines visuais nos temas claro e escuro e na largura de 390 px; axe nos dois temas e com movimento reduzido

## 3. Frente C: Componentes do Design System

- [x] 3.1 Componente `geo-icon` com mapa `pi-* → lucide` e suporte a `icon="pi pi-…"` nos componentes existentes
- [x] 3.2 Componentes `geo-logo` (só o "G", variantes claro/escuro) e `geo-bussola-avatar` (estados repouso, trabalhando, concluído e interrompido, com agulha animada)
- [x] 3.3 Utilitários de movimento: classes `geo-enter-*`/`geo-leave-*` para `animate.enter`/`animate.leave`, resposta de pressão, diretiva `geo-valor-animado`
- [ ] 3.4 Rever botões, campos, selects, checkbox/radio/switch, chips e tags com os novos tokens e estados (repouso, hover, focus-visible âmbar, pressionado, desabilitado, carregando)
- [ ] 3.5 Rever tabela (`geo-data-table`), paginação, filtros (`geo-filter-panel`), cabeçalho de página e status (`geo-status` com símbolo e texto) com densidade e `tabular-nums`
- [ ] 3.6 Rever overlays (drawer, diálogo, confirmação, popover, menu, tooltip, toast) com movimento coordenado de fundo e painel e saída mais curta
- [ ] 3.7 Rever estados (`geo-async-state`: carregando/skeleton, vazio, erro, offline, sem permissão) e o indicador de sincronização com os cinco estados normativos animados
- [ ] 3.8 Tema dos gráficos e do mapa via `ThemeTokens`
- [ ] 3.9 Enxugar `primeng-adapters.css`, `styles.css` e `legacy-compat.css`, removendo o que os tokens já cobrem
- [ ] 3.10 Atualizar o catálogo (cada componente nos dois temas, nas duas densidades e com movimento reduzido), o registro de cobertura e os testes
- [ ] 3.11 Páginas de receita no catálogo: Tokens (convenção e lista), Movimento, Ícones, Voz e linguagem, Checklist de porte, e uma por tipo de tela; cada uma com exemplo vivo, quando usar, quando não usar e o código a copiar
- [ ] 3.12 Gerador de telas `ds:tela <listagem|detalhe|formulario|dashboard> <modulo>/<nome>` com templates conformes (cabeçalho, estados assíncronos, temas, movimento, teste unitário, baseline) e testes do gerador

## 4. Frente D: Shell da aplicação

- [ ] 4.1 Login novo (painel de marca, formulário, aviso de offline), responsivo até 390 px
- [ ] 4.2 Menu lateral azul-marinho: logo, Bússola em destaque, grupos, item ativo âmbar com `aria-current`, rodapé de sincronização, recolher só ícones (com a escolha salva) e gaveta no celular
- [ ] 4.3 Cabeçalho: trilha, busca global com atalho `/`, notificações com contador acessível, menu da conta com tema, densidade e movimento, e "Sair"
- [ ] 4.4 Início: saudação, data, indicadores por perfil, cartão "A Bússola notou" condicionado à permissão, atalhos
- [ ] 4.5 Transição de navegação com `withViewTransitions()` (menu e cabeçalho fixos)
- [ ] 4.6 Telas globais: carregamento inicial, 404, sem permissão, sem conexão, atualização disponível, com o guia de voz
- [ ] 4.7 Bússola (workspace e painel lateral) com o avatar animado, entrada da resposta em blocos e o cartão de confirmação no novo visual
- [ ] 4.8 Testes unitários e e2e do shell, baselines claro/escuro e celular; **Release 1**

## 5. Frente E: Varredura por módulo (um PR por módulo, em paralelo)

> Em cada módulo: trocar as cores fixas por tokens e componentes, `<p-button>` por `geo-button`, `pi-*` por `geo-icon`, aplicar o guia de voz, zerar as exceções na catraca, criar as baselines claro/escuro e conferir na largura de celular.

- [ ] 5.1 Obras (prioridade; coordenar com o trabalho em andamento no módulo)
- [ ] 5.2 Almoxarifado
- [ ] 5.3 Execução
- [ ] 5.4 Frota
- [ ] 5.5 Segurança do trabalho
- [ ] 5.6 DP (descontos)
- [ ] 5.7 Financeiro
- [ ] 5.8 Chamados
- [ ] 5.9 Automações e notificações
- [ ] 5.10 Pessoas e equipes (RH)
- [ ] 5.11 Contrato
- [ ] 5.12 Administração e IAM
- [ ] 5.13 Manuais (prints e vídeos antigos marcados como desatualizados ou ocultados)
- [ ] 5.14 Componentes compartilhados de `shared/` ainda fora do DS (dashboard, chatbot, movimentação, diálogos)

## 6. Frente F: Documentos e comunicações

- [ ] 6.1 Backend: `ConfiguracaoEmpresa` (nome, logo, assinatura) no módulo admin, migração `V<próximo livre>__configuracao_empresa.sql` (numerar no momento da aplicação, depois das migrações já na main, incluindo as do porte), endpoint de leitura e de edição com permissão, testes
- [ ] 6.2 Frontend: tela de configuração da empresa contratante e cache offline da configuração
- [ ] 6.3 Componente único de cabeçalho e rodapé de relatório/impressão; substituir os cabeçalhos dos relatórios de almoxarifado, execução, DP, financeiro, SST e frota
- [ ] 6.4 PDFs gerados no servidor (relatórios da Bússola, documentos de obra) com cabeçalho e rodapé GEO e marca do contratante
- [ ] 6.5 Modelo de e-mail GEO em `MontadorEmailHtml` (logo, cores, rodapé) e testes
- [ ] 6.6 Mensagens de WhatsApp e planilhas exportadas com assinatura configurável e "Gerado pelo GEO em <data>"

## 7. Frente G: Voz e linguagem

- [ ] 7.1 Escrever o guia de voz como página do catálogo (3.11), com exemplos de botões, erros, vazios, confirmações e a persona da Bússola
- [ ] 7.2 Padronizar as mensagens globais de erro (interceptor e `getErrorMessage`) para "o que aconteceu + o que fazer", sem código HTTP
- [ ] 7.3 Aplicar o guia nos textos de cada módulo dentro dos PRs da frente E

## 8. Frente H: Fechamento

- [ ] 8.1 Remover o PrimeIcons e o `legacy-compat.css` com a catraca zerada nessas regras
- [ ] 8.2 Medir o desempenho do movimento nas telas de referência (CPU 4x mais lenta) e corrigir o que ficar abaixo de 60 fps
- [ ] 8.3 Rodar `npm run verify:design-system` completo e registrar o resultado
- [ ] 8.4 Atualizar `AGENTS.md`, `CLAUDE.md` do frontend e `openspec/config.yaml`: identidade GEO, a tabela "um jeito único de fazer cada coisa", o gerador `ds:tela`, as páginas de receita do catálogo e o checklist de porte; trocar as referências a `docs/design-system/*` (inexistente) pelo catálogo
