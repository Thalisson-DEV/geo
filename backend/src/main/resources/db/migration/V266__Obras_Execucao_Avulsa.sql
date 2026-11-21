-- Execução avulsa: a equipe executa, pelo app, numa obra que não estava na agenda. O servidor monta uma programação
-- avulsa da equipe no dia, só com os itens apontados, para o valor ficar congelado e entrar na medição como os demais.
ALTER TABLE programacoes ADD COLUMN avulsa BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_programacoes_avulsa ON programacoes (id_obra, id_equipe, data_inicio) WHERE avulsa = TRUE AND ativo = TRUE;
