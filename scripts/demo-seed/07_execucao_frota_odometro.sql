BEGIN;
INSERT INTO municipios (id, nome, id_base_operacional, ativo, data_criacao, versao, usuario_criacao)
SELECT gen_random_uuid(), m.nome, b.id, true, now()-interval '180 days', 0, 'USRADMIN'
FROM (VALUES ('JUAZEIRO','JUAZEIRO'),('SOBRADINHO','JUAZEIRO'),('CURAÇÁ','JUAZEIRO'),('REMANSO','REMANSO'),('PILÃO ARCADO','REMANSO'),
 ('CASA NOVA','REMANSO'),('JACOBINA','JACOBINA'),('MIGUEL CALMON','JACOBINA'),('SENHOR DO BONFIM','BONFIM'),('CAMPO FORMOSO','BONFIM'),('ANTÔNIO GONÇALVES','BONFIM')) m(nome,base)
JOIN bases_operacionais b ON b.nome=m.base
WHERE NOT EXISTS (SELECT 1 FROM municipios x WHERE x.nome=m.nome);

-- Execuções (notas avulsas com referência provisória; referencia_nota é cifrada pela aplicação e fica nula)
WITH eq AS (SELECT e.id, e.id_base_operacional, row_number() over (order by cod_equipe) rn, count(*) over () tot FROM equipes e WHERE e.ativo),
ts AS (SELECT array_agg(id) a FROM tipos_servico),
mu AS (SELECT array_agg(id) a FROM municipios WHERE nome<>'MUNICIPIO TESTE'),
u AS (SELECT id FROM usuarios WHERE login='USRADMIN')
INSERT INTO execucoes_comercial (id, id_equipe, id_municipio, latitude, longitude, data_lancamento, status_execucao, valor_total_faturado, id_usuario_alteracao, data_alteracao,
 id_tipo_servico, tipo_nota, referencia_provisoria, total_alteracoes, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), eq.id, mu.a[1+gs%array_length(mu.a,1)], -9.4-random()*2, -40.5+random()*0.9,
 date_trunc('day', now()) - ((gs/2)||' days')::interval + ((7+gs%10)||' hours')::interval,
 CASE WHEN gs%17=0 THEN 'EDITADO' WHEN gs<4 THEN 'INICIADO' ELSE 'CONCLUIDO' END,
 round((180+random()*2400)::numeric,2), u.id, now()-((gs/2)||' days')::interval,
 ts.a[1+gs%array_length(ts.a,1)], 'AVULSA', 'PRV-'||lpad(gs::text,6,'0'), CASE WHEN gs%17=0 THEN 1 ELSE 0 END,
 0, now()-((gs/2)||' days')::interval, 'USRADMIN', true
FROM generate_series(1,360) gs JOIN eq ON eq.rn = 1+(gs % eq.tot), ts, mu, u
WHERE NOT EXISTS (SELECT 1 FROM execucoes_comercial x WHERE x.referencia_provisoria='PRV-'||lpad(gs::text,6,'0'));

-- Leituras de odômetro (diárias, últimos 60 dias) por veículo
INSERT INTO frota_leituras_odometro (id, id_veiculo, km, lido_em, origem, id_usuario_registro, situacao, km_anterior, versao, data_criacao, usuario_criacao, ativo)
SELECT gen_random_uuid(), v.id, v.base_km + d*v.diario, now() - ((60-d)||' days')::interval,
 CASE WHEN d%7=0 THEN 'ABASTECIMENTO' WHEN d%15=0 THEN 'CHECKLIST' ELSE 'TELEMETRIA' END,
 (SELECT id FROM usuarios WHERE login='USRADMIN'), 'VALIDA', CASE WHEN d>0 THEN v.base_km + (d-1)*v.diario END,
 0, now() - ((60-d)||' days')::interval, 'USRADMIN', true
FROM (SELECT id, 20000 + (abs(hashtext(placa)) % 120000) base_km, 60 + (abs(hashtext(placa)) % 140) diario FROM veiculos) v, generate_series(0,60,3) d
WHERE NOT EXISTS (SELECT 1 FROM frota_leituras_odometro x WHERE x.id_veiculo=v.id);
COMMIT;
