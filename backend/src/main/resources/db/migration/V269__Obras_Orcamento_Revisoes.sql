-- =====================================================================
-- V269: Orçamento da obra com revisões, serviços e materiais
--
-- O orçamento passa a ter revisões: cada importação, geração pelo
-- planejamento ou gravação da planilha de medição cria uma revisão nova
-- (a anterior fica no histórico); lançamentos manuais alteram a revisão
-- atual. Os itens ganham o tipo (serviço ou material), a operação
-- (instalar ou retirar) e o material do catálogo. Material pode não ter
-- valor: a quantidade já serve para conferir a obra.
-- =====================================================================

CREATE TABLE revisoes_orcamento_obras (
    id UUID PRIMARY KEY,
    id_obra UUID NOT NULL REFERENCES obras (id),
    numero INTEGER NOT NULL,
    origem VARCHAR(30) NOT NULL,
    observacao VARCHAR(500),
    id_importacao UUID REFERENCES importacoes_obras (id),
    valor_servicos NUMERIC(15, 2) NOT NULL DEFAULT 0,
    valor_materiais NUMERIC(15, 2) NOT NULL DEFAULT 0,
    quantidade_itens INTEGER NOT NULL DEFAULT 0,
    versao BIGINT DEFAULT 0,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao TIMESTAMP WITH TIME ZONE,
    usuario_criacao VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_desativacao TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX uk_revisoes_orcamento_obras_numero ON revisoes_orcamento_obras (id_obra, numero);

ALTER TABLE itens_orcamento_obras
    ADD COLUMN id_revisao UUID REFERENCES revisoes_orcamento_obras (id),
    ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'SERVICO',
    ADD COLUMN operacao VARCHAR(20) NOT NULL DEFAULT 'INSTALAR',
    ADD COLUMN id_material UUID;

ALTER TABLE itens_orcamento_obras ALTER COLUMN valor_total DROP NOT NULL;

CREATE INDEX idx_itens_orcamento_obras_revisao ON itens_orcamento_obras (id_revisao);

-- Orçamentos já importados: uma revisão por importação de cada obra, na ordem em que entraram.
WITH grupos AS (
    SELECT id_obra,
           id_importacao,
           MIN(data_criacao) AS criado_em,
           MIN(usuario_criacao) AS criado_por,
           COALESCE(SUM(valor_total), 0) AS total,
           COUNT(*) AS itens
      FROM itens_orcamento_obras
     GROUP BY id_obra, id_importacao
), numerados AS (
    SELECT g.*,
           gen_random_uuid() AS id_revisao,
           ROW_NUMBER() OVER (PARTITION BY id_obra ORDER BY criado_em) AS numero
      FROM grupos g
)
INSERT INTO revisoes_orcamento_obras (id, id_obra, numero, origem, id_importacao, valor_servicos, quantidade_itens,
                                      data_criacao, usuario_criacao)
SELECT id_revisao, id_obra, numero, 'IMPORTACAO', id_importacao, total, itens, criado_em, criado_por
  FROM numerados;

UPDATE itens_orcamento_obras i
   SET id_revisao = r.id
  FROM revisoes_orcamento_obras r
 WHERE r.id_obra = i.id_obra
   AND r.id_importacao IS NOT DISTINCT FROM i.id_importacao;
