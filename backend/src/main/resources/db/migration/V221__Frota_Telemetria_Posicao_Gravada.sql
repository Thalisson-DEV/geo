-- Telemetria (change modulo-gestao-frota-telemetria): o mapa da frota lê os veículos a cada 2
-- minutos. A série de posições grava a cada leitura enquanto o veículo anda (trajeto fiel) e no
-- máximo a cada 30 minutos parado, para o volume não crescer com o veículo estacionado.
-- Aditiva. Rollback: ALTER TABLE frota_telemetria_rastreadores DROP COLUMN posicao_gravada_em;

ALTER TABLE frota_telemetria_rastreadores ADD COLUMN posicao_gravada_em TIMESTAMP WITH TIME ZONE;

