-- Visita prévia (pré-vistoria) da obra.
-- 1) O responsável passa a ser um colaborador. O nome continua gravado, para o histórico e o PDF não dependerem do cadastro.
--    Os registros atuais são ligados ao colaborador quando o nome casa com um único cadastro (sem caixa e sem acento).
-- 2) Evidências da visita: fotos (JPG ou PNG) e PDFs, de uma pergunta do checklist ou gerais da visita. São opcionais:
--    nenhuma pergunta exige evidência para salvar a visita.

ALTER TABLE visitas_previas_obra
    ADD COLUMN id_colaborador UUID REFERENCES colaboradores (id);

CREATE INDEX idx_visitas_previas_colaborador ON visitas_previas_obra (id_colaborador) WHERE id_colaborador IS NOT NULL;

COMMENT ON COLUMN visitas_previas_obra.id_colaborador IS 'Colaborador responsável pela visita. Nulo em registros antigos que não casaram com um cadastro.';
COMMENT ON COLUMN visitas_previas_obra.responsavel IS 'Nome do responsável no momento da visita, guardado para o histórico e o PDF.';

WITH casados AS (
    SELECT v.id AS id_visita, min(c.id::text)::uuid AS id_colaborador
      FROM visitas_previas_obra v
      JOIN colaboradores c ON immutable_unaccent(lower(c.nome_busca)) = immutable_unaccent(lower(trim(v.responsavel)))
     WHERE v.id_colaborador IS NULL
     GROUP BY v.id
    HAVING count(*) = 1
)
UPDATE visitas_previas_obra v
   SET id_colaborador = casados.id_colaborador
  FROM casados
 WHERE v.id = casados.id_visita;

CREATE TABLE evidencias_visita_previa_obra (
    id                       UUID PRIMARY KEY,
    id_obra                  UUID                     NOT NULL REFERENCES obras (id),
    id_visita                UUID                     NOT NULL REFERENCES visitas_previas_obra (id),
    id_pergunta              VARCHAR(100),
    enunciado_pergunta       VARCHAR(500),
    legenda                  VARCHAR(500),
    nome_arquivo             VARCHAR(255)             NOT NULL,
    content_type             VARCHAR(100)             NOT NULL,
    tamanho_bytes            BIGINT                   NOT NULL,
    chave_storage            VARCHAR(500)             NOT NULL,
    chave_miniatura          VARCHAR(500),
    versao                   BIGINT DEFAULT 0,
    data_criacao             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_alteracao    TIMESTAMP WITH TIME ZONE,
    usuario_criacao          VARCHAR(255),
    usuario_ultima_alteracao VARCHAR(255),
    ativo                    BOOLEAN                  NOT NULL DEFAULT TRUE,
    data_desativacao         TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_evidencias_visita_pergunta CHECK ((id_pergunta IS NULL) = (enunciado_pergunta IS NULL)),
    CONSTRAINT ck_evidencias_visita_tipo CHECK (content_type IN ('image/jpeg', 'image/png', 'application/pdf'))
);

CREATE INDEX idx_evidencias_visita_visita ON evidencias_visita_previa_obra (id_visita) WHERE ativo = TRUE;
CREATE INDEX idx_evidencias_visita_obra ON evidencias_visita_previa_obra (id_obra) WHERE ativo = TRUE;

COMMENT ON TABLE evidencias_visita_previa_obra IS 'Fotos e PDFs da visita prévia. Sem pergunta, é evidência geral da visita. Removida, só sai de cena: o arquivo fica no armazenamento.';
COMMENT ON COLUMN evidencias_visita_previa_obra.enunciado_pergunta IS 'Texto da pergunta quando a evidência foi lançada, para continuar legível se o modelo mudar.';
COMMENT ON COLUMN evidencias_visita_previa_obra.chave_miniatura IS 'Miniatura JPEG das fotos. Nula para PDF.';
