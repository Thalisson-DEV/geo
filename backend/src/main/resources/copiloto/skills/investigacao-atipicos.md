---
nome: investigacao-atipicos
titulo: Investigação de registros fora do normal
descricao: Encontra, em qualquer módulo, os registros com valor, quantidade, duração ou composição fora do típico dos seus pares (notas, solicitações, turnos, compras...) e entrega a lista com o motivo de cada um em planilha.
autoridades: []
ciclos: 50
chamadas: 120
---
# Investigação de registros fora do normal

Serve para pedidos como "quais notas ficaram com valor acima do normal", "que solicitações pediram material demais",
"quais turnos duraram muito mais que o comum", "que compras saíram caras para o fornecedor". A pergunta é sempre a
mesma: **o registro comparado com os seus pares**. Faça o trabalho com as ferramentas de análise, não com Python.

## Orçamento
Este roteiro cabe em 5 ou 6 etapas. Não explore o catálogo além de descrever as fontes que vai consultar (a do
registro e, se precisar, a dos itens). Não procure cadastros, conceitos ou tabelas de preço para montar o típico: o
típico vem dos próprios registros. Exclusões pedidas pelo usuário (ex.: "emergência") viram um filtro por texto numa
coluna que já existe (tipo, ação, descrição); se nada casar, diga isso em uma frase e siga.

## Passo a passo
1. **Defina o registro, o valor e os pares.** Registro: nota, solicitação, turno, compra. Valor: valor faturado,
   quantidade, duração, preço. Pares: a coluna que torna a comparação justa (tipo de serviço, material, equipe, base,
   fornecedor). Se o usuário der o corte ("3x o normal", "acima de R$ 500"), use o dele.
2. **Traga a base inteira numa consulta só**, com uma linha por registro, as colunas de identificação que vão para a
   planilha (data, base, equipe, tipo...) e a coluna de pares. Filtre período e base no SQL. Se o total passar do
   limite, reduza o período: o típico de uma base cortada engana. Aplique na consulta as exclusões pedidas pelo
   usuário (ex.: emergência, um item cujo preço mudou). Não calcule mediana no SQL (o PostgreSQL não tem
   `median`): a ferramenta do passo 3 calcula o típico.
   Exemplo para notas: `select execucao_id, data, base_operacional, equipe, tipo_servico, valor_total_faturado,
   total_acoes from copiloto.execucoes_comerciais where status_execucao = 'CONCLUIDO' and base_operacional in (...)
   and data between ... and ...`. Para a composição: `execucoes_acoes` junto com `execucoes_comerciais` por
   `execucao_id`, uma linha por ação, com `tipo_servico`.
3. **Valor fora do típico:** `detectar_anomalias` com `grupos` (ex.: `["tipo_servico"]`), método `multiplo` e o corte
   (padrão 2,5x a mediana do grupo). A saída já traz típico do grupo, vezes o típico, percentil e motivo.
4. **Composição** (ações de uma nota, materiais de uma solicitação, atividades de um turno): consulte com uma linha
   por item (registro + grupo + item) e use `detectar_itens_incomuns`. Ela aponta itens raros no grupo, itens
   repetidos fora do comum e registros com itens demais.
5. **Junte as duas visões se o usuário pediu as duas** com `executar_python`, nunca com uma consulta SQL nova (a
   junção pesada estoura o tempo do banco): um único script lê os dois resultados (`rA.csv` do passo 3 e `rB.csv`
   do passo 4), junta pela coluna do registro (outer join), monta a coluna do motivo combinando os dois textos e
   grava um único `.xlsx` final com openpyxl. Confira com print() antes de gravar; não grave versões
   intermediárias, porque todo arquivo gravado aparece para o usuário.
6. **Entregue a planilha .xlsx**: com uma visão só, `exportar_planilha` a partir do resultado do passo 3 ou 4; com
   as duas, o arquivo do passo 5. Pedido de Excel ou planilha é sempre .xlsx, nunca CSV. Na resposta, diga quantos
   registros, os critérios usados e os 5 casos mais fortes. Não liste centenas de linhas no chat.

## SQL no PostgreSQL
- `round` com casas decimais só aceita numeric: `round(valor::numeric, 2)`.
- Não há `median`; se precisar, `percentile_cont(0.5) within group (order by valor)`. Para o típico do grupo use as
  ferramentas dos passos 3 e 4.
- Agregação não entra no `group by`; agrupe pelas colunas e agregue no `select`.

## Cuidados
- Valor de nota comercial é a soma do preço de tabela das ações lançadas (contrato e data). Valor alto quase
  sempre é ação a mais, ação incomum para o tipo de serviço ou mudança na tabela de preços; diga qual.
- Grupos com poucos registros não têm típico confiável e ficam de fora. Informe quantos ficaram.
- "Fora do normal" não é erro nem fraude. Apresente como ponto para conferir, com o motivo.
- Use `executar_python` só para o que as ferramentas não fazem (regressão, modelo próprio, formato especial de
  planilha), num script curto que lê `rN.csv`.
