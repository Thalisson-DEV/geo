-- Fase 4 da frota: pneus e estoque da oficina.
--   * diagrama de eixos e estepes na ficha do veículo;
--   * pneus, histórico (somente inserção) e inspeções (pressão e sulco por posição);
--   * peça da OS ligada ao material e ao almoxarifado da frota, com a movimentação de baixa;
--   * sulco mínimo nos parâmetros da frota;
--   * permissões frota:estoque:* e frota:pneu:*.
-- Aditiva. Rollback: DROP de frota_pneu_inspecao_itens, frota_pneu_inspecoes, frota_pneu_eventos,
-- frota_pneus e seq_frota_pneu_numero; DROP das colunas eixos/estepes da ficha, das colunas novas
-- de frota_os_pecas e de frota_parametros.sulco_minimo_mm; DELETE das permissões 'frota:estoque:%'
-- e 'frota:pneu:%'.

-- ── Diagrama ──────────────────────────────────────────────────────────────────────
-- Eixos da frente para trás: S = simples (2 rodas), D = duplo (4 rodas). Ex.: 'S,D,D'.
ALTER TABLE frota_fichas_veiculo ADD COLUMN eixos VARCHAR(40);
ALTER TABLE frota_fichas_veiculo ADD COLUMN estepes SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE frota_fichas_veiculo ADD CONSTRAINT ck_frota_ficha_eixos CHECK (eixos IS NULL OR eixos ~ '^[SD](,[SD]){0,8}$');
ALTER TABLE frota_fichas_veiculo ADD CONSTRAINT ck_frota_ficha_estepes CHECK (estepes BETWEEN 0 AND 4);

ALTER TABLE frota_parametros ADD COLUMN sulco_minimo_mm NUMERIC(4, 1) NOT NULL DEFAULT 3.0;

-- ── Pneus ─────────────────────────────────────────────────────────────────────────
CREATE SEQUENCE seq_frota_pneu_numero START WITH 1 INCREMENT BY 1;

CREATE TABLE frota_pneus (
    id UUID PRIMARY KEY,
    numero BIGINT NOT NULL DEFAULT nextval('seq_frota_pneu_numero'),
    marca_fogo VARCHAR(30) NOT NULL,
    numero_serie VARCHAR(60),
    marca VARCHAR(60) NOT NULL,
    modelo VARCHAR(80),
    largura SMALLINT,
    perfil SMALLINT,
    aro VARCHAR(10),
    radial BOOLEAN NOT NULL DEFAULT TRUE,
    com_camara BOOLEAN NOT NULL DEFAULT FALSE,
    indice_carga VARCHAR(10),
    indice_velocidade VARCHAR(5),
    lonas SMALLINT,
    dot VARCHAR(4),
    -- Fornecedor do financeiro (sem chave estrangeira: outro módulo).
    id_fornecedor UUID,
    nota_fiscal VARCHAR(60),
    data_compra DATE,
    valor_compra NUMERIC(14, 2) CHECK (valor_compra IS NULL OR valor_compra >= 0),
    sulco_inicial_mm NUMERIC(4, 1) CHECK (sulco_inicial_mm IS NULL OR sulco_inicial_mm >= 0),
    sulco_atual_mm NUMERIC(4, 1) CHECK (sulco_atual_mm IS NULL OR sulco_atual_mm >= 0),
    pressao_recomendada_psi SMALLINT CHECK (pressao_recomendada_psi IS NULL OR pressao_recomendada_psi > 0),
    vida SMALLINT NOT NULL DEFAULT 0 CHECK (vida >= 0),
    km_vida INTEGER NOT NULL DEFAULT 0 CHECK (km_vida >= 0),
    km_total INTEGER NOT NULL DEFAULT 0 CHECK (km_total >= 0),
    situacao VARCHAR(20) NOT NULL,
    -- Almoxarifado da frota onde o pneu está guardado (módulo estoque, sem FK).
    id_estoque UUID,
    id_veiculo UUID REFERENCES veiculos(id),
    placa VARCHAR(10),
    posicao VARCHAR(5),
    montado_em TIMESTAMP WITH TIME ZONE,
    km_montagem INTEGER,
    -- Fornecedor do reparo ou da reforma em andamento.
    id_fornecedor_servico UUID,
    enviado_em TIMESTAMP WITH TIME ZONE,
    descartado_em TIMESTAMP WITH TIME ZONE,
    motivo_descarte VARCHAR(300),
    observacao VARCHAR(1000),
    sistema_origem VARCHAR(20),
    id_externo VARCHAR(80),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_pneu_situacao CHECK (situacao IN ('DISPONIVEL', 'EM_USO', 'EM_REPARO', 'EM_REFORMA', 'DESCARTADO')),
    CONSTRAINT ck_frota_pneu_montagem CHECK ((situacao = 'EM_USO') = (id_veiculo IS NOT NULL AND posicao IS NOT NULL)),
    CONSTRAINT ck_frota_pneu_externo CHECK ((sistema_origem IS NULL) = (id_externo IS NULL))
);
CREATE UNIQUE INDEX uk_frota_pneus_numero ON frota_pneus (numero);
CREATE UNIQUE INDEX uk_frota_pneus_marca_fogo ON frota_pneus (UPPER(marca_fogo)) WHERE ativo AND situacao <> 'DESCARTADO';
-- Uma roda por posição de cada veículo.
CREATE UNIQUE INDEX uk_frota_pneus_posicao ON frota_pneus (id_veiculo, posicao) WHERE ativo AND id_veiculo IS NOT NULL;
CREATE UNIQUE INDEX uk_frota_pneus_externo ON frota_pneus (sistema_origem, id_externo) WHERE id_externo IS NOT NULL;
CREATE INDEX idx_frota_pneus_situacao ON frota_pneus (situacao) WHERE ativo;

-- ── Inspeções ─────────────────────────────────────────────────────────────────────
CREATE TABLE frota_pneu_inspecoes (
    id UUID PRIMARY KEY,
    id_veiculo UUID NOT NULL REFERENCES veiculos(id),
    placa VARCHAR(10) NOT NULL,
    realizada_em TIMESTAMP WITH TIME ZONE NOT NULL,
    km INTEGER,
    -- Colaborador que fez a inspeção (opcional).
    id_responsavel UUID,
    observacao VARCHAR(1000),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_frota_pneu_inspecoes_veiculo ON frota_pneu_inspecoes (id_veiculo, realizada_em DESC) WHERE ativo;

CREATE TABLE frota_pneu_inspecao_itens (
    id UUID PRIMARY KEY,
    id_inspecao UUID NOT NULL REFERENCES frota_pneu_inspecoes(id),
    id_pneu UUID NOT NULL REFERENCES frota_pneus(id),
    posicao VARCHAR(5) NOT NULL,
    pressao_psi SMALLINT CHECK (pressao_psi IS NULL OR pressao_psi >= 0),
    sulco_mm NUMERIC(4, 1) CHECK (sulco_mm IS NULL OR sulco_mm >= 0),
    observacao VARCHAR(300),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_frota_pneu_inspecao_itens_inspecao ON frota_pneu_inspecao_itens (id_inspecao);
CREATE INDEX idx_frota_pneu_inspecao_itens_pneu ON frota_pneu_inspecao_itens (id_pneu);

-- ── Histórico ─────────────────────────────────────────────────────────────────────
CREATE TABLE frota_pneu_eventos (
    id UUID PRIMARY KEY,
    id_pneu UUID NOT NULL REFERENCES frota_pneus(id),
    tipo VARCHAR(30) NOT NULL,
    ocorrido_em TIMESTAMP WITH TIME ZONE NOT NULL,
    id_veiculo UUID REFERENCES veiculos(id),
    placa VARCHAR(10),
    posicao_origem VARCHAR(5),
    posicao_destino VARCHAR(5),
    -- km do veículo no evento e km que o pneu rodou desde a montagem (na desmontagem).
    km_veiculo INTEGER,
    km_rodado INTEGER,
    vida SMALLINT NOT NULL,
    sulco_mm NUMERIC(4, 1),
    pressao_psi SMALLINT,
    valor NUMERIC(14, 2) CHECK (valor IS NULL OR valor >= 0),
    id_fornecedor UUID,
    documento VARCHAR(60),
    id_inspecao UUID REFERENCES frota_pneu_inspecoes(id),
    id_lote UUID,
    descricao VARCHAR(500) NOT NULL,
    observacao VARCHAR(1000),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_pneu_evento_tipo CHECK (tipo IN ('CADASTRO', 'MONTAGEM', 'DESMONTAGEM', 'RODIZIO', 'ENVIO_REPARO',
        'RETORNO_REPARO', 'ENVIO_REFORMA', 'RETORNO_REFORMA', 'DESCARTE', 'INSPECAO', 'TRANSFERENCIA', 'CORRECAO'))
);
CREATE INDEX idx_frota_pneu_eventos_pneu ON frota_pneu_eventos (id_pneu, ocorrido_em DESC);
CREATE INDEX idx_frota_pneu_eventos_veiculo ON frota_pneu_eventos (id_veiculo, ocorrido_em DESC) WHERE id_veiculo IS NOT NULL;
CREATE INDEX idx_frota_pneu_eventos_ocorrido ON frota_pneu_eventos (ocorrido_em DESC);

-- ── Peça do estoque na OS ─────────────────────────────────────────────────────────
-- Material e almoxarifado da frota (módulo estoque, sem FK) e a movimentação de baixa.
ALTER TABLE frota_os_pecas ADD COLUMN id_material UUID;
ALTER TABLE frota_os_pecas ADD COLUMN id_estoque UUID;
ALTER TABLE frota_os_pecas ADD COLUMN id_movimentacao_estoque UUID;
ALTER TABLE frota_os_pecas ADD CONSTRAINT ck_frota_os_peca_estoque
    CHECK ((id_material IS NULL) = (id_estoque IS NULL) AND (id_movimentacao_estoque IS NULL OR id_material IS NOT NULL));

-- ── Permissões ────────────────────────────────────────────────────────────────────
INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
SELECT gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, nome
FROM (VALUES ('frota:estoque:read'), ('frota:estoque:write'), ('frota:pneu:read'), ('frota:pneu:write')) AS p(nome)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE perfil.nome IN ('ADMINISTRADOR', 'GESTOR_FROTA', 'OFICINA_FROTA') AND permissao.nome IN
      ('frota:estoque:read', 'frota:estoque:write', 'frota:pneu:read', 'frota:pneu:write')
ON CONFLICT DO NOTHING;

-- A operação consulta o estoque e os pneus.
INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT perfil.id, permissao.id
FROM perfis_acesso perfil
CROSS JOIN permissoes permissao
WHERE perfil.nome = 'OPERACAO_FROTA' AND permissao.nome IN ('frota:estoque:read', 'frota:pneu:read')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE frota_pneus IS 'Pneus da frota: situação, montagem atual, vida, km e sulco.';
COMMENT ON TABLE frota_pneu_eventos IS 'Histórico do pneu (somente inserção): montagem, rodízio, reparo, reforma, descarte, inspeção.';
COMMENT ON COLUMN frota_fichas_veiculo.eixos IS 'Diagrama de pneus: eixos da frente para trás, S = simples, D = duplo (ex.: S,D,D).';

