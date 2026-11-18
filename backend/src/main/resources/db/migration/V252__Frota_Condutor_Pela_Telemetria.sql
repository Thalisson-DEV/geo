-- O cartão de identificação do condutor no rastreador (Zuq) passa a registrar a troca de
-- condutor do veículo: nova origem TELEMETRIA no vínculo condutor-veículo.
--
-- Aditiva. Rollback: apagar os vínculos de origem TELEMETRIA (ou trocá-los para MANUAL) e
-- recriar ck_frota_vinculo_origem com a lista da V169.

ALTER TABLE frota_vinculos_condutor DROP CONSTRAINT ck_frota_vinculo_origem;
ALTER TABLE frota_vinculos_condutor ADD CONSTRAINT ck_frota_vinculo_origem
    CHECK (origem IN ('MANUAL', 'CHECKLIST', 'TURNO', 'IMPORTACAO', 'TELEMETRIA'));
