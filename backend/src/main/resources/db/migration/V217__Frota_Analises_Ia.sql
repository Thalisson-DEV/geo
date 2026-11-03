-- Análises da IA nos relatórios da frota (OS, checklist e abastecimento): o parecer sobre o
-- registro e a leitura de cada foto. A IA só aponta; quem decide é o gestor.
-- Aditiva. Rollback: DROP TABLE frota_analises_ia.

CREATE TABLE frota_analises_ia (
    id UUID PRIMARY KEY,
    alvo VARCHAR(20) NOT NULL,
    id_alvo UUID NOT NULL,
    parecer VARCHAR(20) NOT NULL,
    resumo TEXT NOT NULL,
    -- Pontos, leitura das fotos e recomendações, no formato devolvido pela API.
    resultado TEXT NOT NULL,
    modelo VARCHAR(150) NOT NULL,
    fotos_analisadas INTEGER NOT NULL DEFAULT 0,
    id_usuario UUID,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_frota_analises_ia_alvo ON frota_analises_ia (alvo, id_alvo, data_criacao DESC);

