-- Zera o domínio de Obras (obras e tudo que depende delas) preservando os cadastros base:
-- status_obras, tipos_anexos_obras, modelos_checklist_obra, kits construtivos, processos, bases, equipes,
-- colaboradores, usuários, contratos, municípios e centros de custo.
-- Também remove os turnos de campo das equipes (o boletim de Obras é recriado no 19) e as solicitações de
-- material vinculadas a obras, com seus eventos, operações, reservas e movimentações.
BEGIN;

CREATE TEMP TABLE _sol ON COMMIT DROP AS SELECT id FROM solicitacoes_material WHERE id_obra IS NOT NULL;
CREATE TEMP TABLE _est ON COMMIT DROP AS SELECT id FROM estoques WHERE id_obra IS NOT NULL;
CREATE TEMP TABLE _tur ON COMMIT DROP AS
SELECT t.id FROM turnos t WHERE NOT EXISTS (SELECT 1 FROM execucoes_comercial e WHERE e.id_turno = t.id);

-- Material: movimentações, operações, reservas e eventos das solicitações técnicas
DELETE FROM movimentacoes_estoque
 WHERE id_solicitacao IN (SELECT id FROM _sol) OR id_obra IS NOT NULL
    OR id_estoque_origem IN (SELECT id FROM _est) OR id_estoque_destino IN (SELECT id FROM _est);
DELETE FROM comandos_idempotentes_solicitacao WHERE id_solicitacao IN (SELECT id FROM _sol)
    OR id_operacao IN (SELECT id FROM operacoes_solicitacao_material WHERE id_solicitacao IN (SELECT id FROM _sol));
DELETE FROM itens_operacao_solicitacao WHERE id_operacao IN (SELECT id FROM operacoes_solicitacao_material WHERE id_solicitacao IN (SELECT id FROM _sol));
UPDATE operacoes_solicitacao_material SET id_operacao_original = NULL WHERE id_solicitacao IN (SELECT id FROM _sol);
DELETE FROM operacoes_solicitacao_material WHERE id_solicitacao IN (SELECT id FROM _sol);
DELETE FROM reservas_solicitacao_tecnica WHERE id_solicitacao IN (SELECT id FROM _sol);
-- A trilha de eventos é append-only (trigger); o reset é a única exceção.
ALTER TABLE eventos_solicitacao_material DISABLE TRIGGER trg_eventos_solicitacao_append_only;
DELETE FROM eventos_solicitacao_material WHERE id_solicitacao IN (SELECT id FROM _sol);
ALTER TABLE eventos_solicitacao_material ENABLE TRIGGER trg_eventos_solicitacao_append_only;
DELETE FROM itens_solicitacao WHERE id_solicitacao IN (SELECT id FROM _sol);
DELETE FROM solicitacoes_material WHERE id IN (SELECT id FROM _sol)
    OR id_estoque_destino IN (SELECT id FROM _est) OR id_estoque_origem IN (SELECT id FROM _est)
    OR id_almoxarifado_atendimento IN (SELECT id FROM _est);
DELETE FROM saldos WHERE id_estoque IN (SELECT id FROM _est);
DELETE FROM saldos_seriais WHERE id_estoque IN (SELECT id FROM _est);
DELETE FROM estoque_parametros_material WHERE id_estoque IN (SELECT id FROM _est);
DELETE FROM estoques WHERE id IN (SELECT id FROM _est);
UPDATE financeiro_solicitacao_compra SET obra_id = NULL WHERE obra_id IS NOT NULL;
UPDATE financeiro_solicitacao_pagamento SET obra_id = NULL WHERE obra_id IS NOT NULL;
UPDATE financeiro_documento SET obra_id = NULL WHERE obra_id IS NOT NULL;

-- Turnos de campo (boletim) e execução apontada
DELETE FROM apontamentos_execucao;
DELETE FROM turno_anexos WHERE id_turno IN (SELECT id FROM _tur);
DELETE FROM turno_aprs;
DELETE FROM turno_atividades;
DELETE FROM turno_ocorrencias;
DELETE FROM turno_relatorios WHERE id_turno IN (SELECT id FROM _tur);
DELETE FROM turno_membros WHERE id_turno IN (SELECT id FROM _tur);
DELETE FROM turno_substitutos WHERE id_turno IN (SELECT id FROM _tur);
DELETE FROM frota_telemetria_turnos WHERE id_turno IN (SELECT id FROM _tur);
DELETE FROM turnos WHERE id IN (SELECT id FROM _tur);

-- Medição
DELETE FROM medicao_itens;
DELETE FROM medicoes_obras;

-- Programação
DELETE FROM programacao_itens;
DELETE FROM eventos_programacao;
DELETE FROM programacoes;

-- Documentação técnica
DELETE FROM fichas_as_built;
DELETE FROM equipamentos_obra;
DELETE FROM evidencias_ponto_obra;
DELETE FROM documentos_as_built;
DELETE FROM visitas_previas_obra;

-- Planejamento
DELETE FROM itens_planejados;
DELETE FROM kits_aplicados;
DELETE FROM vaos_planejamento;
DELETE FROM pontos_planejamento;
DELETE FROM anotacoes_planejamento;
DELETE FROM analises_planejamento;
DELETE FROM planejamentos_obras;

-- Carteira
DELETE FROM anexos_obras;
DELETE FROM itens_orcamento_obras;
DELETE FROM importacoes_obras;
DELETE FROM historico_status_obras;
DELETE FROM obras_equipes;
DELETE FROM obras_relacionamentos;
DELETE FROM ocorrencias_obras;
UPDATE obras SET id_obra_pai = NULL WHERE id_obra_pai IS NOT NULL;
DELETE FROM obras;

-- Numeração volta ao início
SELECT setval('programacoes_numero_seq', 1, false);
SELECT setval('medicoes_obras_numero_seq', 1, false);
DROP TABLE IF EXISTS demo_seed_obra;
COMMIT;
