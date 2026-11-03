-- V179: módulo de frota — a OS guarda a unidade da medição (openspec/changes/modulo-gestao-frota-horimetro).
--
-- Aditiva. As OS existentes ficam em KM. A unidade é a do veículo na abertura; assim o
-- histórico da OS não muda se o veículo trocar de painel depois.
-- Rollback: ALTER TABLE frota_ordens_servico DROP COLUMN unidade_medicao.

ALTER TABLE frota_ordens_servico
    ADD COLUMN unidade_medicao VARCHAR(10) NOT NULL DEFAULT 'KM'
        CONSTRAINT ck_frota_os_unidade CHECK (unidade_medicao IN ('KM', 'HORAS'));

