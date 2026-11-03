-- V181: histórico da OS registra a execução e os documentos fiscais
-- (openspec/changes/modulo-gestao-frota-execucao-os).
--
-- Aditiva: só amplia os tipos aceitos no histórico.
-- Rollback: recriar ck_frota_os_historico_tipo com a lista da V177 (sem os três tipos novos),
-- depois de apagar as linhas desses tipos.

ALTER TABLE frota_os_historico DROP CONSTRAINT ck_frota_os_historico_tipo;
ALTER TABLE frota_os_historico ADD CONSTRAINT ck_frota_os_historico_tipo CHECK (tipo IN (
    'ABERTA', 'EDITADA', 'AGENDADA', 'INICIADA', 'PREVISAO_ALTERADA', 'CONCLUIDA', 'CANCELADA',
    'VEICULO_PARADO', 'VEICULO_LIBERADO', 'ORCAMENTO_VINCULADO', 'ORCAMENTO_APROVADO', 'ORCAMENTO_REPROVADO',
    'EXECUCAO_ALTERADA', 'DOCUMENTO_FISCAL_INCLUIDO', 'DOCUMENTO_FISCAL_EXCLUIDO'));

