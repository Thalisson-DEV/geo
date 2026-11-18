-- V253: colunas numéricas dos pneus como INTEGER
--
-- A V226 criou estas colunas como SMALLINT, mas as entidades usam int/Integer. Com
-- ddl-auto=validate (perfil prod) o Hibernate recusa a subida. INTEGER comporta todos
-- os valores de SMALLINT, então a conversão não perde nada.
-- Rollback: ALTER ... TYPE SMALLINT nas mesmas colunas.

ALTER TABLE frota_fichas_veiculo ALTER COLUMN estepes TYPE INTEGER;

ALTER TABLE frota_pneus
    ALTER COLUMN largura TYPE INTEGER,
    ALTER COLUMN perfil TYPE INTEGER,
    ALTER COLUMN lonas TYPE INTEGER,
    ALTER COLUMN pressao_recomendada_psi TYPE INTEGER,
    ALTER COLUMN vida TYPE INTEGER;

ALTER TABLE frota_pneu_inspecao_itens ALTER COLUMN pressao_psi TYPE INTEGER;

ALTER TABLE frota_pneu_eventos
    ALTER COLUMN vida TYPE INTEGER,
    ALTER COLUMN pressao_psi TYPE INTEGER;
