## Why

O web acabou de ganhar a identidade GEO (Inter, neutros zinc, um acento azul, ícones Lucide, claro/escuro), mas o app de campo
(`mobile/`) ainda tem o visual e a base técnica de origem: Angular 20 com zone.js e `@angular/animations`, tokens `--ces-*`, azul
e fonte do sistema próprios. Antes de levar Obras para o campo, o app precisa da mesma marca e de um padrão de telas que siga o que
o mercado já consolidou para apps de campo (Material 3 e diretrizes da Apple), pensado para quem trabalha com pressa, luva, sol e
sem sinal. Diretriz do produto: tudo o que puder ser facilitado para a equipe de campo deve ser facilitado.

## What Changes

- **Fundação técnica**: Angular 22 zoneless, sem `@angular/animations`; prefixo `ces` → `geo` no app (tokens, componentes,
  chaves do navegador com migração; bancos do aparelho mantêm o nome); Tailwind removido do app; testes no Vitest.
- **Identidade GEO no app**: mesmos tokens de marca do web (acento azul, neutros zinc, Inter empacotada no app para funcionar
  offline, ícones Lucide), claro/escuro/seguir o sistema e o modo sol (alto contraste) já existente, com **escala de toque**: texto
  base 15–16px, alvos de toque de 48px ou mais, espaçamentos maiores que os do web compacto.
- **Shell**: barra superior com título grande, barra de abas inferior (3 a 5 destinos por perfil), trilho lateral no tablet em
  paisagem, áreas seguras, selo de envios pendentes, indicador de rede e aviso de nova versão.
- **Componentes base**: lista e cartão, folha inferior, seletor, campo de quantidade, assistente em passos, câmera/galeria de
  fotos, status de envio, estados vazio/carregando/erro (skeleton), puxar para atualizar, ação por arrasto, desfazer, ditado por voz.
- **Layout adaptável**: tablet primeiro (≈70% dos aparelhos) com lista + detalhe lado a lado; celular em coluna única com folha;
  retrato e paisagem.
- **Telas existentes migradas** para os novos componentes, módulo a módulo, sem mudar regras: login, Hoje, Serviços, Material/
  solicitações/transferências, Frota (checklist, abastecimento, documentos), Segurança (inspeções, desvios), Almoxarifado,
  Encerramento e Conta.
- **Movimento e toque**: tokens de duração/curva do sistema de movimento GEO, feedback de toque imediato, vibração curta de
  confirmação quando disponível, respeito a "reduzir movimento".
- **Conformidade**: screenshots Playwright claro/escuro em tablet e celular, acessibilidade (axe), lint que barra cor fixa fora dos
  tokens.

**Fica para etapas futuras**: empacotamento nativo (Capacitor) e loja de aplicativos.

## Capabilities

### New Capabilities
- `fundacao-app-campo`: base técnica do app (Angular 22 zoneless, prefixo geo, migração de dados, testes).
- `shell-app-campo`: casca do app (barra superior, abas, trilho no tablet, áreas seguras, estados globais).
- `componentes-app-campo`: componentes base de toque com a identidade GEO.
- `telas-app-campo`: padrões de tela adaptáveis e migração das telas existentes.

### Modified Capabilities
<!-- Nenhuma: não há specs principais do app em openspec/specs/. -->

## Impact

- App `mobile/` inteiro (dependências, estilos, componentes `ui/`, shell, todas as features).
- Dados no aparelho: renomear banco e chaves locais com migração, sem perder fila, rascunhos nem sessão.
- Testes e2e/visuais do app (baselines refeitas).
- Pré-requisito da change `execucao-campo-obras`.
