-- Book de obras e entrega documental.
-- 1) Fotos do book ganham a etapa (antes, durante, depois), as coordenadas e o momento da captura informados pelo app.
-- 2) As gerações passam a ter tipo: o As Built (plantas + fichas + fotos) e o Book fotográfico (capa, sumário e fotos por ponto),
--    cada um com a sua numeração de versões.
-- 3) Tipos de anexo podem ser exigidos na entrega da obra, alimentando a auditoria documental.

ALTER TABLE evidencias_ponto_obra
    ADD COLUMN etapa VARCHAR(10),
    ADD COLUMN latitude NUMERIC(9, 6),
    ADD COLUMN longitude NUMERIC(9, 6),
    ADD COLUMN data_captura TIMESTAMP WITH TIME ZONE,
    ADD CONSTRAINT ck_evidencias_ponto_etapa CHECK (etapa IS NULL OR etapa IN ('ANTES', 'DURANTE', 'DEPOIS')),
    ADD CONSTRAINT ck_evidencias_ponto_coordenadas CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    );

ALTER TABLE documentos_as_built
    ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'AS_BUILT',
    ADD COLUMN total_paginas INTEGER,
    ADD COLUMN total_fotos INTEGER,
    ADD CONSTRAINT ck_documentos_as_built_tipo CHECK (tipo IN ('AS_BUILT', 'BOOK'));

DROP INDEX IF EXISTS uq_documentos_as_built_versao;
CREATE UNIQUE INDEX uq_documentos_as_built_versao ON documentos_as_built (id_obra, tipo, numero_versao) WHERE status <> 'ERRO';

ALTER TABLE tipos_anexos_obras
    ADD COLUMN exigido_na_entrega BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN evidencias_ponto_obra.etapa IS 'Momento da foto em relação à execução: ANTES, DURANTE ou DEPOIS. Nulo quando não informado.';
COMMENT ON COLUMN documentos_as_built.tipo IS 'AS_BUILT: plantas marcadas, fichas e fotos. BOOK: book fotográfico com capa, sumário e fotos por ponto.';
COMMENT ON COLUMN tipos_anexos_obras.exigido_na_entrega IS 'Quando verdadeiro, a auditoria documental cobra um anexo deste tipo para a entrega da obra.';
