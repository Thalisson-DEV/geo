-- Tipos de obra passam a ser um cadastro (CRUD). O tipo diz para onde vai o material da
-- solicitação: direto na obra (OBRA) ou na OS/OC digitada (OS, OC). Kit e Medidor são subtipos.
-- Os campos obrigatórios da obra (status, datas, processo, município, supervisor e coordenador)
-- continuam obrigatórios: a carteira e a programação dependem deles.
-- Aditiva. Rollback: DROP INDEX idx_obras_id_tipo_obra; ALTER TABLE obras DROP COLUMN id_tipo_obra;
-- DROP TABLE tipos_obra.

CREATE TABLE tipos_obra (
    id UUID PRIMARY KEY,
    codigo VARCHAR(30) NOT NULL,
    nome VARCHAR(60) NOT NULL,
    descricao VARCHAR(255),
    controle_execucao VARCHAR(4) NOT NULL,
    subtipo BOOLEAN NOT NULL DEFAULT FALSE,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_tipos_obra_codigo UNIQUE (codigo),
    CONSTRAINT uq_tipos_obra_nome UNIQUE (nome),
    CONSTRAINT ck_tipos_obra_controle CHECK (controle_execucao IN ('OBRA', 'OS', 'OC'))
);

INSERT INTO tipos_obra (id, codigo, nome, descricao, controle_execucao, subtipo, usuario_criacao) VALUES
    ('7a1f0c2e-0001-4b6a-9c1d-000000000001', 'COMUM', 'COMUM', 'Obra comum: material solicitado direto na obra.', 'OBRA', FALSE, 'sistema'),
    ('7a1f0c2e-0001-4b6a-9c1d-000000000002', 'LPT', 'LPT', 'Luz para Todos: material solicitado direto na obra.', 'OBRA', FALSE, 'sistema'),
    ('7a1f0c2e-0001-4b6a-9c1d-000000000003', 'CORRETIVA', 'CORRETIVA', 'Material solicitado direto na ocorrência (OC) digitada na solicitação.', 'OC', FALSE, 'sistema'),
    ('7a1f0c2e-0001-4b6a-9c1d-000000000004', 'PREVENTIVA', 'PREVENTIVA', 'Material solicitado direto na ordem de serviço (OS) digitada na solicitação.', 'OS', FALSE, 'sistema'),
    ('7a1f0c2e-0001-4b6a-9c1d-000000000005', 'KIT', 'KIT', 'Subtipo: kit vinculado a uma obra principal.', 'OBRA', TRUE, 'sistema'),
    ('7a1f0c2e-0001-4b6a-9c1d-000000000006', 'MEDIDOR', 'MEDIDOR', 'Subtipo: medidor vinculado a uma obra principal.', 'OBRA', TRUE, 'sistema');

ALTER TABLE obras ADD COLUMN id_tipo_obra UUID REFERENCES tipos_obra(id);

UPDATE obras SET id_tipo_obra = CASE tipo_obra
    WHEN 'LPT' THEN '7a1f0c2e-0001-4b6a-9c1d-000000000002'::uuid
    WHEN 'CORRETIVA' THEN '7a1f0c2e-0001-4b6a-9c1d-000000000003'::uuid
    WHEN 'PREVENTIVA' THEN '7a1f0c2e-0001-4b6a-9c1d-000000000004'::uuid
    ELSE '7a1f0c2e-0001-4b6a-9c1d-000000000001'::uuid
END;

-- Subprojetos antigos (kit ou medidor de uma obra pai) passam a ter o subtipo correspondente.
UPDATE obras SET id_tipo_obra = CASE tipo_vinculo_pai
        WHEN 'MEDIDOR' THEN '7a1f0c2e-0001-4b6a-9c1d-000000000006'::uuid
        ELSE '7a1f0c2e-0001-4b6a-9c1d-000000000005'::uuid
    END
WHERE id_obra_pai IS NOT NULL AND tipo_vinculo_pai IN ('KIT', 'MEDIDOR') AND tipo_obra = 'OBRA';

CREATE INDEX idx_obras_id_tipo_obra ON obras(id_tipo_obra);
