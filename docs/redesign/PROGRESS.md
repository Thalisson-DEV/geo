# Redesign completo — PROGRESS

> Arquivo vivo. Se o contexto se perder, releia isto e retome da "Próxima tarefa".
> Branch: `redesign/full` (criada a partir da `main` em 9d67b2b0, 20/11/2026).

## Etapa atual
1. Mapeamento (inventory.md, api-gap.md) — em andamento (subagente em segundo plano)
2. Fundação — em andamento

## Próxima tarefa
- Prints "antes" das 3 telas de referência (Playwright) → trocar identidade no @geo/ui.

## Telas de referência
| Tipo | Rota | Motivo |
|---|---|---|
| Listagem densa | `/admin/cadastros/colaboradores` | listagem server-side mais usada, muitas colunas |
| Formulário longo | `/obras/nova` | formulário com várias seções |
| Dashboard | `/execucao/dashboard-operacional` | KPIs + gráficos + tabela |

## Telas feitas
(nenhuma ainda)

## Decisões
| # | Decisão | Justificativa |
|---|---|---|
| D1 | Preset sobre `@primeuix/themes/aura-compat` (não o Aura padrão) | O Aura padrão supõe raiz de 16px; as features têm centenas de medidas em rem calibradas para a raiz (13px → 14px). Ir a 16px escalaria tudo em +23%. Migração para o padrão fica em PENDENCIAS (prazo jun/2027). |
| D2 | Raiz `html { font-size: 14px }` | Texto base de 14px pedido; 1rem = 14px como no kit. |
| D3 | Fonte Inter Variable self-hosted (`@fontsource-variable/inter`, já instalada) | Kit; remove Manrope. |
| D4 | Neutros `zinc` (frios, sem tom azulado) e um único acento `blue` (azul da marca GEO, #2563eb = blue.600) | "Neutra, um acento". O âmbar deixa de ser acento: `--geo-accent*` passa a apontar para o primary. Zinc combina melhor com azul do que o stone quente do kit. |
| D5 | Sidebar neutra (superfície), não azul-marinho | Identidade neutra; o acento fica só em item ativo/foco/ação primária. |
| D6 | Tokens `--geo-*` viram camada de compatibilidade sobre os tokens `--p-*` do preset | Uma única fonte de cor (o preset). |

## PENDENCIAS
- Migrar de `aura-compat` para o Aura padrão antes de jun/2027 (exige raiz 16px e revisão das medidas em rem das features).

## Riscos
(a preencher)
