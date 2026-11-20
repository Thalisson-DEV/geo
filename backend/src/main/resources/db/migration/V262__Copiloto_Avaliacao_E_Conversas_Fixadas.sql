-- Bússola: conversas fixadas no topo do histórico e avaliação das respostas (útil / não útil, com motivo).
ALTER TABLE assistente_conversa ADD COLUMN IF NOT EXISTS fixada BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE assistente_mensagem ADD COLUMN IF NOT EXISTS avaliacao VARCHAR(10);
ALTER TABLE assistente_mensagem ADD COLUMN IF NOT EXISTS avaliacao_motivo VARCHAR(60);
ALTER TABLE assistente_mensagem ADD COLUMN IF NOT EXISTS avaliacao_comentario VARCHAR(1000);
ALTER TABLE assistente_mensagem ADD COLUMN IF NOT EXISTS avaliada_em TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_assistente_mensagem_avaliacao ON assistente_mensagem (avaliacao, avaliada_em)
    WHERE avaliacao IS NOT NULL;
