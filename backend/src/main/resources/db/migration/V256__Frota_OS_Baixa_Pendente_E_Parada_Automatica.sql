-- Pedidos do gestor da frota (10/11/2026):
-- 1) Concluir a OS só com as datas: ela fica "concluída, baixa pendente" até alguém lançar a
--    causa, o serviço realizado e os valores (a baixa). Com a baixa, a OS está finalizada.
-- 2) A OS concluída pode voltar para em andamento (o veículo deu problema no teste).
-- 3) OS em andamento sempre conta o veículo como parado (antes dependia de marcar à mão).
--
-- Aditiva. Rollback: apagar as linhas REABERTA e BAIXA_REGISTRADA do histórico, recriar
-- ck_frota_os_historico_tipo com a lista da V229, recriar ck_frota_os_concluida com a regra
-- da V201 (exige descricao_servico), DROP TABLE frota_plano_preventivo_veiculos, DROP COLUMN
-- frota_os_pecas.id_item_manutencao, frota_itens_manutencao.tipo, finalizada_em e id_usuario_finalizacao.

ALTER TABLE frota_ordens_servico ADD COLUMN finalizada_em TIMESTAMP WITH TIME ZONE;
ALTER TABLE frota_ordens_servico ADD COLUMN id_usuario_finalizacao UUID;

-- Tudo o que já estava concluído teve a baixa junto com a conclusão.
UPDATE frota_ordens_servico
   SET finalizada_em = fim_real
 WHERE situacao = 'CONCLUIDA';

ALTER TABLE frota_ordens_servico DROP CONSTRAINT ck_frota_os_concluida;
ALTER TABLE frota_ordens_servico ADD CONSTRAINT ck_frota_os_concluida CHECK (
    situacao <> 'CONCLUIDA'
    OR (inicio_real IS NOT NULL AND fim_real IS NOT NULL
        AND (finalizada_em IS NULL OR descricao_servico IS NOT NULL)));
ALTER TABLE frota_ordens_servico ADD CONSTRAINT ck_frota_os_finalizada CHECK (
    finalizada_em IS NULL OR situacao = 'CONCLUIDA');

CREATE INDEX idx_frota_os_baixa_pendente ON frota_ordens_servico (fim_real)
    WHERE situacao = 'CONCLUIDA' AND finalizada_em IS NULL AND ativo;

ALTER TABLE frota_os_historico DROP CONSTRAINT ck_frota_os_historico_tipo;
ALTER TABLE frota_os_historico ADD CONSTRAINT ck_frota_os_historico_tipo CHECK (tipo IN (
    'ABERTA', 'EDITADA', 'AGENDADA', 'INICIADA', 'PREVISAO_ALTERADA', 'CONCLUIDA', 'CANCELADA',
    'VEICULO_PARADO', 'VEICULO_LIBERADO', 'ORCAMENTO_VINCULADO', 'ORCAMENTO_APROVADO', 'ORCAMENTO_REPROVADO',
    'EXECUCAO_ALTERADA', 'DOCUMENTO_FISCAL_INCLUIDO', 'DOCUMENTO_FISCAL_EXCLUIDO', 'ANEXO_INCLUIDO', 'ANEXO_EXCLUIDO',
    'REABERTA', 'BAIXA_REGISTRADA'));

-- OS de veículo já em andamento sem parada: passa a contar desde o início real.
CREATE TEMP TABLE tmp_os_parada_automatica ON COMMIT DROP AS
SELECT id, id_veiculo, GREATEST(inicio_real, aberta_em) AS desde
  FROM frota_ordens_servico
 WHERE situacao = 'EM_ANDAMENTO' AND veicular AND ativo AND NOT veiculo_parado AND inicio_real IS NOT NULL;

UPDATE frota_ordens_servico os
   SET veiculo_parado = TRUE, parado_desde = t.desde, liberado_em = NULL
  FROM tmp_os_parada_automatica t
 WHERE os.id = t.id;

INSERT INTO frota_os_historico (id, id_ordem_servico, tipo, descricao, id_usuario, ocorrido_em, data_criacao, ativo)
SELECT gen_random_uuid(), t.id, 'VEICULO_PARADO',
       'Veículo parado desde ' || to_char(t.desde AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
           || ': OS em andamento conta como veículo parado.',
       NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE
  FROM tmp_os_parada_automatica t;

UPDATE frota_fichas_veiculo f
   SET situacao = 'EM_MANUTENCAO'
 WHERE f.situacao = 'ATIVO'
   AND f.id_veiculo IN (SELECT id_veiculo FROM tmp_os_parada_automatica);

-- 4) Item de manutenção é peça (óleo, filtro) ou mão de obra (revisão): a peça da OS sai da lista
--    de itens do tipo peça (nada de nomes diferentes para a mesma coisa) e a OS do plano preventivo
--    já nasce com as peças e a mão de obra lançadas.
ALTER TABLE frota_itens_manutencao ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'MAO_DE_OBRA';
ALTER TABLE frota_itens_manutencao ADD CONSTRAINT ck_frota_item_manutencao_tipo CHECK (tipo IN ('PECA', 'MAO_DE_OBRA'));
ALTER TABLE frota_os_pecas ADD COLUMN id_item_manutencao UUID REFERENCES frota_itens_manutencao(id);

-- 5) O plano preventivo pode valer para placas escolhidas (além de tipos de veículo e de implemento).
CREATE TABLE frota_plano_preventivo_veiculos (
    id_plano UUID NOT NULL REFERENCES frota_planos_preventivos(id),
    id_veiculo UUID NOT NULL,
    PRIMARY KEY (id_plano, id_veiculo)
);
