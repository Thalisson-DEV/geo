-- =====================================================================
-- V264: Revisão das fotos de campo (book) antes da medição.
--
-- Cada foto do ponto passa a ter situação de revisão (pendente, aprovada,
-- reprovada), a inconformidade e o motivo quando reprovada, quem revisou e
-- quando, e a equipe que tirou (para o ranking de qualidade). Foto reprovada
-- volta a ser pendência para a equipe; o relatório de medição detalhado usa
-- só as aprovadas.
-- =====================================================================
ALTER TABLE evidencias_ponto_obra
    ADD COLUMN IF NOT EXISTS status_revisao VARCHAR(10) NOT NULL DEFAULT 'PENDENTE',
    ADD COLUMN IF NOT EXISTS inconformidade VARCHAR(30),
    ADD COLUMN IF NOT EXISTS motivo_reprovacao VARCHAR(500),
    ADD COLUMN IF NOT EXISTS revisada_por VARCHAR(255),
    ADD COLUMN IF NOT EXISTS revisada_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS id_equipe UUID;

ALTER TABLE evidencias_ponto_obra DROP CONSTRAINT IF EXISTS ck_evidencias_status_revisao;
ALTER TABLE evidencias_ponto_obra ADD CONSTRAINT ck_evidencias_status_revisao
    CHECK (status_revisao IN ('PENDENTE', 'APROVADA', 'REPROVADA'));

-- Fotos do app já recebidas: a equipe vem da programação.
UPDATE evidencias_ponto_obra e SET id_equipe = p.id_equipe
FROM programacoes p WHERE e.id_programacao = p.id AND e.id_equipe IS NULL;

CREATE INDEX IF NOT EXISTS ix_evidencias_revisao ON evidencias_ponto_obra (status_revisao, data_criacao) WHERE ativo;
CREATE INDEX IF NOT EXISTS ix_evidencias_equipe ON evidencias_ponto_obra (id_equipe, data_criacao) WHERE ativo;
