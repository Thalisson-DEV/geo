-- =====================================================================
-- V272: Cadastro da APR (Segurança do Trabalho)
--
-- Riscos, medidas de controle e verificações da APR deixam de ser fixos no
-- código: viram um cadastro do SST, ajustado por cada cliente. O cadastro
-- nasce com as mesmas opções e sugestões que o app usava até aqui. A APR
-- lançada grava os textos como foram respondidos, então APRs antigas não mudam.
-- =====================================================================

CREATE TABLE modelos_apr (
    id UUID PRIMARY KEY,
    estrutura JSONB NOT NULL,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);

INSERT INTO modelos_apr (id, estrutura, usuario_criacao)
VALUES (gen_random_uuid(), '{
  "riscos": [
    {"id": "risco-choque", "texto": "Choque elétrico", "sugeridoEm": ["DESLIGAMENTO", "LINHA_VIVA", "ATERRAMENTO"], "medidas": ["medida-epi"]},
    {"id": "risco-arco", "texto": "Arco elétrico", "sugeridoEm": ["DESLIGAMENTO", "LINHA_VIVA"], "medidas": ["medida-epi"]},
    {"id": "risco-queda-altura", "texto": "Queda de altura", "sugeridoEm": ["LINHA_VIVA", "PODA", "POSTE"], "medidas": ["medida-escada"]},
    {"id": "risco-queda-materiais", "texto": "Queda de materiais ou ferramentas", "sugeridoEm": ["SEMPRE", "PODA"], "medidas": []},
    {"id": "risco-carga", "texto": "Movimentação de carga", "sugeridoEm": ["POSTE"], "medidas": ["medida-icamento", "medida-sinalizacao"]},
    {"id": "risco-trafego", "texto": "Tráfego de veículos", "sugeridoEm": ["TRAFEGO"], "medidas": ["medida-sinalizacao"]},
    {"id": "risco-escavacao", "texto": "Escavação", "sugeridoEm": ["ATERRAMENTO", "POSTE"], "medidas": ["medida-sinalizacao"]},
    {"id": "risco-animais", "texto": "Animais peçonhentos", "sugeridoEm": ["PODA"], "medidas": []},
    {"id": "risco-clima", "texto": "Condições climáticas", "sugeridoEm": [], "medidas": []},
    {"id": "risco-calor", "texto": "Calor ou esforço físico", "sugeridoEm": [], "medidas": ["medida-hidratacao"]}
  ],
  "medidas": [
    {"id": "medida-desenergizacao", "texto": "Desenergização", "sugeridaEm": ["DESLIGAMENTO"]},
    {"id": "medida-bloqueio", "texto": "Bloqueio e aterramento", "sugeridaEm": ["DESLIGAMENTO", "ATERRAMENTO"]},
    {"id": "medida-linha-viva", "texto": "Linha viva", "sugeridaEm": ["LINHA_VIVA"]},
    {"id": "medida-sinalizacao", "texto": "Sinalização e isolamento da área", "sugeridaEm": ["SEMPRE", "POSTE", "TRAFEGO"]},
    {"id": "medida-escada", "texto": "Inspeção de escada e cinto", "sugeridaEm": ["LINHA_VIVA", "PODA", "POSTE"]},
    {"id": "medida-icamento", "texto": "Plano de içamento", "sugeridaEm": ["POSTE"]},
    {"id": "medida-epi", "texto": "EPI e EPC", "sugeridaEm": ["SEMPRE"]},
    {"id": "medida-hidratacao", "texto": "Revezamento e hidratação", "sugeridaEm": []}
  ],
  "verificacoes": [
    {"id": "verif-conversa", "texto": "Conversa sobre os riscos feita com a equipe", "exigidaEm": []},
    {"id": "verif-epi", "texto": "EPI em bom estado", "exigidaEm": []},
    {"id": "verif-ferramentas", "texto": "Ferramentas e veículo inspecionados", "exigidaEm": []},
    {"id": "verif-area", "texto": "Área sinalizada", "exigidaEm": []},
    {"id": "verif-clima", "texto": "O clima permite o trabalho", "exigidaEm": []},
    {"id": "verif-desligamento", "texto": "Desligamento confirmado", "exigidaEm": ["DESLIGAMENTO"]}
  ]
}'::jsonb, 'SISTEMA');
