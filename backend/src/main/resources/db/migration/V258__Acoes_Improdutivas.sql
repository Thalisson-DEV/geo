-- =====================================================================
-- V258: Serviços (ações) improdutivos
--
-- Serviço improdutivo é o que registra que a equipe foi ao local mas não
-- executou (sem acesso ao padrão, defeito técnico, serviço não executado).
-- A nota cujos serviços são todos improdutivos não conta para a meta física
-- da Concessionária; basta um serviço produtivo para a nota contar (uma vez).
--
-- A lista inicial vem da planilha da Concessionária; as demais ações seguem produtivas.
-- =====================================================================

ALTER TABLE acoes ADD COLUMN improdutiva BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN acoes.improdutiva IS
    'Serviço não efetuado: nota só com serviços improdutivos não conta para a meta física.';

UPDATE acoes
SET improdutiva = TRUE
WHERE cod_acao IN (
    'SDCCU6427SC',  -- SERV N EFETUADO S ACESSO PADRAO DISJUNTO
    'SDCCU6419SC',  -- SERV NAO EFETUADA DEF TECNICA PADRAO-BT
    'SDCLU6020SC',  -- SERV NAO EFETUADO SEM ACESSO PAD-BT
    'SDCCU6420SC',  -- SERV NAO EFETUADO SEM ACESSO PADRAO-BT
    'SDCCU6421SC',  -- SERV NAO EFETUADO SEM ACESSO PADRAO-MT
    'SDMOU4216SC'   -- SERV NAO EXECUTADO
);
