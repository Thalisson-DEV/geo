-- Fecha a carga de Obras: traz as datas dos arquivos enviados pela API (projeto, memorial, fotos, As Built) para
-- perto dos eventos que eles registram e remove a tabela auxiliar demo_seed_obra.
-- Rodar depois do 22_obras_arquivos.py (e de novo se ele for reexecutado).
BEGIN;
-- Projeto mestre: anexado logo depois de o planejamento ser aberto
UPDATE anexos_obras a SET data_criacao = p.data_criacao + interval '40 minutes', data_ultima_alteracao = p.data_criacao + interval '40 minutes',
       usuario_criacao = 'CMENEZES'
  FROM planejamentos_obras p WHERE p.id_anexo_mestre = a.id AND a.data_criacao > p.data_criacao + interval '1 day';
-- Memorial e orçamento: alguns dias depois do cadastro da obra
UPDATE anexos_obras a SET data_criacao = least(now() - interval '1 day', o.data_criacao + ((3 + abs(hashtext(a.id::text)) % 6) || ' days')::interval),
       usuario_criacao = CASE WHEN a.nome_arquivo LIKE 'orcamento%' THEN 'PNOVAES' ELSE 'CMENEZES' END
  FROM obras o WHERE o.id = a.id_obra AND (a.nome_arquivo LIKE 'memorial%' OR a.nome_arquivo LIKE 'orcamento%') AND a.data_criacao > now() - interval '2 days';
-- Fotos: lançadas junto com a ficha As Built do ponto
UPDATE evidencias_ponto_obra e SET data_criacao = f.data_criacao - interval '25 minutes' + (abs(hashtext(e.id::text)) % 20) * interval '1 minute',
       usuario_criacao = 'MALIMA'
  FROM fichas_as_built f WHERE f.id_ponto = e.id_ponto AND f.ativo AND e.data_criacao > f.data_criacao + interval '1 day';
-- As Built: gerado poucos dias depois da conclusão
UPDATE documentos_as_built d SET data_criacao = least(now() - interval '3 hours', (o.data_fim_efetiva + 3)::timestamp AT TIME ZONE 'America/Sao_Paulo' + interval '10 hours'),
       usuario_criacao = 'MALIMA'
  FROM obras o WHERE o.id = d.id_obra AND o.data_fim_efetiva IS NOT NULL AND d.data_criacao > now() - interval '2 days';
UPDATE anexos_obras a SET data_criacao = d.data_criacao + interval '1 minute', usuario_criacao = 'MALIMA'
  FROM documentos_as_built d WHERE d.id_anexo = a.id AND a.data_criacao > d.data_criacao + interval '1 hour';

DROP TABLE IF EXISTS demo_seed_obra;
COMMIT;
