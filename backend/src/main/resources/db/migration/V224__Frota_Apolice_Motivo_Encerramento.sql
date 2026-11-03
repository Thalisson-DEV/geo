-- Motivo do encerramento da cobertura de um veículo na apólice (venda, perda total, troca de
-- apólice...), para quem lê a apólice depois saber por que o veículo saiu e cobrar o endosso.
-- Aditiva. Rollback: DROP das colunas motivo_encerramento e observacao_encerramento de
-- frota_apolice_veiculos.

ALTER TABLE frota_apolice_veiculos
    ADD COLUMN motivo_encerramento VARCHAR(20),
    ADD COLUMN observacao_encerramento VARCHAR(300),
    ADD CONSTRAINT ck_frota_apolice_veiculo_motivo CHECK (motivo_encerramento IS NULL OR motivo_encerramento IN
        ('VENDA', 'PERDA_TOTAL', 'FURTO_ROUBO', 'DEVOLUCAO', 'TROCA_APOLICE', 'OUTRO'));

COMMENT ON COLUMN frota_apolice_veiculos.motivo_encerramento IS 'Por que a cobertura foi encerrada antes do fim da vigência.';

