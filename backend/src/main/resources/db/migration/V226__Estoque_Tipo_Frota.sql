-- Estoque da oficina da frota dentro do módulo de estoque, como tipo próprio (FROTA) e catálogo
-- próprio, sem se misturar com os estoques físico, de campo e de obra.
--   * tipo de estoque FROTA (um almoxarifado por base);
--   * catálogo do material (OPERACIONAL ou FROTA) e grupo da peça; processo só obrigatório fora da FROTA;
--   * custo médio no saldo e valor unitário, motivo, documento, observação e veículo na movimentação;
--   * mínimo e localização física por almoxarifado e material.
-- Aditiva. Rollback: DROP de estoque_parametros_material; DROP das colunas novas de materiais,
-- saldos e movimentacoes_estoque; SET NOT NULL em materiais.id_processo (só sem peças da frota);
-- DELETE do tipo FROTA (só sem estoques dele).

INSERT INTO tipos_estoque (id, nome, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), 'FROTA', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE
WHERE NOT EXISTS (SELECT 1 FROM tipos_estoque WHERE nome = 'FROTA');

-- ── Catálogo ──────────────────────────────────────────────────────────────────────
ALTER TABLE materiais ADD COLUMN catalogo VARCHAR(20) NOT NULL DEFAULT 'OPERACIONAL';
ALTER TABLE materiais ADD COLUMN grupo VARCHAR(60);
ALTER TABLE materiais ADD CONSTRAINT ck_materiais_catalogo CHECK (catalogo IN ('OPERACIONAL', 'FROTA'));
ALTER TABLE materiais ALTER COLUMN id_processo DROP NOT NULL;
ALTER TABLE materiais ADD CONSTRAINT ck_materiais_processo CHECK (catalogo = 'FROTA' OR id_processo IS NOT NULL);
CREATE INDEX idx_materiais_catalogo ON materiais (catalogo) WHERE catalogo <> 'OPERACIONAL';

-- ── Custo ─────────────────────────────────────────────────────────────────────────
-- Média ponderada das entradas; nula nos saldos operacionais (sem custo).
ALTER TABLE saldos ADD COLUMN custo_medio NUMERIC(14, 4);
ALTER TABLE saldos ADD CONSTRAINT ck_saldos_custo_medio CHECK (custo_medio IS NULL OR custo_medio >= 0);

ALTER TABLE movimentacoes_estoque ADD COLUMN valor_unitario NUMERIC(14, 4);
ALTER TABLE movimentacoes_estoque ADD COLUMN motivo VARCHAR(40);
ALTER TABLE movimentacoes_estoque ADD COLUMN documento VARCHAR(60);
ALTER TABLE movimentacoes_estoque ADD COLUMN observacao VARCHAR(500);
-- Veículo que recebeu a peça (outro módulo: sem chave estrangeira).
ALTER TABLE movimentacoes_estoque ADD COLUMN id_veiculo UUID;
-- Fornecedor da entrada (financeiro, sem chave estrangeira).
ALTER TABLE movimentacoes_estoque ADD COLUMN id_fornecedor UUID;
ALTER TABLE movimentacoes_estoque ADD CONSTRAINT ck_movimentacoes_valor_unitario CHECK (valor_unitario IS NULL OR valor_unitario >= 0);
CREATE INDEX idx_movimentacoes_estoque_veiculo ON movimentacoes_estoque (id_veiculo) WHERE id_veiculo IS NOT NULL;
CREATE INDEX idx_movimentacoes_estoque_referencia ON movimentacoes_estoque (id_referencia_operacao);

-- ── Mínimo e localização ──────────────────────────────────────────────────────────
CREATE TABLE estoque_parametros_material (
    id UUID PRIMARY KEY,
    id_estoque UUID NOT NULL REFERENCES estoques(id),
    id_material UUID NOT NULL REFERENCES materiais(id),
    estoque_minimo NUMERIC(12, 3) CHECK (estoque_minimo IS NULL OR estoque_minimo >= 0),
    localizacao VARCHAR(60),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uk_estoque_parametros_material ON estoque_parametros_material (id_estoque, id_material);

COMMENT ON COLUMN materiais.catalogo IS 'OPERACIONAL (almoxarifado) ou FROTA (peças da oficina); um não aparece nem movimenta no outro.';
COMMENT ON COLUMN saldos.custo_medio IS 'Custo médio ponderado (só estoques com custo, como os da frota).';
COMMENT ON TABLE estoque_parametros_material IS 'Mínimo e localização física de um material num estoque.';

