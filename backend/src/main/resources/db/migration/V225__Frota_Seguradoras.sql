-- Cadastro das seguradoras e corretoras da frota. Cada uma aponta para um fornecedor do
-- financeiro (que recebe o pagamento) e guarda o papel e o telefone de assistência 24h.
-- Já nasce com as seguradoras e corretoras das apólices cadastradas.
-- Aditiva. Rollback: DROP TABLE frota_seguradoras.

CREATE TABLE frota_seguradoras (
    id UUID PRIMARY KEY,
    -- Fornecedor do financeiro (outro módulo: sem chave estrangeira).
    id_fornecedor UUID NOT NULL,
    papel VARCHAR(20) NOT NULL,
    telefone_assistencia VARCHAR(13),
    observacao VARCHAR(500),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_frota_seguradora_papel CHECK (papel IN ('SEGURADORA', 'CORRETORA'))
);
CREATE UNIQUE INDEX uk_frota_seguradoras_fornecedor ON frota_seguradoras (id_fornecedor, papel) WHERE ativo;

INSERT INTO frota_seguradoras (id, id_fornecedor, papel, usuario_criacao)
SELECT gen_random_uuid(), f.id_fornecedor, f.papel, 'migracao'
FROM (
    SELECT DISTINCT id_seguradora AS id_fornecedor, 'SEGURADORA' AS papel FROM frota_apolices WHERE ativo
    UNION
    SELECT DISTINCT id_corretor, 'CORRETORA' FROM frota_apolices WHERE ativo AND id_corretor IS NOT NULL
) f;

COMMENT ON TABLE frota_seguradoras IS 'Seguradoras e corretoras usadas nas apólices da frota.';

