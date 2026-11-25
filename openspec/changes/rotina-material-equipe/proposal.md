## Why

O piloto da empreiteira do MA começa por 3 turmas de Timon que, todo dia, retiram material de manhã, executam e devolvem no
fim do dia no almoxarifado principal. Na revisão de 24/11/2026 a rotina estava difícil: a entrega era feita solicitação por
solicitação, a devolução era um formulário em branco (e tirava do estoque antigo da obra, não do caminhão), havia duas
devoluções diferentes, os códigos SAP 221/921/222/922 apareciam na tela e a ficha da obra empilhava cinco blocos de material.

## What Changes

- **Balcão do almoxarifado** (`/almoxarifado/balcao`): quadro do dia com uma linha por equipe (retirada e devolução). O
  atendimento abre ao lado em três passos — conferir (já preenchido), quem retira (matrícula) e assinatura + foto — e registra
  tudo de uma vez. Retirada entrega todas as solicitações do dia, pula a separação quando ela não é obrigatória e aceita
  excedente com motivo. Devolução sai do caminhão por obra (novo e sucata, estoque ou descarte). Termo imprimível.
- **Regras do balcão** (`/almoxarifado/regras-balcao`, tabela `estoque_parametros`): separação obrigatória, entrega acima do
  pedido, devolução acima do caminhão, exigir assinatura/matrícula/foto.
- **Matrícula do colaborador**: cadastro, coluna na lista e identificação no balcão.
- **Estoque das equipes** (`/almoxarifado/estoque-equipes`): inventário dos caminhões em tabela, com o caminhão por obra na
  própria linha.
- **Nomenclatura**: Retirada/Devolução na tela; concreto vira complemento. Códigos 221/921/222/922 só na importação.
- **Ficha da obra**: resumo do material em uma linha e página própria `/obras/:id/material`; movimentações agrupadas por dia,
  tipo e caminho; sem "Devolução técnica" no topo (a devolução é no balcão).
- **App de campo**: aba Material abre no caminhão por obra (obras de hoje primeiro, sem obra, sucata a devolver); o fechar o
  dia lembra o que levar ao balcão.
- Busca de colaboradores por trecho do nome (antes comparava o nome completo exato).

## Impact

- Backend `estoque`: `BalcaoUseCases`, `ParametrosEstoqueUseCases`, `AtendimentoBalcao`, `ParametrosEstoque`,
  `ComprovanteBalcaoService`, `BalcaoController` (`/v1/balcao`), migração V274. `rh`: matrícula no colaborador.
- Frontend: balcão, termo, estoque das equipes, regras, material da obra, menu "Rotina do dia".
- Mobile: `caminhao-obra.ts`, aba Material, relatório do dia.
