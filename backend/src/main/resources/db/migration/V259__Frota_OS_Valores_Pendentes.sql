-- Pedido do gestor da frota (14/11/2026): a "baixa pendente" deixa de ser um botão. A OS concluída
-- fica com "valores pendentes" enquanto algum serviço ou peça da execução estiver com valor zero
-- (ou, sem lançamentos, sem valor nenhum) e vira finalizada sozinha quando o último valor entra.
-- O lançamento de valor zero de propósito (garantia, cortesia) é marcado como "sem custo".
--
-- Aditiva. Rollback: DROP COLUMN sem_custo em frota_os_servicos e frota_os_pecas.

ALTER TABLE frota_os_servicos ADD COLUMN sem_custo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE frota_os_pecas ADD COLUMN sem_custo BOOLEAN NOT NULL DEFAULT FALSE;
