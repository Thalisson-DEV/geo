-- Demonstração: linha do tempo dos descontos (tabela desconto_evento, criada na V230).
-- A V230 já reconstrói os eventos de lançamento, validação, baixa e rejeição a partir dos
-- descontos existentes. Este script acrescenta ajustes registrados pelo DP para a linha do
-- tempo ter mais de um passo antes da decisão. Não executar em produção.

INSERT INTO desconto_evento (id, id_desconto, tipo, status_anterior, status_novo, id_usuario, valor, texto, id_anexo, ocorrido_em)
SELECT gen_random_uuid(), d.id, 'DADOS_ALTERADOS', 'SOLICITADO', 'SOLICITADO', d.usuario_solicitante_id, NULL,
       'Descrição da ocorrência complementada com o número da nota de devolução do almoxarifado.',
       NULL, d.data_criacao + INTERVAL '3 hours'
  FROM desconto d
 WHERE d.status = 'SOLICITADO'
 ORDER BY d.data_criacao DESC
 LIMIT 3;

INSERT INTO desconto_evento (id, id_desconto, tipo, status_anterior, status_novo, id_usuario, valor, texto, id_anexo, ocorrido_em)
SELECT gen_random_uuid(), d.id, 'ITEM_ALTERADO', 'SOLICITADO', 'SOLICITADO', d.usuario_solicitante_id, d.valor_validado,
       'Valor do item revisado conforme a tabela de preços vigente do material.',
       NULL, d.data_validacao - INTERVAL '1 day'
  FROM desconto d
 WHERE d.status IN ('VALIDADO', 'BAIXADO') AND d.data_validacao IS NOT NULL
 ORDER BY d.data_validacao DESC
 LIMIT 2;
