-- Anexos e evidências da OS: checklist da oficina assinado, fotos de antes e depois (pneu,
-- peça quebrada), laudos. Os documentos fiscais seguem à parte, com número e valor.
--
-- Aditiva. Rollback: DROP TABLE frota_os_anexos e recriar ck_frota_os_historico_tipo com a
-- lista da V203, depois de apagar as linhas ANEXO_INCLUIDO e ANEXO_EXCLUIDO.

CREATE TABLE frota_os_anexos (
    id UUID PRIMARY KEY,
    id_ordem_servico UUID NOT NULL REFERENCES frota_ordens_servico(id),
    descricao VARCHAR(200),
    arquivo_chave VARCHAR(500) NOT NULL,
    arquivo_nome VARCHAR(255) NOT NULL,
    arquivo_content_type VARCHAR(120),
    arquivo_tamanho_bytes BIGINT,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_frota_os_anexos_os ON frota_os_anexos (id_ordem_servico) WHERE ativo;

ALTER TABLE frota_os_historico DROP CONSTRAINT ck_frota_os_historico_tipo;
ALTER TABLE frota_os_historico ADD CONSTRAINT ck_frota_os_historico_tipo CHECK (tipo IN (
    'ABERTA', 'EDITADA', 'AGENDADA', 'INICIADA', 'PREVISAO_ALTERADA', 'CONCLUIDA', 'CANCELADA',
    'VEICULO_PARADO', 'VEICULO_LIBERADO', 'ORCAMENTO_VINCULADO', 'ORCAMENTO_APROVADO', 'ORCAMENTO_REPROVADO',
    'EXECUCAO_ALTERADA', 'DOCUMENTO_FISCAL_INCLUIDO', 'DOCUMENTO_FISCAL_EXCLUIDO', 'ANEXO_INCLUIDO', 'ANEXO_EXCLUIDO'));
