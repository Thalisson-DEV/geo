## Why

Na apresentação de 23/11/2026 o saldo da obra 430126363 ficou em zero enquanto as solicitações eram entregues. A causa é de
modelo: a entrega técnica leva o material do almoxarifado para o caminhão da equipe sem guardar para qual obra ele foi; o
"estoque da obra" só muda na devolução técnica e no fechamento; e o apontamento de execução não baixa material nenhum.
Resultado: ninguém sabe onde está o material de uma obra, a equipe pode aplicar material de outra obra sem deixar rastro, a
sobra de uma programação não feita volta ao almoxarifado sem ligação com a obra, e não existe lugar para registrar o material
deixado num canteiro perto da obra.

## What Changes

- **Material carimbado por obra (estoque de projeto).** Cada local (almoxarifado, caminhão da equipe, canteiro) passa a saber
  quanto do seu saldo é de cada obra. O saldo físico do local não muda de forma; ao lado dele entra a alocação por obra, e o que
  não está alocado é livre.
- **Entrega técnica** aloca no caminhão o material para a obra da solicitação; estorno e devolução tiram a alocação.
- **Aplicação pelo apontamento**: apontar um item de material da obra baixa o material do caminhão e o lança como aplicado na
  obra. Nunca trava o campo: se faltar material da própria obra, usa o livre e depois o de outra obra, registrando o
  empréstimo entre obras (rastro) para o administrativo ver; se faltar de vez, o saldo da equipe fica negativo e aparece.
  Estornar o apontamento desfaz a baixa. Retirada de material entra no caminhão como sucata da obra.
- **Devolução de sobra**: material de uma programação não feita volta do caminhão (ou do canteiro) ao almoxarifado, ligado à
  obra, num passo simples do almoxarifado.
- **Canteiros**: novo tipo de local, perto das obras, com base operacional, referência e coordenadas. A equipe deixa e pega
  material no canteiro pelo app sem perder a obra do material.
- **Remanejar entre obras**: o administrativo move material de uma obra para outra (ou libera) no mesmo local, com motivo.
- **Visões**: na ficha da obra, "Material da obra" por material (entregue, aplicado, com equipes/canteiros, devolvido, de/para
  outras obras) e onde ele está; no app, o caminhão separado por obra com as ações de canteiro; cadastro e saldo de canteiros.

Fica para depois desta change (pedido do usuário): alinhar as demais movimentações e transferências ao processo por obra e
tirar os restos do processo comercial do app.

## Impact

- Backend `estoque`: tabela `alocacoes_obra_estoque`, colunas novas em `estoques` (canteiro) e `movimentacoes_estoque`
  (`id_obra_origem`), tipo de estoque CANTEIRO, serviço de alocação, listener do apontamento, endpoints de devolução de sobra,
  canteiros, remanejamento e consulta por obra e por equipe. `ItemExecutadoEvent` ganha material e operação; novo evento de
  estorno de apontamento.
- Backend `obras`: publica os dados de material no apontamento e o estorno.
- Frontend: ficha da obra (material da obra), canteiros no almoxarifado, devolução de sobra e remanejamento.
- Mobile: caminhão por obra, deixar/pegar no canteiro.
