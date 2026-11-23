-- =====================================================================
-- V270: Preço dos materiais nos kits construtivos
--
-- O serviço do kit já tem valor pelo contrato (Ação); o material ganha o
-- valor unitário no próprio item do kit, para o kit ter custo de serviço
-- e de material. Vazio quando o material ainda não foi orçado.
-- =====================================================================

ALTER TABLE itens_kits_construtivos ADD COLUMN valor_unitario NUMERIC(15, 4);
