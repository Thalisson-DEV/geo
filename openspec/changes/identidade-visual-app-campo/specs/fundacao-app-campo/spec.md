## ADDED Requirements

### Requirement: Base técnica alinhada ao web
O app SHALL rodar em Angular 22 sem zone.js e sem `@angular/animations`, com testes unitários no Vitest e e2e no Playwright.

#### Scenario: Build sem dependências legadas
- **WHEN** o app é compilado para produção
- **THEN** o bundle não inclui zone.js nem `@angular/animations`

### Requirement: Migração de dados do aparelho
A troca do prefixo `ces` por `geo` SHALL migrar as chaves do navegador na primeira abertura da nova versão sem perder fila de
envio, rascunhos, sessão nem preferências; os bancos do aparelho MUST manter o nome, e uma chave nova já existente MUST NOT ser
sobrescrita pela antiga.

#### Scenario: Atualizar com envios pendentes
- **WHEN** o aparelho tem 5 lançamentos na fila e abre a nova versão sem sinal
- **THEN** os 5 lançamentos continuam na fila e são enviados ao voltar a conexão

#### Scenario: Atualizar sem rede
- **WHEN** o aparelho da versão anterior abre a nova versão sem conexão
- **THEN** o encarregado continua dentro do app, sem pedir login

### Requirement: Funcionar sem sinal desde a instalação
Fonte, ícones e telas SHALL ficar no cache do aparelho após a primeira abertura, e o app MUST abrir sem conexão.

#### Scenario: Abrir sem sinal
- **WHEN** o encarregado abre o app instalado sem conexão
- **THEN** o app abre com a fonte e os ícones da marca
