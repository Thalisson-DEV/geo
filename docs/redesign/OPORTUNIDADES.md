# Oportunidades de melhoria (não implementadas)

Melhorias maiores ou que tocam em regra de negócio, vistas durante o redesign. As pequenas e
seguras foram implementadas na hora (ver PROGRESS.md).

| # | Tela | Problema observado | Proposta | Impacto | Esforço |
|---|---|---|---|---|---|
| O1 | Descontos (lançamento, dashboard, relatórios) | O mesmo status `SOLICITADO` aparece como "Solicitado", "Lançado" e "Aguardando validação" conforme a tela. | Adotar `GET /api/v1/meta/enums/status-desconto` (já existe) como fonte única de rótulos e tons; decidir com o DP o nome oficial. | alto | baixo |
| O2 | Todas as listagens com selects (65 lugares) | Opções carregadas com `size` 500–2000 da listagem paginada; lento e impede limitar `max-page-size`. | Endpoints `GET /{recurso}/options?q=` (≤ 50, com busca) e `geo-select` com busca remota. | alto | alto |
| O3 | Listagens server-side (92 controllers) | `sort` repassado cru ao JPA; hoje um campo inválido devolve 400 (antes 500), mas qualquer propriedade da entidade é ordenável. | Whitelist de ordenação por recurso (mapa coluna da UI → propriedade), como na skill do contrato. | médio | médio |
| O4 | Listagens de status (65 campos enum cru) | Cada tela mantém tabela própria de rótulo/cor/ícone do status. | Devolver `StatusDto {code,label,severity}` nas linhas (`*Row`) e usar `<geo-status-tag>`; os catálogos `EnumDeUi` já existem para chamado e desconto. | alto | médio |
| O5 | 71 controllers | DTO de listagem igual ao de detalhe: listagens trafegam campos que a tabela não mostra. | Separar `XxxRow` (plano, só colunas) de `XxxDetail`. | médio | alto |
| O6 | Carteira de obras (`/obras`) | 18 colunas na tabela. **Parcialmente feito:** seletor de colunas persistido + 10 colunas padrão. Falta reordenar colunas. | Reordenação por arrastar no seletor de colunas do `geo-data-table`. | médio | médio |
| O7 | Rótulos de dados em maiúsculas (status de obra, processos, bases) | Os cadastros gravam nomes em CAIXA ALTA; a interface não consegue apresentá-los em caixa de frase. | Normalizar a exibição no backend (campo `nomeExibicao`) ou migração de dados combinada com o cliente. | médio | médio |
| O8 | Frota — ordens de serviço | ~~Até 3 selos na coluna Situação alargam a tabela.~~ **Feito (20/11):** sinais secundários só com ícone + title/texto para leitor de tela; Oficina e Condutor com largura mínima. | — | — | — |
| O9 | Frota — 40 listagens P2/P3 | Ainda sem o ajuste de texto em 1 linha (linhas altas). | Aplicar `AJUSTE_TEXTO_FROTA` (já existe em `features/frota/shared/frota-lista.ts`) e revisar células custom. | alto | médio |
| O10 | Almoxarifado — detalhes de solicitação (`/solicitacoes-tecnicas/:id`, `/solicitacoes/:id`) | 117 e 104 classes Tailwind com `!`, layout antigo. | Migrar para o padrão de detalhe do @geo/ui. | alto | alto |
| O11 | DP — detalhe do desconto (`/dp/descontos/:id`) | 76 classes `!`; botões validar/baixar/rejeitar com cor forçada. | `geo-button` com variantes + `geo-form-drawer`. | alto | médio |
| O12 | DP — novo desconto | Rota `fullscreen: true` deixa o formulário sem sidebar e sem trilha. | Tirar o fullscreen ou abrir em drawer a partir da listagem. | médio | baixo |
| O13 | Dashboards de chamados, financeiro, SST e frota | Ainda usam `app-dashboard-insight-panel` (agora neutro), enquanto a referência usa `app-dashboard-visao-gerencial`. | Aposentar o insight-panel e migrar todos para a visão gerencial. | médio | médio |
| O14 | Relatórios P2 (`/obras/encerramento/:id`, `/execucao/comercial/:id`, `/execucao/turnos/:id/detalhamento`, detalhe financeiro) | Barra de ações flutuante em caixa alta, "NOME DA EMPRESA" na tela, `relatorio.css` com !important. | Componente `@geo/ui` de página-relatório: page-header com ações e documento só na impressão (padrão já aplicado nos detalhes do SST e na ficha da obra). | alto | médio |
| O15 | Listas de desvios e eventos (SST) | Colunas espremidas; "Ver detalhes"/"Abrir evento" em texto ocupam ~130px; "Abrir evento" abre nova aba. | Ação da linha só com ícone ou clique na linha (mesma aba); colunas ocultas por padrão. | alto | médio |
| O16 | Ficha da obra (`/obras/:id`) | 8 ações na barra do topo; "Atualizar obra" com chevron à esquerda e sem aria-haspopup. | Menu "Mais ações" (Devolver, Encerramento, Imprimir) e menu do `@geo/ui` com aria correto. | médio | baixo |
| O17 | Abrir ficha/nota a partir de listas (obras, comercial, eventos) | `window.open` em nova aba. | Abrir na mesma aba, com Ctrl+clique para nova aba. | médio | baixo |
| O18 | Formulários de inspeção e evento (SST) e financeiro | `p-*` crus com `ngModel`; stepper feito à mão com `p-stepper`. | Migrar para `geo-form-*` e criar `geo-stepper` no `@geo/ui`. | médio | alto |
| O19 | Dashboards (inspeções SST, descontos) | Cores de gráfico em hex/rgba sem variante escura. | Ler a paleta do `ThemeTokens` (já usado no dashboard de eventos). | médio | baixo |
| O20 | Listagens RH/IAM | "Editar" em texto + ícones repetidos em toda linha. | `geo-row-actions` agora tem `[maxVisible]` com menu "Mais ações" (aplicado em /obras: 7 ícones → 2 + menu). Migrar as demais listagens para ele. | médio | baixo |
| O21 | /bussola | Grade de sugestões passa por baixo do compositor em telas de 900px. | Rolagem própria ou 4 sugestões. | médio | baixo |
| O22 | `geo-data-table` | `textFit` não corta células com template próprio; telas repetem CSS. | Já existe `.geo-cell-clamp`; aplicar corte automático ao conteúdo do `geoCell` quando houver `textFit`. | médio | baixo |

## Rodada de avaliação (20/11, tarde)
- Tabelas: o dado estava em 13px (texto corrido) enquanto rótulos e cabeçalhos estavam em 12px; na `main` era ~11px. Novo token `--geo-font-table` (12px) e `--geo-font-table-meta` (11,5px) no `geo-data-table`, no `p-table` cru e nas células que fixavam `text-sm`.
- Checklist da inspeção (SST): opções curtas viraram segmentado na mesma linha da pergunta (9 perguntas numa tela, antes ~3), marcador redondo para escolha única com `role=radio`, e a barra "Registrar inspeção" deixou de flutuar sobre as opções (barra fixa no rodapé do formulário).
- Corrigidos 2 botões que não eram projetados no cabeçalho (NG8011 em evento SST e avaliações) e um import sem uso. Build sem avisos.
