<!-- Dependências: 0 antes de tudo; 1 depois de 0; módulos de 2 em paralelo depois de 1; 3 ao final.
     A parte de app da change execucao-campo-obras começa depois da frente 1. -->

## 0. Fundação técnica

- [x] 0.1 Testes de caracterização das telas principais rodando antes da atualização (base de comparação). Baseline em 20/11/2026: 481 unitários ok; e2e Android 64 ok e 9 falhas que já existiam (navegação e turno de caracterização desatualizados; rolagem em `retomada.spec.ts:72` falha também no código original)
- [x] 0.2 Angular 20 → 21 → 22 com `ng update`; zoneless; remover `@angular/animations` e `zone.js`
- [x] 0.3 Tailwind removido (não era usado pelas telas; reset equivalente em `styles/_reset.scss`, idêntico em pixel); Karma/Jasmine → Vitest em modo navegador (Chromium); Cypress removido
- [x] 0.4 Script `ces` → `geo` (`tools/renomear-geo.mjs` com `mobile` no escopo) com migração das chaves locais na primeira abertura; bancos IndexedDB, cache dos documentos do veículo, travas entre abas e o serviço do backend no Railway mantêm o nome (`renomear-geo: manter`)
- [x] 0.5 Manifesto ("GEO Campo", orientação livre para o tablet) e ícones/logo da marca GEO; a fonte entra no cache com a 1.1

## 1. Identidade, shell e componentes

- [ ] 1.1 Tokens `--geo-*` do app: cores da marca (claro/escuro/alto contraste), Inter empacotada, escala de toque, raios, elevação, movimento
- [ ] 1.2 Ícones Lucide no componente de ícone
- [ ] 1.3 Shell: barra superior com título grande, abas inferiores por perfil, trilho lateral no tablet em paisagem, áreas seguras, selo de pendentes, indicador de rede, aviso de nova versão
- [ ] 1.4 Componentes: botão (principal, secundário, perigo), lista/cartão, folha inferior, seletor, campo de quantidade, campos de formulário, assistente em passos
- [ ] 1.5 Componentes: câmera/galeria com carimbo, status de envio, estados vazio/carregando (skeleton)/erro, puxar para atualizar, ação por arrasto, desfazer, ditado por voz
- [ ] 1.6 Layout lista + detalhe adaptável (celular, tablet retrato, tablet paisagem)
- [ ] 1.7 Catálogo interno dos componentes (rota de desenvolvimento) com screenshots claro/escuro

## 2. Migração das telas existentes (em paralelo por módulo)

- [ ] 2.1 Login, Hoje e Conta
- [ ] 2.2 Serviços (notas comerciais) e turno comercial
- [ ] 2.3 Material, solicitações e transferências
- [ ] 2.4 Frota: checklist, abastecimento, situação e documentos do veículo
- [ ] 2.5 Segurança: inspeções e desvios
- [ ] 2.6 Almoxarifado e Encerramento

## 3. Conformidade e fechamento

- [ ] 3.1 Lint que barra cor fixa e `!important` fora dos tokens; axe sem violações graves
- [ ] 3.2 Baselines visuais claro/escuro × tablet/celular; revisão pelo `ui-reviewer`
- [ ] 3.3 Testes em aparelho real: tablet e celular Android (Chrome), iPhone (Safari instalado), atualização sem perda de fila, rascunho e sessão
- [ ] 3.4 Reescrever `mobile/CLAUDE.md` (hoje com o contexto de origem) com as regras novas
