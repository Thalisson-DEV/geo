-- V178: módulo de frota — horímetro e troca de painel (openspec/changes/modulo-gestao-frota-horimetro).
--
-- Aditiva. Todo veículo e toda leitura existentes ficam em KM e do tipo LEITURA.
-- Rollback: ALTER TABLE frota_leituras_odometro DROP COLUMN unidade, tipo, deslocamento;
-- ALTER TABLE frota_fichas_veiculo DROP COLUMN unidade_medicao;
-- ALTER TABLE frota_parametros DROP COLUMN limite_horas_dia.

-- ── Ficha: cada veículo é controlado por km ou por horas ──────────────────────────
ALTER TABLE frota_fichas_veiculo
    ADD COLUMN unidade_medicao VARCHAR(10) NOT NULL DEFAULT 'KM'
        CONSTRAINT ck_frota_ficha_unidade CHECK (unidade_medicao IN ('KM', 'HORAS'));

-- ── Parâmetro: limite diário de salto em horas ────────────────────────────────────
ALTER TABLE frota_parametros
    ADD COLUMN limite_horas_dia INTEGER NOT NULL DEFAULT 16
        CHECK (limite_horas_dia BETWEEN 1 AND 24);

-- ── Leitura: unidade, tipo e deslocamento da troca de painel ──────────────────────
-- A coluna km continua guardando o valor lido; a unidade diz se é km ou horas.
ALTER TABLE frota_leituras_odometro
    ADD COLUMN unidade VARCHAR(10) NOT NULL DEFAULT 'KM'
        CONSTRAINT ck_frota_odometro_unidade CHECK (unidade IN ('KM', 'HORAS')),
    ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'LEITURA'
        CONSTRAINT ck_frota_odometro_tipo CHECK (tipo IN ('LEITURA', 'TROCA_PAINEL')),
    -- Na troca: último valor do painel antigo menos o inicial do novo. Soma no acumulado.
    -- Nulo quando a troca também muda a unidade (o acumulado recomeça).
    ADD COLUMN deslocamento BIGINT,
    ADD CONSTRAINT ck_frota_odometro_deslocamento
        CHECK (deslocamento IS NULL OR tipo = 'TROCA_PAINEL');

-- As trocas são poucas e lidas a cada leitura para achar o trecho.
CREATE INDEX idx_frota_odometro_trocas
    ON frota_leituras_odometro (id_veiculo, lido_em) WHERE tipo = 'TROCA_PAINEL';

