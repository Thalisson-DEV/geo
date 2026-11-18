-- O aviso de manutenção agendada passa a ir também para quem responde pelo veículo:
-- o supervisor e o coordenador da equipe que o usa (papéis do próprio evento). O texto
-- ganha a oficina, para o gestor saber onde e quando o carro vai ficar.

UPDATE regras_notificacao
   SET titulo_template = 'Manutenção agendada: {{placa}} em {{dataAgendamento}}',
       corpo_template  = 'A OS {{numero}} de {{placa}} (base {{base}}) foi agendada para {{dataAgendamento}}{{localTexto}}, com {{oficina}}. Criticidade {{criticidade}}: {{descricao}}',
       descricao       = 'Avisa a oficina e os gestores do veículo (supervisor e coordenador da equipe) quando uma OS é agendada ou reagendada.',
       enviar_email    = TRUE
 WHERE chave_gatilho = 'frota.os_agendada'
   AND sistema = TRUE;

INSERT INTO destinatarios_regra_notificacao (
    id, id_regra, tipo, id_alvo, valor_alvo, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), r.id, 'PAPEL_DINAMICO', NULL, p.papel, 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE
  FROM regras_notificacao r
 CROSS JOIN (VALUES ('supervisorVeiculo'), ('coordenadorVeiculo')) AS p(papel)
 WHERE r.chave_gatilho = 'frota.os_agendada'
   AND r.sistema = TRUE
   AND NOT EXISTS (
        SELECT 1 FROM destinatarios_regra_notificacao d
         WHERE d.id_regra = r.id AND d.tipo = 'PAPEL_DINAMICO' AND d.valor_alvo = p.papel);
