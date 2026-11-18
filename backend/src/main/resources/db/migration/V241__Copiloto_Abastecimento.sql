-- A Bússola lê o abastecimento da frota: pedidos com situação, posto, base, condutor e
-- alertas, e os itens entregues com litros, valor e R$/l. Base para perguntas como "gasto por
-- posto no mês", "consumo da placa" e "pedidos com alerta aguardando aprovação".
-- Aditiva (só views no schema copiloto). Rollback: DROP VIEW das duas views.

CREATE OR REPLACE VIEW copiloto.abastecimentos AS
SELECT a.id                                                              AS abastecimento_id,
       v.placa,
       b.nome                                                            AS base_operacional,
       p.nome                                                            AS posto,
       c.nome_completo                                                   AS condutor,
       a.situacao,
       a.solicitado_em,
       date_trunc('month', a.solicitado_em AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
       a.aprovado_em,
       a.liberado_em,
       a.realizado_em,
       EXTRACT(EPOCH FROM (a.aprovado_em - a.solicitado_em)) / 3600.0    AS horas_ate_aprovacao,
       a.medicao_solicitacao,
       a.medicao_realizado,
       (SELECT SUM(i.valor_total) FROM public.frota_abastecimento_itens i
         WHERE i.id_abastecimento = a.id AND i.ativo = TRUE)             AS valor_total,
       (SELECT SUM(i.quantidade) FROM public.frota_abastecimento_itens i
         JOIN public.frota_produtos_abastecimento pr ON pr.id = i.id_produto
         WHERE i.id_abastecimento = a.id AND i.ativo = TRUE AND pr.categoria = 'COMBUSTIVEL') AS litros_combustivel,
       (SELECT COUNT(*) FROM public.frota_abastecimento_alertas al
         WHERE al.id_abastecimento = a.id AND al.ativo = TRUE)           AS quantidade_alertas,
       (SELECT string_agg(DISTINCT al.tipo, ', ') FROM public.frota_abastecimento_alertas al
         WHERE al.id_abastecimento = a.id AND al.ativo = TRUE)           AS alertas,
       a.motivo_reprovacao,
       a.motivo_cancelamento,
       a.id_fatura IS NOT NULL                                           AS faturado
FROM public.frota_abastecimentos a
JOIN public.veiculos v ON v.id = a.id_veiculo
JOIN public.frota_postos p ON p.id = a.id_posto
LEFT JOIN public.bases_operacionais b ON b.id = a.id_base_operacional
LEFT JOIN public.colaboradores c ON c.id = a.id_condutor
WHERE a.ativo = TRUE;

CREATE OR REPLACE VIEW copiloto.abastecimento_itens AS
SELECT i.id                                                              AS item_id,
       a.id                                                              AS abastecimento_id,
       v.placa,
       b.nome                                                            AS base_operacional,
       p.nome                                                            AS posto,
       a.situacao,
       a.realizado_em,
       date_trunc('month', COALESCE(a.realizado_em, a.solicitado_em) AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
       pp.nome                                                           AS produto_pedido,
       pr.nome                                                           AS produto_entregue,
       COALESCE(pr.categoria, pp.categoria)                              AS categoria,
       i.quantidade_pedida,
       i.quantidade,
       i.valor_total,
       i.valor_unitario,
       i.tanque_cheio
FROM public.frota_abastecimento_itens i
JOIN public.frota_abastecimentos a ON a.id = i.id_abastecimento
JOIN public.veiculos v ON v.id = a.id_veiculo
JOIN public.frota_postos p ON p.id = a.id_posto
JOIN public.frota_produtos_abastecimento pp ON pp.id = i.id_produto_pedido
LEFT JOIN public.frota_produtos_abastecimento pr ON pr.id = i.id_produto
LEFT JOIN public.bases_operacionais b ON b.id = a.id_base_operacional
WHERE i.ativo = TRUE AND a.ativo = TRUE;
