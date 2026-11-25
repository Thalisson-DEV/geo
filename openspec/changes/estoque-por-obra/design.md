## Context

Locais de estoque hoje: FISICO (almoxarifado), CAMPO (caminhão da equipe), OBRA (custódia do que está na obra), FROTA.
`saldos` tem chave (local, material, condição) e é lido em ~35 pontos (comercial, frota, séries, relatórios, app).
`movimentacoes_estoque` já carrega `id_obra` e `id_equipe` nas operações técnicas.

## Decisões

### D1. Alocação por obra ao lado do saldo (a chave de `saldos` não muda)
Padrão "disponível × alocado" dos ERPs de obra (estoque especial por projeto). `alocacoes_obra_estoque` (local, material,
condição, obra, quantidade >= 0, única por chave). Livre = saldo do local − soma das alocações. Mudar a chave de `saldos`
obrigaria rever 35 consultas e o app; a alocação é aditiva e os fluxos antigos continuam corretos para o físico.
Se um fluxo antigo baixar o físico abaixo do alocado, a leitura mostra a diferença como divergência.

### D2. Estoque OBRA = aplicado na obra
O estoque OBRA já representa a custódia da obra (a devolução técnica sai dele). A aplicação passa a ser caminhão → OBRA
(movimento APLICACAO com `id_obra`). Assim "aplicado" tem saldo e a devolução técnica de material retirado continua igual.

### D3. Ordem de consumo na aplicação e rastro entre obras
Baixa do caminhão da equipe que apontou: (1) alocado à própria obra; (2) livre; (3) alocado a outras obras, maior saldo
primeiro; (4) o que faltar baixa o físico mesmo negativo (débito permissivo, como a aplicação comercial). Cada parte vira um
movimento APLICACAO próprio (caminhão → OBRA) com `id_obra_origem` = obra de onde saiu (nulo para livre e para "sem saldo",
este marcado na observação). O rastro da ficha lista o que veio de outra obra, do livre e sem saldo, com a equipe. Nunca recusa o apontamento:
o app é offline e o fato já aconteceu (decisão do usuário em 23/11: aceita e deixa rastro).

### D4. Evento do apontamento
`ItemExecutadoEvent` ganha `idMaterial` (nulo para serviço) e `retirada`. Novo `ApontamentoEstornadoEvent`. O estoque escuta
com `@EventListener` na mesma transação. O estorno desfaz pelos movimentos com `id_referencia_operacao = idApontamento`.

### D5. Canteiro é um local
Tipo de estoque CANTEIRO (previsto no D11 da change evoluir-processo-obras), com base operacional, referência e coordenadas
em `estoques`. Deixar/pegar = TRANSFERENCIA caminhão ↔ canteiro levando a alocação junto.

### D6. Devolução de sobra e remanejamento
Devolução de sobra: caminhão/canteiro → almoxarifado FISICO, movimento DEVOLUCAO com `id_obra`; a alocação sai e o material
volta livre. Remanejamento: só muda a alocação dentro do mesmo local (obra A → obra B, ou A → livre), movimento REMANEJAMENTO
com motivo, origem e destino no mesmo local.

### D7. Migração dos dados existentes
Backfill: para cada caminhão, aloca à obra o líquido das entregas técnicas (ENTREGA − ESTORNO − DEVOLUCAO com `id_obra`),
limitado ao saldo físico atual do caminhão.

### D8. Apontamentos anteriores à mudança
`POST /v1/estoque-obra/apontamentos/reprocessar` baixa os apontamentos ativos de material que ainda não têm movimento
(idempotente). Rodado uma vez no `nexo-db` em 23/11/2026 (9 apontamentos da CON-PDR-01).

### D9. Canteiro pelo app sem sinal
O app grava o movimento na fila (`/v1/estoque-obra/canteiros/{id}/movimentos`, com `idLocal` gerado no aparelho; o reenvio
devolve o mesmo movimento) e atualiza o saldo por obra local na hora. Material com série fica fora do canteiro (usa a
transferência, que registra a série).

## Riscos
- Item de material sem `idMaterial` no planejamento → sem baixa, registrado em log.
- Séries: o apontamento não informa série; a aplicação baixa quantidade, e a série segue pelo fluxo de conciliação existente.

### D10. Lista de canteiros em modo cliente
Exceção registrada à regra "p-table lazy + PageResponse": canteiros são dezenas por implantação, a lista vem inteira (`GET /v1/estoque-obra/canteiros`) e a busca é na própria tabela. Se passar de algumas centenas, paginar no servidor.
