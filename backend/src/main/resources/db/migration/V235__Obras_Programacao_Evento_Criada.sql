-- O histórico da programação passa a começar na criação: quem programou, quando, para qual equipe e período.
ALTER TABLE eventos_programacao DROP CONSTRAINT ck_eventos_programacao_tipo;
ALTER TABLE eventos_programacao ADD CONSTRAINT ck_eventos_programacao_tipo
    CHECK (tipo IN ('CRIADA', 'EDITADA', 'REPROGRAMADA', 'CANCELADA', 'EXCLUIDA'));

-- As programações que já existiam ganham o evento de criação. A equipe e o período de origem saem do primeiro
-- evento registrado (o "antes" da primeira mudança); sem mudança, valem os atuais.
INSERT INTO eventos_programacao (id, id_programacao, numero_programacao, id_obra, numero_obra, tipo,
                                 id_equipe_destino, equipe_destino, inicio_novo, fim_novo, observacao,
                                 data_criacao, usuario_criacao)
SELECT gen_random_uuid(), p.id, p.numero, p.id_obra, o.numero, 'CRIADA',
       COALESCE(primeiro.id_equipe_origem, p.id_equipe),
       COALESCE(primeiro.equipe_origem, e.cod_equipe),
       COALESCE(primeiro.inicio_original, p.data_inicio),
       COALESCE(primeiro.fim_original, p.data_fim),
       p.descricao,
       p.data_criacao,
       p.usuario_criacao
FROM programacoes p
JOIN obras o ON o.id = p.id_obra
LEFT JOIN equipes e ON e.id = p.id_equipe
LEFT JOIN LATERAL (
    SELECT ev.id_equipe_origem, ev.equipe_origem, ev.inicio_original, ev.fim_original
    FROM eventos_programacao ev
    WHERE ev.id_programacao = p.id AND ev.inicio_original IS NOT NULL
    ORDER BY ev.data_criacao
    LIMIT 1
) primeiro ON TRUE
WHERE NOT EXISTS (SELECT 1 FROM eventos_programacao c WHERE c.id_programacao = p.id AND c.tipo = 'CRIADA');

CREATE INDEX IF NOT EXISTS idx_eventos_programacao_tipo_data ON eventos_programacao (tipo, data_criacao DESC);
