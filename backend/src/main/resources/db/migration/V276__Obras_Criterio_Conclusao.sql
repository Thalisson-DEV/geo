-- Critério de obra concluída: além dos serviços executados, a obra só conclui sem foto obrigatória faltando (modelo que
-- trava) e sem ocorrência aberta de alteração de projeto ou de obra já executada por terceiros. O escritório resolve
-- a ocorrência na ficha da obra, dizendo o que foi decidido.
ALTER TABLE turno_ocorrencias
    ADD COLUMN resolvida_em TIMESTAMP WITH TIME ZONE,
    ADD COLUMN resolucao VARCHAR(500),
    ADD COLUMN usuario_resolucao VARCHAR(255);

CREATE INDEX idx_turno_ocorrencias_obra_abertas ON turno_ocorrencias (id_obra, tipo) WHERE resolvida_em IS NULL AND ativo;
