## Why

O produto já se chama GEO e tem logo e assistente (Bússola) próprios, mas tudo o que está entre o login e o relatório ainda tem a cara do sistema de origem: tema padrão da biblioteca (Lara azul/cinza), fonte do sistema, ripple genérico, cores escolhidas pelo usuário, e cada tela com seu próprio estilo (≈6.900 classes de cor Tailwind fixas, ≈7.400 `!important`, 345 botões PrimeNG diretos). Com isso, trocar o tema não alcança a maior parte das telas e cada porte vindo do sistema de origem traz o visual antigo de volta. Este é o momento de dar ao GEO uma identidade única, enterprise, com tema claro e escuro de verdade e um movimento próprio, e de proteger esse resultado com verificação automática.

## What Changes

- **Nomenclatura GEO (etapa zero)**: o prefixo `ces`, herdado do sistema de origem, sai de todo o código: tokens `--ces-*` → `--geo-*`, componentes `<ces-*>` → `<geo-*>`, `@ces/ui` → `@geo/ui`, nomes `Ces*`/`ces*` → `Geo*`/`geo*`, arquivos, projeto `ces-frontend`, chaves `ces_*` do navegador, cookie `ces_sessao` e propriedades `ces.*` do backend. Feito por script reproduzível, antes de qualquer mudança visual, com migração dos dados salvos no aparelho.
- **Fundamentos da marca em tokens**: paleta GEO (azul do "G" como primária, âmbar como destaque escasso, neutros próprios), fonte Manrope com números tabulares, escala tipográfica, raios, elevação, densidade e iconografia, todos expostos como tokens do Design System e com valores para claro e escuro.
- **Tema claro, escuro e "seguir o sistema"**: cada token, componente, gráfico, mapa e imagem de marca com variante escura; preferência por usuário que sobrevive offline; documentos impressos sempre no tema claro.
- **Sistema de movimento GEO**: tokens de duração e curva, padrões para entrada/saída, navegação entre telas, drawers, listas, feedback de toque, mudanças de valor e estados de sincronização; personagem da Bússola com movimento próprio; respeito a "reduzir movimento" do sistema operacional e a uma preferência do usuário.
- **Shell redesenhado**: login, menu lateral (expandido e recolhido), cabeçalho, busca global, notificações, conta, início, estados globais (carregando, vazio, erro, offline, 404, sem permissão, atualização disponível) e toasts.
- **Padrões de tela aplicados em todos os módulos**: listagem, detalhe, formulário/drawer, dashboard, quadro kanban, mapa e relatório em tela, varridos módulo a módulo (Obras primeiro) até não sobrar estilo local fora dos tokens.
- **Documentos e comunicações com a marca GEO**: cabeçalho único de relatório/PDF, e-mails, planilhas exportadas e mensagens prontas; nome e logo da empresa contratante passam a ser configuração (white label), nunca texto fixo.
- **Voz e linguagem**: guia de microcopy (você, verbos diretos, erro que diz o que fazer) aplicado aos textos visíveis.
- **Padrões de desenvolvimento**: uma forma única para cada necessidade visual (ícone, botão, status, movimento, estados, cores de gráfico), convenção de nomes de tokens, gerador de telas conformes (listagem, detalhe, formulário, dashboard) e receitas no catálogo.
- **Guardas de conformidade**: o `ds:check` passa a barrar cor de paleta fixa, novo `!important`, botão PrimeNG direto e animação fora dos tokens; baselines visuais nos dois temas.
- **BREAKING**: a escolha de cor primária pelo usuário (azul, esmeralda, violeta, âmbar, rosa, ardósia) é removida: a cor da marca é fixa. Preferências salvas são ignoradas sem erro.
- **BREAKING**: propriedades de configuração `ces.*` (variáveis de ambiente `CES_*`) passam a `geo.*` (`GEO_*`); o deploy precisa atualizar as variáveis no mesmo release, e a aplicação se recusa a subir se ainda encontrar as antigas.
- **BREAKING**: a rota `/copiloto` passa a `/bussola` (com redirecionamento) e o cookie `ces_sessao` passa a `geo_sessao` (aceito o antigo durante a transição).
- **BREAKING**: o ripple do PrimeNG e a opção de ligá-lo/desligá-lo são removidos, substituídos pelo feedback de toque do sistema de movimento e pela preferência "reduzir movimento".

## Capabilities

### New Capabilities
- `nomenclatura-geo`: troca do prefixo `ces` por `geo` em todo o código, por script reproduzível, com migração de dados do aparelho, cookie, configuração e rota.
- `identidade-visual`: tokens de marca (cor, tipografia, forma, elevação, densidade, iconografia, logo e avatar da Bússola) como fonte única do visual.
- `temas-claro-escuro`: tema claro, escuro e automático, cobertura total de componentes e conteúdos, persistência da preferência e regras de contraste.
- `sistema-de-movimento`: tokens e padrões de motion, desempenho, movimento da Bússola e acessibilidade (reduzir movimento).
- `shell-aplicacao`: login, menu, cabeçalho, início e estados globais com a identidade GEO.
- `padroes-de-tela`: padrões visuais de listagem, detalhe, formulário, dashboard, kanban e mapa, e a conformidade de cada módulo a eles.
- `documentos-e-comunicacoes`: relatórios/PDF, e-mails, exportações e mensagens com a marca GEO e a marca do contratante configurável.
- `voz-e-linguagem`: guia de microcopy e sua aplicação aos textos visíveis.
- `conformidade-visual`: regras automáticas e baselines que impedem a volta do visual antigo.
- `padroes-de-desenvolvimento`: um jeito único de fazer cada coisa visual, convenção de tokens, geradores de tela e receitas no catálogo, para o desenvolvimento futuro não reinventar padrões.

### Modified Capabilities
- Nenhuma (não há specs principais em `openspec/specs/`).

## Impact

- **Frontend inteiro**: `src/app/design-system/**` (tokens, adapters PrimeNG, componentes `geo-*`, catálogo), `src/styles.css`, `ThemeService`, shell (`app.ts`, header, sidebar, login, home), todas as pastas de `features/**` e `shared/**` com telas visíveis, `public/` (fontes, ícones), templates de relatório.
- **Renomeação**: praticamente todos os arquivos do frontend (≈7.400 usos de tokens, ≈4.900 de componentes, 396 imports de `@ces/ui`, 87 arquivos com `ces` no nome, 141 nomes TypeScript) e, no backend, 8 prefixos de configuração, o cookie de sessão e a classe da aplicação. Branches abertas rodam o mesmo script antes do merge.
- **Deploy**: variáveis de ambiente `CES_*` renomeadas para `GEO_*` no mesmo release do backend.
- **Backend (pequeno)**: templates de e-mail (`MontadorEmailHtml`), PDFs gerados no servidor (relatórios da Bússola, documentos de obra), textos de WhatsApp, e um cadastro de "empresa contratante" (nome e logo) consumido pelos documentos.
- **Ferramentas**: `tools/design-system/*` (novas regras do `ds:check`), `e2e/design-system` (baselines claro/escuro, axe), `verify:design-system`.
- **Dependências**: fonte Manrope servida localmente (sem CDN, por causa do offline); ícones Lucide no lugar do PrimeIcons (ao fim da migração); nenhuma biblioteca de animação nova.
- **Portes futuros do sistema de origem**: passam a seguir um checklist de porte (tokens, textos, marca) e são barrados pelo `ds:check` se trouxerem o visual antigo.

## Fora deste change (etapas futuras)

- App de campo em `mobile/`: recebe a identidade numa etapa própria, reaproveitando os tokens daqui.
- Renomear o pacote Java `com.nexo` e o nome da aplicação `nexo-core` (resto do nome anterior do produto; não é do sistema de origem).
- Renomear bancos e containers locais de desenvolvimento (`ces-db`, `ces-postgres`), que são compartilhados com outros checkouts na máquina.
- Regravar vídeos e prints da Central de Treinamento: aqui eles só são marcados como desatualizados ou ocultados.
- Página de status pública, internacionalização e temas por cliente além de nome e logo.
