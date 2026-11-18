-- Book de obras e entrega documental (depende da migration V240).
-- 1) Classifica as fotos de campo por etapa, pelo item do modelo: vista geral = antes, aterramento = durante,
--    estrutura montada = depois; avulsas ficam sem etapa.
-- 2) Coordenadas e momento da captura, como o app informaria: perto da coordenada da obra, deslocadas pela posição do
--    ponto na folha (cerca de 1 km no máximo), tiradas alguns minutos antes do lançamento. Uma parte fica sem GPS.
-- 3) O memorial descritivo passa a ser exigido na entrega, alimentando a auditoria documental.
-- Rodar depois do 27_obras_ajuste_datas.sql (as datas das fotos já precisam estar no lugar).
BEGIN;

UPDATE evidencias_ponto_obra e
   SET etapa = CASE
                   WHEN e.titulo_item ILIKE 'vista geral%' THEN 'ANTES'
                   WHEN e.titulo_item ILIKE 'aterramento%' THEN 'DURANTE'
                   WHEN e.titulo_item ILIKE 'estrutura%' THEN 'DEPOIS'
               END
 WHERE e.etapa IS NULL AND e.titulo_item IS NOT NULL;

UPDATE evidencias_ponto_obra e
   SET data_captura = e.data_criacao - ((3 + abs(hashtext(e.id::text)) % 40) || ' minutes')::interval,
       latitude  = round((o.latitude  + (p.y - 0.5) * 0.009 + ((abs(hashtext(e.id::text || 'a')) % 9) - 4) * 0.000004)::numeric, 6),
       longitude = round((o.longitude + (p.x - 0.5) * 0.009 + ((abs(hashtext(e.id::text || 'b')) % 9) - 4) * 0.000004)::numeric, 6)
  FROM obras o, pontos_planejamento p
 WHERE o.id = e.id_obra AND p.id = e.id_ponto
   AND e.data_captura IS NULL
   AND o.latitude IS NOT NULL AND o.longitude IS NOT NULL
   -- Cerca de uma em oito fotos sem GPS, como acontece em campo.
   AND abs(hashtext(e.id::text)) % 8 <> 0;

UPDATE evidencias_ponto_obra e
   SET data_captura = e.data_criacao - ((3 + abs(hashtext(e.id::text)) % 40) || ' minutes')::interval
 WHERE e.data_captura IS NULL;

UPDATE tipos_anexos_obras SET exigido_na_entrega = TRUE WHERE upper(nome) IN ('MEMORIAL DESCRITIVO');

COMMIT;
