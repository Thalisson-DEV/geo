-- Tabelas JDBC da telemetria (não são entidades, então o create-drop do Hibernate não as cria).
-- Espelham as migrações V212 e V214, sem chaves estrangeiras.
CREATE TABLE IF NOT EXISTS frota_telemetria_posicoes (
    id UUID DEFAULT RANDOM_UUID() PRIMARY KEY,
    id_rastreador UUID NOT NULL,
    lido_em TIMESTAMP WITH TIME ZONE NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    velocidade_kmh NUMERIC(6, 1),
    ignicao BOOLEAN,
    odometro_metros BIGINT,
    horimetro_horas NUMERIC(12, 1),
    recebido_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS frota_telemetria_dias (
    id_veiculo UUID NOT NULL,
    dia DATE NOT NULL,
    id_rastreador UUID NOT NULL,
    km NUMERIC(10, 1) DEFAULT 0 NOT NULL,
    minutos_movimento INTEGER DEFAULT 0 NOT NULL,
    minutos_ligado_parado INTEGER DEFAULT 0 NOT NULL,
    km_fora_expediente NUMERIC(10, 1) DEFAULT 0 NOT NULL,
    minutos_fora_expediente INTEGER DEFAULT 0 NOT NULL,
    primeira_partida TIMESTAMP WITH TIME ZONE,
    ultima_parada TIMESTAMP WITH TIME ZONE,
    pontos INTEGER DEFAULT 0 NOT NULL,
    calculado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id_veiculo, dia)
);

CREATE TABLE IF NOT EXISTS frota_telemetria_turnos (
    id_turno UUID PRIMARY KEY,
    id_veiculo UUID NOT NULL,
    id_equipe UUID NOT NULL,
    id_base_operacional UUID,
    inicio TIMESTAMP WITH TIME ZONE NOT NULL,
    fim TIMESTAMP WITH TIME ZONE NOT NULL,
    com_telemetria BOOLEAN DEFAULT FALSE NOT NULL,
    km NUMERIC(10, 1) DEFAULT 0 NOT NULL,
    minutos_movimento INTEGER DEFAULT 0 NOT NULL,
    minutos_parado_servico INTEGER DEFAULT 0 NOT NULL,
    minutos_parado_base INTEGER DEFAULT 0 NOT NULL,
    minutos_parado_sem_servico INTEGER DEFAULT 0 NOT NULL,
    minutos_ligado_parado INTEGER DEFAULT 0 NOT NULL,
    saida_base_em TIMESTAMP WITH TIME ZONE,
    chegada_base_em TIMESTAMP WITH TIME ZONE,
    notas INTEGER DEFAULT 0 NOT NULL,
    valor_faturado NUMERIC(14, 2) DEFAULT 0 NOT NULL,
    notas_no_local INTEGER DEFAULT 0 NOT NULL,
    notas_fora_local INTEGER DEFAULT 0 NOT NULL,
    notas_sem_dado INTEGER DEFAULT 0 NOT NULL,
    calculado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS frota_telemetria_turno_notas (
    id_execucao UUID PRIMARY KEY,
    id_turno UUID NOT NULL,
    lancado_em TIMESTAMP WITH TIME ZONE NOT NULL,
    situacao VARCHAR(30) NOT NULL,
    distancia_metros INTEGER,
    latitude_nota DOUBLE PRECISION,
    longitude_nota DOUBLE PRECISION,
    latitude_veiculo DOUBLE PRECISION,
    longitude_veiculo DOUBLE PRECISION,
    valor NUMERIC(14, 2)
);

CREATE TABLE IF NOT EXISTS frota_telemetria_abastecimentos (
    id_abastecimento UUID PRIMARY KEY,
    id_veiculo UUID NOT NULL,
    id_posto UUID,
    realizado_em TIMESTAMP WITH TIME ZONE NOT NULL,
    situacao VARCHAR(30) NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    velocidade_kmh NUMERIC(6, 1),
    distancia_posto_metros INTEGER,
    calculado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS frota_telemetria_postos (
    id_posto UUID PRIMARY KEY,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    amostras INTEGER NOT NULL,
    dispersao_metros INTEGER NOT NULL,
    calculado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
