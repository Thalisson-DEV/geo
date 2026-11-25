-- =====================================================================
-- V273: Listas configuráveis
--
-- Motivos de ocorrência do turno, motivos de entrada e baixa avulsa de
-- estoque, tipos de documento do veículo, causas de manutenção e naturezas
-- de serviço da frota deixam de ser fixos no código: viram cadastro de cada
-- cliente. Os registros continuam guardando o mesmo código; as opções nascem
-- com os valores de antes. Ocorrência ganha "Obra já executada por terceiros"
-- e "Alteração de projeto pendente", pedidos no piloto. Opção "sistema" é
-- usada por uma regra (ex.: documento "Outro" exige descrição) e não pode ser
-- desativada.
-- =====================================================================

CREATE TABLE opcoes_lista (
    id UUID PRIMARY KEY,
    lista VARCHAR(40) NOT NULL,
    codigo VARCHAR(30) NOT NULL,
    rotulo VARCHAR(80) NOT NULL,
    descricao VARCHAR(255),
    ordem INTEGER NOT NULL,
    sistema BOOLEAN NOT NULL DEFAULT FALSE,
    contextos VARCHAR(200),
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_opcoes_lista_codigo UNIQUE (lista, codigo)
);

CREATE INDEX idx_opcoes_lista_lista ON opcoes_lista (lista, ordem);

INSERT INTO opcoes_lista (id, lista, codigo, rotulo, ordem, sistema, usuario_criacao) VALUES
    (gen_random_uuid(), 'OCORRENCIA_TURNO', 'SEGURANCA', 'Segurança', 1, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'OCORRENCIA_TURNO', 'CLIMA', 'Clima', 2, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'OCORRENCIA_TURNO', 'MATERIAL', 'Falta de material', 3, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'OCORRENCIA_TURNO', 'EQUIPAMENTO', 'Veículo ou equipamento', 4, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'OCORRENCIA_TURNO', 'ACESSO', 'Acesso ao local', 5, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'OCORRENCIA_TURNO', 'DESLIGAMENTO', 'Desligamento', 6, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'OCORRENCIA_TURNO', 'TERCEIROS', 'Terceiros ou clientes', 7, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'OCORRENCIA_TURNO', 'OBRA_EXECUTADA_POR_TERCEIROS', 'Obra já executada por terceiros', 8, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'OCORRENCIA_TURNO', 'ALTERACAO_DE_PROJETO', 'Alteração de projeto pendente', 9, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'OCORRENCIA_TURNO', 'OUTROS', 'Outros', 10, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'MOTIVO_MOVIMENTACAO_ESTOQUE', 'AJUSTE_INVENTARIO', 'Ajuste de inventário', 1, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'MOTIVO_MOVIMENTACAO_ESTOQUE', 'DEVOLUCAO_CAMPO', 'Devolução de campo', 2, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'MOTIVO_MOVIMENTACAO_ESTOQUE', 'AQUISICAO_EXTRA', 'Aquisição extra', 3, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'MOTIVO_MOVIMENTACAO_ESTOQUE', 'DOACAO_BONIFICACAO', 'Doação ou bonificação', 4, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'MOTIVO_MOVIMENTACAO_ESTOQUE', 'PERDA_AVARIA', 'Perda ou avaria', 5, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'MOTIVO_MOVIMENTACAO_ESTOQUE', 'DANIFICACAO', 'Danificação', 6, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'MOTIVO_MOVIMENTACAO_ESTOQUE', 'SUCATEAMENTO', 'Sucateamento', 7, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'MOTIVO_MOVIMENTACAO_ESTOQUE', 'OBSOLESCENCIA', 'Obsolescência', 8, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'MOTIVO_MOVIMENTACAO_ESTOQUE', 'OUTROS', 'Outros', 9, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'TIPO_DOCUMENTO_VEICULO', 'CRLV', 'CRLV', 1, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'TIPO_DOCUMENTO_VEICULO', 'LICENCIAMENTO', 'Licenciamento', 2, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'TIPO_DOCUMENTO_VEICULO', 'IPVA', 'IPVA', 3, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'TIPO_DOCUMENTO_VEICULO', 'SEGURO', 'Seguro', 4, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'TIPO_DOCUMENTO_VEICULO', 'TACOGRAFO', 'Aferição do tacógrafo', 5, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'TIPO_DOCUMENTO_VEICULO', 'ANTT', 'ANTT', 6, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'TIPO_DOCUMENTO_VEICULO', 'INSPECAO_VEICULAR', 'Inspeção veicular', 7, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'TIPO_DOCUMENTO_VEICULO', 'LAUDO_IMPLEMENTO', 'Laudo do implemento', 8, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'TIPO_DOCUMENTO_VEICULO', 'CONTRATO_LOCACAO', 'Contrato de locação', 9, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'TIPO_DOCUMENTO_VEICULO', 'OUTRO', 'Outro', 10, TRUE, 'SISTEMA'),
    (gen_random_uuid(), 'CAUSA_MANUTENCAO', 'AVARIA', 'Avaria', 1, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'CAUSA_MANUTENCAO', 'DESGASTE_NATURAL', 'Desgaste natural', 2, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'CAUSA_MANUTENCAO', 'USO_INDEVIDO', 'Uso indevido', 3, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'CAUSA_MANUTENCAO', 'SERVICO_CORRETIVO', 'Serviço corretivo', 4, TRUE, 'SISTEMA'),
    (gen_random_uuid(), 'CAUSA_MANUTENCAO', 'SERVICO_PREVENTIVO', 'Serviço preventivo', 5, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'CAUSA_MANUTENCAO', 'ESTOQUE', 'Estoque', 6, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'CAUSA_MANUTENCAO', 'SUBSTITUICAO_PNEUS', 'Substituição de pneus', 7, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'COMPRA_E_REFORMA_DE_PNEUS', 'Compra e reforma de pneus', 1, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'SUSPENSAO_FREIOS', 'Suspensão / freios', 2, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'ARREFECIMENTO', 'Arrefecimento', 3, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'TRANSMISSAO', 'Transmissão', 4, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'ELETRICA', 'Elétrica', 5, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'CHAPARIA_E_PINTURA', 'Chaparia e pintura', 6, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'GUINCHO', 'Guincho', 7, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'HIDRAULICA', 'Hidráulica', 8, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'TAPECARIA', 'Tapeçaria', 9, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'LAVAGEM_E_LUBRIFICACAO', 'Lavagem e lubrificação', 10, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'ACESSORIOS', 'Acessórios', 11, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'BATERIA', 'Bateria', 12, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'BORRACHARIA', 'Borracharia', 13, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'MECANICA', 'Mecânica', 14, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'PNEUMATICA', 'Pneumática', 15, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'POSTO_DE_MOLAS', 'Posto de molas', 16, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'REFRIGERACAO_E_CLIMATIZACAO', 'Refrigeração e climatização', 17, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'TACOGRAFO', 'Tacógrafo', 18, FALSE, 'SISTEMA'),
    (gen_random_uuid(), 'NATUREZA_SERVICO_FROTA', 'TORNEADORA', 'Torneadora', 19, FALSE, 'SISTEMA');

-- O valor gravado agora vem do cadastro; as listas fixas no banco saem.
ALTER TABLE turno_ocorrencias DROP CONSTRAINT IF EXISTS ck_turno_ocorrencias_tipo;
ALTER TABLE frota_documentos DROP CONSTRAINT IF EXISTS ck_frota_documento_tipo;
ALTER TABLE frota_itens_manutencao DROP CONSTRAINT IF EXISTS ck_frota_item_natureza;
ALTER TABLE frota_ordens_servico DROP CONSTRAINT IF EXISTS ck_frota_os_causa;

-- Motivos de estoque: onde cada um vale (sem marca, vale em entrada e baixa).
UPDATE opcoes_lista SET contextos = 'ENTRADA' WHERE lista = 'MOTIVO_MOVIMENTACAO_ESTOQUE' AND codigo IN ('DEVOLUCAO_CAMPO', 'AQUISICAO_EXTRA', 'DOACAO_BONIFICACAO');
UPDATE opcoes_lista SET contextos = 'BAIXA' WHERE lista = 'MOTIVO_MOVIMENTACAO_ESTOQUE' AND codigo IN ('PERDA_AVARIA', 'DANIFICACAO', 'SUCATEAMENTO', 'OBSOLESCENCIA');
