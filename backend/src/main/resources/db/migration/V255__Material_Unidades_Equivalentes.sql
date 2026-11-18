-- Unidades equivalentes do material: o saldo continua na unidade do cadastro, mas a pessoa pode
-- informar a quantidade em outra unidade (ex.: cabo recebido em KG e controlado em MT; rolo de
-- fita controlado em UN e usado em M nas notas). A frase fica exatamente como foi cadastrada:
-- "<quantidade_unidade> <unidade> = <quantidade_base> <unidade do material>".
CREATE TABLE materiais_unidades_equivalentes (
    id UUID PRIMARY KEY,
    id_material UUID NOT NULL REFERENCES materiais(id),
    unidade VARCHAR(10) NOT NULL,
    quantidade_unidade NUMERIC(14, 6) NOT NULL CHECK (quantidade_unidade > 0),
    quantidade_base NUMERIC(14, 6) NOT NULL CHECK (quantidade_base > 0),
    versao BIGINT,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX ux_material_unidade_equivalente_ativa
    ON materiais_unidades_equivalentes (id_material, unidade) WHERE ativo;

-- O que a pessoa digitou, quando usou uma unidade equivalente. A coluna quantidade continua
-- sendo o valor convertido para a unidade do material (é ela que mexe no saldo).
ALTER TABLE movimentacoes_estoque ADD COLUMN quantidade_informada NUMERIC(14, 6);
ALTER TABLE movimentacoes_estoque ADD COLUMN unidade_informada VARCHAR(10);

ALTER TABLE execucoes_materiais ADD COLUMN quantidade_informada NUMERIC(14, 6);
ALTER TABLE execucoes_materiais ADD COLUMN unidade_informada VARCHAR(10);
