-- Fotos obrigatórias do modelo As Built travam a execução no app: o ponto só fica "Tudo feito" com todas as fotos
-- obrigatórias, e o "Parcial" pede as fotos obrigatórias de antes. Desligado, a falta de foto só vira pendência.
ALTER TABLE modelos_checklist_obra
    ADD COLUMN fotos_travam_execucao BOOLEAN NOT NULL DEFAULT TRUE;
