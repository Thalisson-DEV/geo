-- ═══════════════════════════════════════════════════════════════════════
-- Avisos do campo para o escritório de Obras.
--
-- Até aqui, o que a equipe lançava pelo app (ocorrência ou "sem condição de
-- executar") só era visto por quem abrisse a lista de turnos. As duas regras
-- abaixo levam o registro ao sininho e ao e-mail assim que ele chega:
--
-- * sem condição de executar: prioridade alta, para o supervisor da obra e
--   para quem programa (obras:programacao:write) — é a hora de reprogramar;
-- * demais ocorrências: prioridade normal, só para o supervisor da obra.
--
-- Nascem ligadas. O papel "supervisor" exclui quem lançou, e as regras podem
-- ser ajustadas ou desligadas na tela de regras de notificação.
-- ═══════════════════════════════════════════════════════════════════════

WITH nova_regra AS (
    INSERT INTO regras_notificacao (
        id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
        titulo_template, corpo_template, deeplink_template, limiar, cooldown_minutos,
        versao, data_criacao, usuario_criacao, ativo)
    VALUES (
        gen_random_uuid(), 'obras.campo.sem_condicao',
        'Equipe sem condição de executar a obra',
        'Avisa o supervisor da obra e quem programa que o serviço programado não pôde ser feito.',
        TRUE, 'OPERACIONAL', 'ALTA',
        'Obra {{numeroObra}}: {{equipe}} sem condição de executar',
        '{{tipoRotulo}}: {{descricao}}',
        '{{link}}', NULL, 0,
        0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE)
    RETURNING id
)
INSERT INTO destinatarios_regra_notificacao (
    id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), nova_regra.id, destino.tipo, NULL, destino.valor, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE
FROM nova_regra
CROSS JOIN (VALUES ('PAPEL_DINAMICO', 'supervisor'), ('PERMISSAO', 'obras:programacao:write')) AS destino(tipo, valor);

WITH nova_regra AS (
    INSERT INTO regras_notificacao (
        id, chave_gatilho, nome, descricao, sistema, categoria, prioridade,
        titulo_template, corpo_template, deeplink_template, limiar, cooldown_minutos,
        versao, data_criacao, usuario_criacao, ativo)
    VALUES (
        gen_random_uuid(), 'obras.campo.ocorrencia',
        'Ocorrência lançada pela equipe de Obras',
        'Avisa o supervisor da obra de cada ocorrência que a equipe lança pelo app.',
        TRUE, 'OPERACIONAL', 'NORMAL',
        'Ocorrência na obra {{numeroObra}} · {{equipe}}',
        '{{tipoRotulo}}: {{descricao}}',
        '{{link}}', NULL, 0,
        0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE)
    RETURNING id
)
INSERT INTO destinatarios_regra_notificacao (
    id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), nova_regra.id, 'PAPEL_DINAMICO', NULL, 'supervisor', 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE
FROM nova_regra;
