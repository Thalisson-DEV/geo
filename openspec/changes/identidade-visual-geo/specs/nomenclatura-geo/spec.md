## ADDED Requirements

### Requirement: Nenhum identificador do sistema de origem
O código do frontend e do backend SHALL usar o prefixo `geo` (tokens `--geo-*`, componentes `geo-*`, entrypoints `@geo/ui*`, classes e funções `Geo*`/`geo*`, chaves `geo_*`, propriedades `geo.*`). O prefixo `ces`, em qualquer caixa, MUST NOT aparecer em identificadores, nomes de arquivo, chaves de armazenamento, cookies, propriedades de configuração ou nomes de projeto, salvo no código de migração que lê os nomes antigos.

#### Scenario: Prefixo antigo reintroduzido
- **WHEN** um porte traz `<ces-button>` ou `var(--ces-brand)`
- **THEN** o `ds:check` falha e indica `<geo-button>` / `var(--geo-brand)`

#### Scenario: Varredura do repositório
- **WHEN** a verificação de nomenclatura roda em `frontend/` e `backend/`
- **THEN** só encontra `ces` nos arquivos isentos (migrações Flyway, containers locais) e nas linhas marcadas com `renomear-geo: manter`

### Requirement: Renomeação reproduzível por script
A renomeação SHALL ser feita por um script versionado, idempotente e que só altera ocorrências ancoradas (prefixos `--ces-`, `ces-` de seletor/classe, `@ces/`, `ces`/`Ces` seguido de maiúscula, `ces_`, `ces.` de configuração), nunca palavras que contêm "ces" (ex.: "acesso", "processo", "necessário"). O script MUST poder ser rodado em qualquer branch antes do merge.

#### Scenario: Palavras preservadas
- **WHEN** o script roda sobre um template com "Seu acesso ao processo"
- **THEN** o texto continua igual

#### Scenario: Branch paralela
- **WHEN** uma branch criada antes da renomeação roda o script e depois faz merge com a principal
- **THEN** não há conflito causado pelos nomes trocados

### Requirement: Dados do aparelho preservados
As chaves salvas no navegador (`ces_*`) SHALL ser migradas para `geo_*` na primeira abertura após a atualização, copiando o valor e removendo a antiga. A sessão, a chave de criptografia local, a fila de sincronização e as preferências MUST continuar funcionando sem novo login e sem perda de itens enfileirados.

#### Scenario: Atualização com fila offline
- **WHEN** um aparelho com 3 itens enfileirados e sessão ativa abre a versão nova
- **THEN** o usuário continua logado, os 3 itens continuam na fila e são sincronizados normalmente

#### Scenario: Migração repetida
- **WHEN** a migração roda de novo num aparelho já migrado
- **THEN** nada muda e nenhuma chave nova é sobrescrita por uma antiga

### Requirement: Cookie de sessão com transição
O cookie de renovação SHALL passar a se chamar `geo_sessao`. Durante o período de transição definido no design, o backend MUST aceitar o cookie antigo `ces_sessao`, responder já com o novo e apagar o antigo.

#### Scenario: Usuário com cookie antigo
- **WHEN** um navegador só com `ces_sessao` renova o token
- **THEN** a renovação funciona, a resposta grava `geo_sessao` e expira `ces_sessao`

### Requirement: Configuração do backend com prefixo geo
As propriedades `ces.*` (assistente, e-mail, R2, telemetria da frota, auditoria, observabilidade, limites) SHALL passar para `geo.*`, e a aplicação MUST falhar ao iniciar, com mensagem que aponta a nova chave, se encontrar uma propriedade `ces.*` definida, para que nenhuma configuração seja ignorada em silêncio.

#### Scenario: Variável antiga no deploy
- **WHEN** o ambiente ainda define `CES_EMAIL_PROVEDOR`
- **THEN** a aplicação não sobe e o log diz para usar `GEO_EMAIL_PROVEDOR`

### Requirement: Rota da Bússola
A rota da assistente SHALL ser `/bussola` (e `/bussola/:id`), e os endereços antigos `/copiloto` e `/copiloto/:id` MUST redirecionar para os novos, preservando o id da conversa.

#### Scenario: Link antigo salvo
- **WHEN** o usuário abre um favorito `/copiloto/123`
- **THEN** cai em `/bussola/123` com a mesma conversa
