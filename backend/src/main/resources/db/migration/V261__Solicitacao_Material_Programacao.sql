-- V261: solicitação técnica gerada pela programação da obra.
--
-- Ao programar itens do planejamento, os materiais a instalar viram uma solicitação técnica de
-- adição, com o início da programação como data prevista de saque. A solicitação manual continua
-- existindo; o que distingue as duas é o vínculo abaixo (nulo = manual).
--
-- O número da programação é guardado junto (cópia) para a lista mostrar "Programação #N" sem
-- consultar o módulo de obras. Não há FK para programacoes: a programação pode ser excluída e a
-- solicitação, se já tiver movimentação, continua de pé com a referência histórica.

ALTER TABLE solicitacoes_material
    ADD COLUMN id_programacao UUID,
    ADD COLUMN numero_programacao BIGINT;

CREATE INDEX idx_solicitacoes_material_programacao
    ON solicitacoes_material (id_programacao)
    WHERE id_programacao IS NOT NULL;
