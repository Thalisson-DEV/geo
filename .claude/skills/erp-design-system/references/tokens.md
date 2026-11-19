# Tokens de referência — ERP compacto

Valores-alvo. O preset (`assets/erp-preset.ts`) implementa estes valores; este arquivo é a especificação.

## Escala de densidade (com `html { font-size: 14px }`, 1rem = 14px)

| Elemento | Altura | Padding | Fonte |
|---|---|---|---|
| Input / Select / DatePicker (padrão) | 32px | 0.4rem × 0.65rem | 14px |
| Input `size="small"` (filtros de tabela, toolbars) | 28px | 0.3rem × 0.55rem | 13px |
| Botão padrão | 32px | 0.4rem × 0.85rem | 14px / 500 |
| Botão small | 28px | 0.3rem × 0.65rem | 13px / 500 |
| Linha de tabela | 32–36px | 0.4rem × 0.75rem | 13–14px |
| Cabeçalho de tabela | 34px | 0.45rem × 0.75rem | 12.5px / 500, cor `text.mutedColor` |
| Item de menu / sidebar | 30px | 0.35rem × 0.6rem | 14px |
| Header do app (topbar) | 48px | — | — |
| Sidebar expandida / recolhida | 232px / 52px | — | — |

## Espaçamento (base 4px)

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40`. Gap padrão entre campos de formulário: 12px vertical, 16px horizontal.
Padding de página: 20px (desktop), 12px (tablet). Padding interno de card/painel: 16px.

## Tipografia

| Papel | Tamanho | Peso | Line-height | Uso |
|---|---|---|---|---|
| page-title | 18px | 600 | 26px | Título da página |
| section-title | 15px | 600 | 22px | Títulos de card, seção de formulário |
| body | 14px | 400 | 20px | Texto padrão |
| body-strong | 14px | 500 | 20px | Labels, valores destacados |
| small | 13px | 400 | 18px | Células de tabela densa, ajuda |
| caption | 12px | 500 | 16px | Cabeçalho de tabela, metadados, badges |
| kpi | 24px | 600 | 30px | Números de dashboard (tabular-nums) |

Letter-spacing: `-0.01em` em títulos ≥ 15px; `0` no resto. Nada em CAPS LOCK exceto siglas.

## Cores — neutros (surface)

Neutro levemente quente (escala `stone`) para fugir do "cinza Bootstrap". Alternativa mais fria: `zinc`.

| Token | Light | Dark |
|---|---|---|
| surface.0 (fundo de conteúdo/cards) | `#ffffff` | — |
| surface.50 (fundo da página) | `{stone.50}` | — |
| surface.100 (hover, zebra) | `{stone.100}` | — |
| surface.200 (bordas) | `{stone.200}` | — |
| dark: fundo da página | — | `{stone.950}` |
| dark: cards | — | `{stone.900}` |
| dark: bordas | — | `{stone.800}` |

## Primary (acento)

Um azul-índigo sóbrio funciona bem para ERP. Alternativas: `teal` (operações/campo), `orange`/terracota (mais próximo do visual do Claude, use com cuidado em contextos de erro).

- primary.color (light): `{primary.600}` · hover `{primary.700}` · active `{primary.800}`
- primary.color (dark): `{primary.400}` · hover `{primary.300}` · active `{primary.200}`
- highlight (seleção de linha/opção): fundo `{primary.50}` light / `color-mix(in srgb, {primary.400}, transparent 84%)` dark

## Status

| Status | Uso | Severity PrimeNG |
|---|---|---|
| Sucesso / aprovado / ativo | tag, ícone | `success` |
| Pendente / atenção | tag, ícone | `warn` |
| Erro / rejeitado / vencido | tag, validação | `danger` |
| Informativo / rascunho | tag | `info` ou `secondary` |
| Neutro / arquivado | tag | `secondary` / `contrast` |

## Raio e sombra

- Controles: 6px · Cards/painéis: 8px · Dialogs/overlays: 10px · Tags: 4px
- Sombra overlay: `0 4px 16px -2px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.06)`
- Sombra modal: `0 16px 48px -8px rgb(0 0 0 / 0.20)`
- Cards em repouso: sem sombra, só borda 1px.
