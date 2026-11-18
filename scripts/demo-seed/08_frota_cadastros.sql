BEGIN;
INSERT INTO frota_tipos_veiculo (id, nome, descricao, categoria_cnh_minima, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), t.n, t.d, t.c, 0, now()-interval '170 days', 'USRADMIN', true
FROM (VALUES ('Picape 4x4','Picape cabine dupla para equipes de manutenção','B'),('Picape leve','Utilitário leve para inspeção e leitura','B'),
 ('Caminhão Munck','Caminhão com guindauto para postes e transformadores','C'),('Caminhão Cesto Aéreo','Caminhão com cesto isolado para linha viva','C')) t(n,d,c)
WHERE NOT EXISTS (SELECT 1 FROM frota_tipos_veiculo x WHERE x.nome=t.n);

-- Condutores (CNH número é cifrado pela aplicação: fica nulo)
INSERT INTO frota_condutores (id, id_colaborador, cnh_categoria, cnh_validade, cnh_primeira_habilitacao, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), c.id, (ARRAY['B','AB','AD','D','AE'])[1+rn%5], (now() + ((rn*23 - 60)||' days')::interval)::date,
 (now() - ((2000+rn*170)||' days')::interval)::date, 0, now()-interval '120 days', 'USRADMIN', true
FROM (SELECT id, row_number() over (order by id) rn FROM colaboradores WHERE ativo) c WHERE rn<=18
ON CONFLICT (id_colaborador) DO NOTHING;

-- Documentos dos veículos (com vencimentos variados)
INSERT INTO frota_documentos (id, id_veiculo, tipo, descricao, numero, data_emissao, data_vencimento, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), v.id, t.tipo, t.descr, upper(substr(md5(v.placa||t.tipo),1,10)),
 (now() - ((300 - v.rn*9)||' days')::interval)::date, (now() + ((65 - v.rn*9 + t.off)||' days')::interval)::date, 0, now()-interval '90 days', 'USRADMIN', true
FROM (SELECT id, placa, row_number() over (order by placa) rn FROM veiculos) v,
 (VALUES ('CRLV','CRLV exercício 2026',120),('SEGURO','Apólice de seguro frota',40),('IPVA','IPVA 2026',200)) t(tipo,descr,off)
WHERE NOT EXISTS (SELECT 1 FROM frota_documentos x WHERE x.id_veiculo=v.id AND x.tipo=t.tipo);
COMMIT;
