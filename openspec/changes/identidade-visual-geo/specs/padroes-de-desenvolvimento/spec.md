## ADDED Requirements

### Requirement: Um jeito único de fazer cada coisa
O frontend SHALL ter uma única forma aprovada para cada necessidade visual recorrente, e o código de tela MUST usá-la:

| Necessidade | Forma única |
|---|---|
| Cor, fonte, raio, sombra, espaço | token `--geo-*` (nunca valor literal ou classe de paleta Tailwind) |
| Ícone | `<geo-icon name="...">` (nunca `<i class="pi ...">` ou SVG solto em tela) |
| Botão | `<geo-button>` / `<geo-icon-button>` |
| Status | `<geo-status>` com tom semântico |
| Entrada e saída de elemento | `animate.enter`/`animate.leave` com as classes `geo-enter-*`/`geo-leave-*` |
| Valor que muda | diretiva `geoValorAnimado` |
| Carregando, vazio, erro, offline | `<geo-async-state>` |
| Logo e assistente | `<geo-logo>` / `<geo-bussola-avatar>` |
| Cores em gráfico e mapa | `ThemeTokens` |

#### Scenario: Ícone fora do padrão
- **WHEN** uma tela nova usa `<i class="pi pi-check">`
- **THEN** o `ds:check` falha e indica `<geo-icon name="check">` como substituto

#### Scenario: Movimento fora do padrão
- **WHEN** um componente de tela declara `transition: all .3s ease`
- **THEN** o `ds:check` falha e indica as classes ou tokens de movimento

### Requirement: Convenção de nomes de tokens
Tokens SHALL seguir o formato `--geo-<categoria>-<papel>[-<variante>]` (ex.: `--geo-text-muted`, `--geo-nav-item-active`, `--geo-motion-fast`, `--geo-success-soft`), nomeados pelo papel e nunca pela cor. Um token novo MUST ter valor nos temas claro e escuro e aparecer no catálogo.

#### Scenario: Token sem tema escuro
- **WHEN** um token é adicionado só em `:root`
- **THEN** o teste de tokens falha por faltar o valor em `.app-dark`

### Requirement: Geradores de tela
O gerador do Design System SHALL criar esqueletos conformes para os tipos de tela listagem, detalhe, formulário em drawer e dashboard, já com cabeçalho de página, estados assíncronos, tema claro/escuro, movimento padrão, teste unitário e entrada de baseline visual.

#### Scenario: Nova listagem
- **WHEN** o desenvolvedor roda o gerador de tela do tipo listagem para "veiculos" no módulo frota
- **THEN** os arquivos são criados em `features/frota/veiculos/` seguindo o padrão "tabela primeiro", e passam no `ds:check` e nos testes sem edição

### Requirement: Receitas no catálogo
O catálogo do Design System SHALL ter uma página por padrão (cada tipo de tela, movimento, voz e linguagem, checklist de porte) com exemplo vivo, quando usar, quando não usar e o trecho de código recomendado. O `AGENTS.md` do frontend MUST apontar para essas páginas como referência.

#### Scenario: Dúvida de uso
- **WHEN** um desenvolvedor precisa saber como animar a abertura de um painel
- **THEN** encontra na página "Movimento" do catálogo o padrão, o exemplo vivo e o código a copiar
