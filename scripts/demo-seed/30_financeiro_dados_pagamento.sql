-- Dados de pagamento das solicitações de pagamento: o campo é cifrado pela aplicação, então copia o texto já cifrado
-- (e o índice de busca) dos dados bancários do fornecedor, gravados pela API no 29_financeiro_documentos.py.
BEGIN;
UPDATE financeiro_solicitacao_pagamento s SET dados_pagamento = f.dados_bancarios, dados_pagamento_busca = f.dados_bancarios_busca
  FROM financeiro_fornecedor f
 WHERE f.id = s.fornecedor_id AND f.dados_bancarios IS NOT NULL AND s.dados_pagamento IS NULL;
COMMIT;
