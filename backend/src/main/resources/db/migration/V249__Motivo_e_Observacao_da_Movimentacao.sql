-- =====================================================================
-- V249: Motivo e observação da movimentação
--
-- Entrada, baixa e transferência pediam motivo e observação, mas não havia
-- onde guardar. Valem para a operação inteira e se repetem nas linhas dela.
-- Operações antigas ficam sem motivo.
--
-- A V226 (estoque da oficina da frota) já criou motivo VARCHAR(40) e observacao VARCHAR(500)
-- para as peças da frota. O motivo da frota passa para motivo_frota; a observação é a mesma
-- coluna para os dois, ampliada para 1000.
-- Rollback: DROP COLUMN motivo; RENAME motivo_frota TO motivo; observacao de volta a VARCHAR(500).
-- =====================================================================
ALTER TABLE movimentacoes_estoque RENAME COLUMN motivo TO motivo_frota;
ALTER TABLE movimentacoes_estoque ALTER COLUMN observacao TYPE VARCHAR(1000);
ALTER TABLE movimentacoes_estoque ADD COLUMN motivo VARCHAR(30);
