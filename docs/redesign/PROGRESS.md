# Redesign completo — PROGRESS

> Arquivo vivo. Se o contexto se perder, releia isto e retome da "Próxima tarefa".
> Branch: `redesign/full` (criada a partir da `main` em 9d67b2b0, 20/11/2026).

## Etapa atual
4. Telas de referência — migradas; aguardando o ui-reviewer (portão).

## Próxima tarefa
- Aplicar o relatório do ui-reviewer nas 3 referências; depois migração em massa por módulo (P1 primeiro).

## Ferramentas
- Chrome (Claude in Chrome) parou de capturar telas às ~00:30 (renderer sem pintura; provável tela do PC desligada). Validação visual segue pelo Playwright headless:
  - `node tools/redesign/shots.mjs <pasta> nome=/rota ...` (claro/escuro × 1440/1280; sessão em GEO_SHOTS_STATE)
  - `node tools/redesign/probe.mjs /rota "<expr JS>"` (avalia na página; lista erros de console e respostas ≥400)
- `node tools/redesign/gerar-pi-lucide.mjs` — gera pi-lucide.css (pi pi-* → Lucide)
- `node tools/redesign/hex-para-tokens.mjs` — troca hex literal de CSS pelo primitivo do preset mais próximo

## Telas de referência
| Tipo | Rota | Estado |
|---|---|---|
| Listagem densa | `/obras` | migrada (texto em até 2 linhas, células 7×10px, 13px) |
| Formulário longo | `/obras/nova` (drawer) | migrada (campos 32px, rótulos 13px/500) |
| Dashboard | `/execucao/dashboard-operacional` | migrada (sem moldura, abas segmentadas, cards sem degradê) |

Prints: `docs/redesign/shots/antes/*.jpg` e `docs/redesign/shots/depois/*.png`.

## Feito (fundação)
- Preset novo (aura-compat, zinc + blue), tokens --geo-* sobre --p-*, Inter, raiz 14px.
- PrimeIcons → Lucide para todo o app via máscara CSS (224 ícones, 6.522 usos sem tocar nas telas).
- Tailwind: slate/gray/neutral → zinc; bold/extrabold → 600; tracking largo reduzido; `uppercase` neutralizado (`.geo-caixa-alta` para exceções).
- Removidos ~1.150 linhas de adaptadores com !important e os ajustes globais de densidade.
- 1.289 hex literais de CSS (74 arquivos) trocados por primitivos do preset.
- Pesos > 600 e caixa alta em CSS → 600/none (146 arquivos); tracking largo → 0 (73); fontes < 12px → 12px (144).
- Shell: topbar 48px, sidebar 232px neutra com itens de 30px, page-header com ações sempre à direita.
- @geo/ui: geo-status-tag (StatusDto), geo-empty-state, geo-filter-bar, geoApplyServerErrors.
- Backend: errors[] no ProblemDetail, 422 em regra de negócio, sort inválido → 400, StatusDto/UiSeverity + /v1/meta/enums.
- `npm run api:gen` (openapi-typescript via npx) → src/app/api/generated.

## Decisões
| # | Decisão | Justificativa |
|---|---|---|
| D1 | Preset sobre `aura-compat` (não o Aura padrão) | O padrão supõe raiz 16px; as telas têm centenas de medidas em rem calibradas para a raiz pequena. Ir a 16px escalaria tudo +23%. Migração fica em PENDENCIAS (prazo jun/2027). |
| D2 | Raiz 14px | Texto base 14px; 1rem = 14px como no kit. |
| D3 | Inter Variable self-hosted (`@fontsource-variable/inter`) | Kit; Manrope removida. |
| D4 | Neutros zinc + um acento blue (blue.600 = azul da marca) | "Neutra, um acento"; o âmbar deixou de ser acento (`--geo-accent*` → primary). |
| D5 | Sidebar neutra, sem ladrilhos de ícone | Identidade neutra; acento só no item ativo. |
| D6 | `--geo-*` apontam para primitivos `--p-*` (não semânticos) | Os semânticos trazem `light-dark()` no valor, que chart.js/Leaflet não leem. |
| D7 | PrimeIcons substituído por máscara CSS Lucide (`pi-lucide.css`) em vez de reescrever 566 arquivos | Um único set de ícones de imediato e sem risco; código novo usa `<geo-icon>`. |
| D8 | Validação visual pelo Playwright | Chrome deixou de renderizar capturas. |
| D9 | `uppercase` do Tailwind neutralizado globalmente | Kit: nada em caixa alta; 448 usos em rótulos. |
| D10 | Hex → primitivo mais próximo (neutros com croma < 22 → zinc) | Uma fonte de cor; preserva o comportamento claro/escuro existente. |
| D11 | IllegalState/ValidationException → 422; IllegalArgument segue 400 | Contrato (regra de negócio = 422); 4xx é tratado igual pela fila offline. |
| D12 | Sort inválido tratado no handler global (400) em vez de whitelist por controller | 92 controllers repassam sort cru; o handler elimina os 500 de uma vez. Whitelist por recurso fica como oportunidade. |
| D13 | `max-page-size` NÃO limitado a 200 | 65 telas pedem 500–2000 itens para popular selects; limitar quebraria. Depende de endpoints /options. |
| D14 | openapi-typescript via `npx` com versão fixa, fora do package.json | Declara peer typescript@5 (projeto em TS 6); instalar exigiria --legacy-peer-deps. |
| D15 | Componentes novos do backend em `application/dto` e `application/mappers` | backend/CLAUDE.md proíbe camadas extras. |

## PENDENCIAS
- Migrar de `aura-compat` para o Aura padrão antes de jun/2027.
- `GET /v1/rh/supervisores/ativos-min` e `/coordenadores/ativos-min` respondem 400 (aparece no formulário de obra) — investigar.
- NG0100 (ExpressionChanged) no SidebarComponent em dev — confirmar se já existia na main.
- 3 testes do backend (`RenderizacaoAtaDocxServiceTest`) falham por falta de um .docx de referência fora do repositório (pré-existente).

## Riscos
- A troca global de hex/peso/caixa alta foi mecânica: telas que dependiam de um tom exato podem ter mudado de nuance (sempre para o primitivo mais próximo).
- `.uppercase` neutralizado: se algum dado precisava aparecer em caixa alta só por CSS, agora aparece como digitado.
