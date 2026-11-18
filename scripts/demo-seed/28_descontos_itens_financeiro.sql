-- Itens dos descontos em folha (o "Itens a Descontar" conta desconto_item; o valor sugerido é a soma dos itens)
-- e campos obrigatórios do formulário de pagamento que a carga original deixou vazios (compra prévia, motivo,
-- tipo de despesa). Idempotente.
BEGIN;
SELECT setseed(0.28);

CREATE TEMP TABLE _tpl (obs text, ordem int, tipo text, descr text, peso numeric) ON COMMIT DROP;
INSERT INTO _tpl VALUES
 ('Avaria no retrovisor da viatura em manobra', 1, 'Frota', 'Retrovisor externo lado direito com lente e capa', 0.72),
 ('Avaria no retrovisor da viatura em manobra', 2, 'Frota', 'Mão de obra de funilaria e pintura da capa', 0.28),
 ('Extravio de alicate amperímetro durante atendimento', 1, 'Ferramental', 'Alicate amperímetro digital CAT III 1000 A', 0.86),
 ('Extravio de alicate amperímetro durante atendimento', 2, 'Ferramental', 'Estojo de transporte e pontas de prova', 0.14),
 ('Avaria em escada de fibra', 1, 'EPC', 'Escada de fibra extensível 7,2 m (2 lances)', 0.81),
 ('Avaria em escada de fibra', 2, 'EPC', 'Kit de sapatas antiderrapantes e cinta de amarração', 0.19),
 ('Dano ao rádio comunicador', 1, 'Ferramental', 'Rádio comunicador portátil VHF', 0.78),
 ('Dano ao rádio comunicador', 2, 'Ferramental', 'Bateria de íon-lítio 2.000 mAh do rádio', 0.14),
 ('Dano ao rádio comunicador', 3, 'Ferramental', 'Antena flexível do rádio', 0.08),
 ('Perda de EPI (luva isolante classe 0)', 1, 'EPI', 'Luva isolante de borracha classe 0 (par)', 0.68),
 ('Perda de EPI (luva isolante classe 0)', 2, 'EPI', 'Luva de cobertura em vaqueta (par)', 0.20),
 ('Perda de EPI (luva isolante classe 0)', 3, 'EPI', 'Bolsa de proteção para luva isolante', 0.12),
 ('Uso indevido de cartão combustível', 1, 'Frota', 'Abastecimento fora da rota autorizada (diesel S10)', 0.83),
 ('Uso indevido de cartão combustível', 2, 'Frota', 'Taxa administrativa do cartão combustível', 0.17);

-- Rateio: itens proporcionais ao peso, último item absorve o arredondamento para fechar no valor sugerido
INSERT INTO desconto_item (id, desconto_id, tipo_equipamento_id, descricao_material, valor, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), x.id, te.id, x.descr,
       CASE WHEN x.ordem = x.ultimo THEN x.valor_sugerido - x.acumulado_antes ELSE x.parcela END,
       0, x.data_criacao, x.usuario_criacao, true
  FROM (SELECT d.id, d.valor_sugerido, d.data_criacao, d.usuario_criacao, t.ordem, t.tipo, t.descr,
               round(d.valor_sugerido * t.peso, 2) parcela,
               max(t.ordem) OVER (PARTITION BY d.id) ultimo,
               coalesce(sum(round(d.valor_sugerido * t.peso, 2)) OVER (PARTITION BY d.id ORDER BY t.ordem ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) acumulado_antes
          FROM desconto d JOIN _tpl t ON t.obs = d.observacoes
         WHERE NOT EXISTS (SELECT 1 FROM desconto_item i WHERE i.desconto_id = d.id)) x
  JOIN tipo_equipamento te ON te.descricao = x.tipo;

-- Descontos com outra observação: um item único com o valor total
INSERT INTO desconto_item (id, desconto_id, tipo_equipamento_id, descricao_material, valor, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), d.id, (SELECT id FROM tipo_equipamento WHERE descricao = 'Ferramental'), left(coalesce(d.observacoes, 'Material avariado'), 255),
       d.valor_sugerido, 0, d.data_criacao, d.usuario_criacao, true
  FROM desconto d WHERE NOT EXISTS (SELECT 1 FROM desconto_item i WHERE i.desconto_id = d.id) AND d.valor_sugerido > 0;

-- Histórico: inclusão dos itens logo após o lançamento
INSERT INTO desconto_evento (id, id_desconto, tipo, status_anterior, status_novo, id_usuario, valor, texto, ocorrido_em)
SELECT gen_random_uuid(), i.desconto_id, 'ITEM_INCLUIDO', 'SOLICITADO', 'SOLICITADO', d.usuario_solicitante_id, i.valor, i.descricao_material,
       d.data_criacao + interval '2 minutes'
  FROM desconto_item i JOIN desconto d ON d.id = i.desconto_id
 WHERE NOT EXISTS (SELECT 1 FROM desconto_evento e WHERE e.id_desconto = d.id AND e.tipo = 'ITEM_INCLUIDO');

-- Pagamentos: compra prévia (serviços de manutenção vinculados a uma compra aprovada) ou motivo sem compra
WITH c AS (SELECT id, row_number() OVER (ORDER BY numero) n FROM financeiro_solicitacao_compra WHERE status = 'APROVADO'),
     p AS (SELECT id, row_number() OVER (ORDER BY numero) n FROM financeiro_solicitacao_pagamento
            WHERE possui_compra_previa IS NULL AND descricao IN ('Troca de pastilhas de freio', 'Locação de gerador', 'Borracharia e alinhamento'))
UPDATE financeiro_solicitacao_pagamento s SET possui_compra_previa = true, solicitacao_compra_id = c.id
  FROM p JOIN c ON c.n = p.n WHERE s.id = p.id;
UPDATE financeiro_solicitacao_pagamento SET possui_compra_previa = false,
       motivo_sem_compra = CASE WHEN descricao LIKE 'Abastecimento%' THEN 'COMBUSTIVEL_FORNECEDOR_CADASTRADO'
                                WHEN descricao IN ('Lavagem de viaturas', 'Locação de gerador') THEN 'DESPESA_MENSAL_RECORRENTE' ELSE 'OUTRA' END
 WHERE possui_compra_previa IS NULL;
UPDATE financeiro_solicitacao_pagamento SET tipo_despesa = CASE
         WHEN descricao LIKE 'Abastecimento%' THEN 'COMBUSTIVEL' WHEN descricao LIKE 'Locação%' THEN 'LOCACAO'
         WHEN descricao IN ('Troca de pastilhas de freio', 'Borracharia e alinhamento', 'Serviço de guincho', 'Lavagem de viaturas') THEN 'MANUTENCAO'
         ELSE 'SERVICO' END
 WHERE tipo_despesa IS NULL;
-- dados_pagamento é cifrado pela aplicação: preenchido pelo 29 (API) + 30 (cópia do texto cifrado)
UPDATE financeiro_solicitacao_pagamento SET justificativa_sem_nf = 'Fornecedor emite apenas cupom; recibo assinado anexado.' WHERE NOT tem_nf AND justificativa_sem_nf IS NULL;
UPDATE financeiro_solicitacao_pagamento SET numero_nf = (40000 + numero * 37)::text WHERE tem_nf AND numero_nf IS NULL;
UPDATE financeiro_solicitacao_compra SET justificativa_sem_nf = 'Compra em comércio local sem emissão de nota; recibo anexado.' WHERE NOT tem_nf AND justificativa_sem_nf IS NULL;
COMMIT;
