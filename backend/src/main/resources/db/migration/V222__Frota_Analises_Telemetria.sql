-- Análises da telemetria (change modulo-gestao-frota-analises-telemetria): saúde e uso da frota,
-- turno no mapa, produtividade por km, nota fora do local, ociosidade, abastecimento fora do posto
-- e custo por km. A série de posições é bruta e grande; os resumos abaixo são calculados uma vez
-- pelo servidor (por dia, por turno e por abastecimento) para as telas não varrerem as posições.
-- Tudo derivado e recalculável: apagar as linhas faz o job recalcular.
-- Aditiva. Rollback: DROP das cinco tabelas, das colunas de expediente e volta da restrição de etapa dos alertas.

-- Resumo diário de cada veículo (dia civil de São Paulo), pelo rastreador que mais transmitiu no dia.
CREATE TABLE frota_telemetria_dias (
    id_veiculo UUID NOT NULL,
    dia DATE NOT NULL,
    id_rastreador UUID NOT NULL REFERENCES frota_telemetria_rastreadores(id),
    km NUMERIC(10, 1) NOT NULL DEFAULT 0,
    minutos_movimento INTEGER NOT NULL DEFAULT 0,
    minutos_ligado_parado INTEGER NOT NULL DEFAULT 0,
    km_fora_expediente NUMERIC(10, 1) NOT NULL DEFAULT 0,
    minutos_fora_expediente INTEGER NOT NULL DEFAULT 0,
    primeira_partida TIMESTAMP WITH TIME ZONE,
    ultima_parada TIMESTAMP WITH TIME ZONE,
    pontos INTEGER NOT NULL DEFAULT 0,
    calculado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_veiculo, dia)
);
CREATE INDEX idx_frota_telemetria_dias_dia ON frota_telemetria_dias (dia);
COMMENT ON TABLE frota_telemetria_dias IS 'Resumo diário da telemetria por veículo (km, tempo andando, ligado parado e fora do expediente). Derivado das posições.';

-- Resumo de cada turno com veículo: o trajeto cruzado com as notas e com a base da equipe.
CREATE TABLE frota_telemetria_turnos (
    id_turno UUID PRIMARY KEY,
    id_veiculo UUID NOT NULL,
    id_equipe UUID NOT NULL,
    id_base_operacional UUID,
    inicio TIMESTAMP WITH TIME ZONE NOT NULL,
    fim TIMESTAMP WITH TIME ZONE NOT NULL,
    com_telemetria BOOLEAN NOT NULL DEFAULT FALSE,
    km NUMERIC(10, 1) NOT NULL DEFAULT 0,
    minutos_movimento INTEGER NOT NULL DEFAULT 0,
    minutos_parado_servico INTEGER NOT NULL DEFAULT 0,
    minutos_parado_base INTEGER NOT NULL DEFAULT 0,
    minutos_parado_sem_servico INTEGER NOT NULL DEFAULT 0,
    minutos_ligado_parado INTEGER NOT NULL DEFAULT 0,
    saida_base_em TIMESTAMP WITH TIME ZONE,
    chegada_base_em TIMESTAMP WITH TIME ZONE,
    notas INTEGER NOT NULL DEFAULT 0,
    valor_faturado NUMERIC(14, 2) NOT NULL DEFAULT 0,
    notas_no_local INTEGER NOT NULL DEFAULT 0,
    notas_fora_local INTEGER NOT NULL DEFAULT 0,
    notas_sem_dado INTEGER NOT NULL DEFAULT 0,
    calculado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_frota_telemetria_turnos_inicio ON frota_telemetria_turnos (inicio);
COMMENT ON TABLE frota_telemetria_turnos IS 'Turno no mapa: km, tempo andando, parado em serviço, na base e sem serviço, e as notas no trajeto. Derivado.';

-- Cada nota do turno comparada com a posição do veículo no instante do lançamento.
CREATE TABLE frota_telemetria_turno_notas (
    id_execucao UUID PRIMARY KEY,
    id_turno UUID NOT NULL REFERENCES frota_telemetria_turnos(id_turno) ON DELETE CASCADE,
    lancado_em TIMESTAMP WITH TIME ZONE NOT NULL,
    situacao VARCHAR(30) NOT NULL,
    distancia_metros INTEGER,
    latitude_nota DOUBLE PRECISION,
    longitude_nota DOUBLE PRECISION,
    latitude_veiculo DOUBLE PRECISION,
    longitude_veiculo DOUBLE PRECISION,
    valor NUMERIC(14, 2)
);
CREATE INDEX idx_frota_telemetria_turno_notas_turno ON frota_telemetria_turno_notas (id_turno);
CREATE INDEX idx_frota_telemetria_turno_notas_lancado ON frota_telemetria_turno_notas (lancado_em);

-- Onde estava o veículo no instante de cada abastecimento realizado.
CREATE TABLE frota_telemetria_abastecimentos (
    id_abastecimento UUID PRIMARY KEY,
    id_veiculo UUID NOT NULL,
    id_posto UUID,
    realizado_em TIMESTAMP WITH TIME ZONE NOT NULL,
    situacao VARCHAR(30) NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    velocidade_kmh NUMERIC(6, 1),
    distancia_posto_metros INTEGER,
    calculado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_frota_telemetria_abastecimentos_realizado ON frota_telemetria_abastecimentos (realizado_em);

-- Posição de cada posto aprendida pelos próprios abastecimentos (os postos não têm coordenada).
CREATE TABLE frota_telemetria_postos (
    id_posto UUID PRIMARY KEY,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    amostras INTEGER NOT NULL,
    dispersao_metros INTEGER NOT NULL,
    calculado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Expediente: andar fora dele é uso fora do expediente (Frota → Cadastros → Parâmetros).
ALTER TABLE frota_parametros
    ADD COLUMN expediente_inicio TIME NOT NULL DEFAULT '06:00',
    ADD COLUMN expediente_fim TIME NOT NULL DEFAULT '19:00',
    ADD COLUMN sabado_expediente BOOLEAN NOT NULL DEFAULT FALSE;

-- Abastecimento feito longe do posto vira alerta do próprio abastecimento, calculado pela telemetria.
ALTER TABLE frota_abastecimento_alertas
    DROP CONSTRAINT ck_frota_abast_alerta_etapa,
    ADD CONSTRAINT ck_frota_abast_alerta_etapa CHECK (etapa IN ('SOLICITACAO', 'APROVACAO', 'REALIZADO', 'TELEMETRIA'));

