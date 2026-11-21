<!-- Dependências: 0 antes de tudo; 1 depois de 0; módulos de 2 em paralelo depois de 1; 3 ao final.
     A parte de app da change execucao-campo-obras começa depois da frente 1. -->

## 0. Fundação técnica

- [x] 0.1 Testes de caracterização das telas principais rodando antes da atualização (base de comparação). Baseline em 20/11/2026: 481 unitários ok; e2e Android 64 ok e 9 falhas que já existiam (navegação e turno de caracterização desatualizados; rolagem em `retomada.spec.ts:72` falha também no código original)
- [x] 0.2 Angular 20 → 21 → 22 com `ng update`; zoneless; remover `@angular/animations` e `zone.js`
- [x] 0.3 Tailwind removido (não era usado pelas telas; reset equivalente em `styles/_reset.scss`, idêntico em pixel); Karma/Jasmine → Vitest em modo navegador (Chromium); Cypress removido
- [x] 0.4 Script `ces` → `geo` (`tools/renomear-geo.mjs` com `mobile` no escopo) com migração das chaves locais na primeira abertura; bancos IndexedDB, cache dos documentos do veículo, travas entre abas e o serviço do backend no Railway mantêm o nome (`renomear-geo: manter`)
- [x] 0.5 Manifesto ("GEO Campo", orientação livre para o tablet) e ícones/logo da marca GEO; a fonte entra no cache com a 1.1

## 1. Identidade, shell e componentes

- [x] 1.1 Tokens `--geo-*` do app: cores da marca (claro/escuro/alto contraste), Inter empacotada, escala de toque, raios, elevação, movimento. Paleta zinc + azul 600 do web; verde/âmbar/texto terciário um tom mais escuros que o web (≥ 4,5:1 sobre o cinza, sob sol); peso máximo 600; superfície inversa para o toast; tema "Sistema" além de claro/escuro
- [x] 1.2 Ícones Lucide no componente de ícone (pacote `lucide`, só os usados entram no bundle; traço 1,75 como no web); fonte `material-icons` removida (sem uso)
- [x] 1.3 Shell: barra superior com título grande, abas inferiores por perfil, trilho lateral no tablet em paisagem, áreas seguras, selo de pendentes, indicador de rede, aviso de nova versão. Feito: barra lateral ≥ 900 px com a marca, coluna de conteúdo com largura máxima (`--geo-conteudo-max`), elementos fixos alinhados à coluna (`data-nav` na raiz). Já existiam: áreas seguras, selo, indicador de rede, aviso de versão. Título grande que recolhe numa barra compacta ao rolar (IntersectionObserver + sticky)
- [x] 1.3a Ajustes da revisão (ui-reviewer, 20/11/2026): toast acima da faixa de ação fixa (`data-acao-fixa` + `--geo-rodape-acao`), contorno de controle ≥ 3:1 (`--geo-borda-campo`), segmentado no padrão M3 (destaque + check), alto contraste também no escuro, barra lateral só com altura ≥ 600 px e respeitando o recorte lateral do iPhone, área de toque de 48 px no indicador de rede e nos chips (chip selecionado com check), `mobile/CLAUDE.md` e `GEMINI.md` reescritos
- [ ] 1.4 Componentes: botão (principal, secundário, perigo), lista/cartão, folha inferior, seletor, campo de quantidade, campos de formulário, assistente em passos
- [x] 1.5 Componentes: câmera/galeria com carimbo, status de envio, estados vazio/carregando (skeleton)/erro, puxar para atualizar, ação por arrasto, desfazer, ditado por voz. Feito: `geo-fotos` (câmera traseira direta, galeria opcional, compressão e carimbo com contexto, data e GPS gravado na imagem — `core/fotos/carimbo.ts`), estado de envio compacto (só ícone) e discreto, `ToastService.desfazer`. Decidido: ditado pelo microfone do teclado do aparelho (funciona offline com os modelos do sistema; a API de voz do navegador depende de rede no Chrome), sem componente próprio. Falta: puxar para atualizar e ação por arrasto. Feito também: puxar para atualizar (`geoPuxarAtualizar` na área rolável das telas de topo; alternativa visível: "Sincronizar agora" na Conta) e ação por arrasto (`geo-linha-arrasto`, sempre com o botão visível na linha; usada nos registros recusados do Hoje de Obras)
- [x] 1.6 Layout lista + detalhe adaptável (celular, tablet retrato, tablet paisagem): componente `geo-lista-detalhe` (detalhe como rota filha, painéis com rolagem e fixos próprios) e `LayoutService` (classe expandida ≥ 900 × 600). Estreia nas telas de Obras
- [x] 1.8 Pendências da revisão para os componentes e telas. Feito: margem de página única (`--geo-margem`, 16 px no celular e 24 px no tablet) em título, seções, cartões e faixas; um estilo de campo (contorno também no seletor); coluna de 640 px para fluxos em passos no tablet; folha inferior centralizada com até 640 px no tablet; barra de passos unificada (`.geo-passos`, antes copiada em 9 telas); Serviços com valor à direita em `tabular-nums`, "Enviado" só como ícone e sem repetir o tipo ("Tipo não informado" sai); apoio das linhas em até 2 linhas; "Seu veículo" em caixa de frase.; interruptor único no padrão M3 (`.geo-interruptor`, antes copiado em 9 telas, desligado com contorno 3:1); sombras e estrela em tokens (`--geo-sombra-cartao`, `--geo-marca-ambar`); Conta sem o status de conexão repetido; rodapé do login sem o separador desalinhado. Falta: FAB na barra lateral no tablet deitado (vai com a 1.6). Feito: no tablet deitado o botão flutuante sobe para a barra lateral, abaixo da marca, só com o ícone
- [x] 1.7 Catálogo interno dos componentes (rota `/catalogo`, sem link no app) com screenshots claro/escuro em `docs/redesign/mobile/`

## 2. Migração das telas existentes (em paralelo por módulo)

- [ ] 2.1 Login, Hoje e Conta
- [x] ~~2.2 Serviços (notas comerciais)~~ — fluxo comercial retirado do app em 20/11/2026 (telas, serviços, sincronização das notas, ações comerciais, tipos de serviço e meta de faturamento; banco local v12 apaga as tabelas). O turno fica (Obras usa). Pedido de material também retirado (a equipe não pede material). Testes e2e refeitos na transferência; bateria completa verde em Android e iOS, incluindo as 8 falhas antigas (eram defeito real: catálogo de checklist sem `veiculos` quebrava a abertura do turno)
- [ ] 2.3 Material (saldo do caminhão) e transferências
- [ ] 2.4 Frota: checklist, abastecimento, situação e documentos do veículo
- [ ] 2.5 Segurança: inspeções e desvios
- [ ] 2.6 Almoxarifado e Encerramento

## 3. Conformidade e fechamento

- [x] 3.1 Lint que barra cor fixa e `!important` fora dos tokens; axe sem violações graves: `npm run lint:estilos` (roda antes de todo `npm run build`); cores da câmera do leitor e do papel da assinatura viraram tokens; a11y pelo `e2e/a11y`
- [ ] 3.2 Baselines visuais claro/escuro × tablet/celular; revisão pelo `ui-reviewer`
- [ ] 3.3 Testes em aparelho real: tablet e celular Android (Chrome), iPhone (Safari instalado), atualização sem perda de fila, rascunho e sessão
- [x] 3.4 Reescrever `mobile/CLAUDE.md` (hoje com o contexto de origem) com as regras novas
