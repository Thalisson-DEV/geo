-- Formulários de inspeção de equipe parada (Concessionária): cada item traz a quantidade
-- esperada ou uma observação ("IND", "5", "Por escada") e nem todo item é de uma
-- pessoa — pneu, extintor e ferramenta são da equipe ou do veículo.

ALTER TABLE perguntas_inspecao
    ADD COLUMN orientacao VARCHAR(300);

-- Verdadeiro (padrão de tudo o que já existe): o desvio aponta quem cometeu.
-- Falso: o desvio é da equipe/veículo e pode ser lançado sem colaborador.
ALTER TABLE perguntas_inspecao
    ADD COLUMN desvio_por_colaborador BOOLEAN NOT NULL DEFAULT TRUE;
