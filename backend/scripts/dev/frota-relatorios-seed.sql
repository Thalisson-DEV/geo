-- =====================================================================================
-- Carga de DESENVOLVIMENTO para os relatórios gerenciais da frota.
--
-- Cria 12 meses de fatos coerentes (OS, abastecimentos, despesas, leituras, checklists,
-- apólices, sinistros, documentos, condutores, telemetria, turnos/notas da execução e
-- eventos de SST com veículo) para os veículos existentes e mais 24 veículos SEE*.
--
-- NÃO é migração Flyway e NÃO roda em produção:
--   - recusa se o banco tiver mais de 50 veículos que não sejam do seed;
--   - tudo fica marcado ([seed], SEED_RELATORIOS, placas SEE*, SEED-*) e é apagado
--     pelo próprio script antes de recriar.
--
-- Uso (banco local da branch):
--   docker exec -i ces-postgres psql -U postgres -d ces-db-frota -v ON_ERROR_STOP=1 \
--     < backend/scripts/dev/frota-relatorios-seed.sql
-- Só limpar:  acrescente  -v limpar=1
--
-- Pré-requisitos: migrações até a V217, ao menos um colaborador ativo, um usuário,
-- um modelo de checklist, bases operacionais e processos de negócio cadastrados.
-- =====================================================================================

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
    IF (SELECT count(*) FROM veiculos WHERE placa NOT LIKE 'SEE%') > 50 THEN
        RAISE EXCEPTION 'Banco com mais de 50 veículos reais: o seed dos relatórios só roda em desenvolvimento.';
    END IF;
END $$;

-- ── Limpeza ──────────────────────────────────────────────────────────────────────────

DELETE FROM execucoes_comercial WHERE referencia_provisoria LIKE 'SEED-%';
DELETE FROM turnos WHERE motivo_encerramento = '[seed]';
DELETE FROM eventos_sst WHERE numero_registro LIKE 'SEED-%';
DELETE FROM frota_telemetria_eventos WHERE id_externo LIKE 'seed-%';
DELETE FROM frota_telemetria_dias
 WHERE id_rastreador IN (SELECT id FROM frota_telemetria_rastreadores WHERE id_externo LIKE 'seed-%');
DELETE FROM frota_telemetria_rastreadores WHERE id_externo LIKE 'seed-%';
DELETE FROM frota_checklists WHERE comentario = '[seed]';
DELETE FROM frota_abastecimento_alertas
 WHERE id_abastecimento IN (SELECT id FROM frota_abastecimentos WHERE observacao = '[seed]');
DELETE FROM frota_abastecimento_itens
 WHERE id_abastecimento IN (SELECT id FROM frota_abastecimentos WHERE observacao = '[seed]');
DELETE FROM frota_abastecimentos WHERE observacao = '[seed]';
DELETE FROM frota_sinistros WHERE descricao LIKE '[seed]%';
DELETE FROM frota_os_itens
 WHERE id_ordem_servico IN (SELECT id FROM frota_ordens_servico WHERE sistema_origem = 'SEED_RELATORIOS');
DELETE FROM frota_ordens_servico WHERE sistema_origem = 'SEED_RELATORIOS';
DELETE FROM frota_despesas WHERE sistema_origem = 'SEED_RELATORIOS';
DELETE FROM frota_leituras_odometro WHERE motivo_situacao = '[seed]';
DELETE FROM frota_apolice_parcelas WHERE id_apolice IN (SELECT id FROM frota_apolices WHERE observacao = '[seed]');
DELETE FROM frota_apolice_veiculos WHERE id_apolice IN (SELECT id FROM frota_apolices WHERE observacao = '[seed]');
DELETE FROM frota_apolices WHERE observacao = '[seed]';
DELETE FROM frota_documentos WHERE observacao = '[seed]';
DELETE FROM frota_vinculos_condutor WHERE observacao = '[seed]';
DELETE FROM frota_condutores WHERE observacao = '[seed]';
DELETE FROM equipes WHERE cod_equipe LIKE 'SEED-%';
DELETE FROM tipos_equipe WHERE nome = 'SEED EQUIPE FROTA';

-- O que o próprio sistema tenha criado depois para os veículos do seed (alertas, controles...).
DO $$
DECLARE
    t text;
    pendentes text[];
    passada int := 0;
BEGIN
    SELECT array_agg(DISTINCT c.table_name::text) INTO pendentes
      FROM information_schema.columns c
      JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.table_schema = 'public' AND c.column_name = 'id_veiculo' AND tb.table_type = 'BASE TABLE'
       AND c.table_name <> 'veiculos';
    WHILE coalesce(array_length(pendentes, 1), 0) > 0 AND passada < 8 LOOP
        passada := passada + 1;
        FOREACH t IN ARRAY pendentes LOOP
            BEGIN
                EXECUTE format('DELETE FROM %I WHERE id_veiculo IN (SELECT id FROM veiculos WHERE placa LIKE ''SEE%%'')', t);
                pendentes := array_remove(pendentes, t);
            EXCEPTION WHEN foreign_key_violation THEN NULL;
            END;
        END LOOP;
    END LOOP;
END $$;

DELETE FROM veiculos WHERE placa LIKE 'SEE%';
DELETE FROM frota_itens_manutencao WHERE sistema_origem = 'SEED_RELATORIOS';
DELETE FROM frota_tipos_despesa WHERE codigo LIKE 'SEED_%';
DELETE FROM frota_tipos_veiculo WHERE descricao = '[seed]';
DELETE FROM frota_postos WHERE observacao = '[seed]';

\if :{?limpar}
COMMIT;
\echo 'Seed dos relatórios removido.'
\quit
\endif

SELECT setseed(0.2026);

-- ── Referências ──────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM colaboradores WHERE ativo) THEN
        RAISE EXCEPTION 'Cadastre ao menos um colaborador ativo antes do seed.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM frota_checklist_modelos WHERE ativo) THEN
        RAISE EXCEPTION 'Cadastre ao menos um modelo de checklist antes do seed.';
    END IF;
END $$;

CREATE TEMP TABLE ref ON COMMIT DROP AS
SELECT
    (SELECT id FROM usuarios WHERE ativo ORDER BY login LIMIT 1) AS id_usuario,
    (SELECT id FROM frota_checklist_modelos WHERE ativo ORDER BY nome LIMIT 1) AS id_modelo,
    (SELECT nome FROM frota_checklist_modelos WHERE ativo ORDER BY nome LIMIT 1) AS modelo_nome,
    DATE '2025-11-01' AS inicio,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje;

CREATE TEMP TABLE colab ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY id)::int AS n FROM colaboradores WHERE ativo;

CREATE TEMP TABLE bases ON COMMIT DROP AS
SELECT id, nome, row_number() OVER (ORDER BY nome)::int AS n FROM bases_operacionais WHERE ativo;

INSERT INTO frota_tipos_veiculo (id, nome, descricao, categoria_cnh_minima, ativo)
SELECT gen_random_uuid(), v.nome, '[seed]', v.cnh, true
  FROM (VALUES ('CAMINHÃO CESTO AÉREO', 'D'), ('RETROESCAVADEIRA', 'C')) v(nome, cnh)
 WHERE NOT EXISTS (SELECT 1 FROM frota_tipos_veiculo t WHERE upper(t.nome) = v.nome AND t.ativo);

CREATE TEMP TABLE tipos ON COMMIT DROP AS
SELECT
    (SELECT id FROM frota_tipos_veiculo WHERE upper(nome) = 'PICAPE' AND ativo LIMIT 1) AS picape,
    (SELECT id FROM frota_tipos_veiculo WHERE upper(nome) = 'SEDAN' AND ativo LIMIT 1) AS sedan,
    (SELECT id FROM frota_tipos_veiculo WHERE upper(nome) = 'CAMINHÃO MUNCK' AND ativo LIMIT 1) AS munck,
    (SELECT id FROM frota_tipos_veiculo WHERE upper(nome) = 'CAMINHÃO CESTO AÉREO' AND ativo LIMIT 1) AS cesto,
    (SELECT id FROM frota_tipos_veiculo WHERE upper(nome) = 'RETROESCAVADEIRA' AND ativo LIMIT 1) AS retro;

INSERT INTO frota_itens_manutencao (id, nome, natureza, descricao, dias_repeticao, sistema_origem, id_externo, ativo)
SELECT gen_random_uuid(), v.nome, v.natureza, '[seed]', v.dias, 'SEED_RELATORIOS', 'ITEM-' || v.n, true
  FROM (VALUES (1, 'Troca de óleo e filtros', 'LAVAGEM_E_LUBRIFICACAO', 90),
               (2, 'Pastilhas e discos de freio', 'SUSPENSAO_FREIOS', 60),
               (3, 'Amortecedores', 'SUSPENSAO_FREIOS', 120),
               (4, 'Bateria', 'BATERIA', 180),
               (5, 'Alternador e motor de partida', 'ELETRICA', 90),
               (6, 'Radiador e mangueiras', 'ARREFECIMENTO', 90),
               (7, 'Embreagem', 'TRANSMISSAO', 180),
               (8, 'Sistema hidráulico do cesto', 'HIDRAULICA', 60),
               (9, 'Pneus', 'COMPRA_E_REFORMA_DE_PNEUS', 120),
               (10, 'Funilaria e pintura', 'CHAPARIA_E_PINTURA', NULL),
               (11, 'Revisão preventiva', 'MECANICA', NULL),
               (12, 'Ar-condicionado', 'REFRIGERACAO_E_CLIMATIZACAO', 180)) v(n, nome, natureza, dias)
 WHERE NOT EXISTS (SELECT 1 FROM frota_itens_manutencao i WHERE upper(i.nome) = upper(v.nome) AND i.ativo);

CREATE TEMP TABLE itens ON COMMIT DROP AS
SELECT id, nome, row_number() OVER (ORDER BY nome)::int AS n FROM frota_itens_manutencao WHERE ativo;

INSERT INTO frota_tipos_despesa (id, nome, codigo, ordem, ativo)
SELECT gen_random_uuid(), v.nome, 'SEED_' || v.codigo, v.ordem, true
  FROM (VALUES ('Lavagem', 'LAVAGEM', 1), ('Pedágio', 'PEDAGIO', 2), ('Estacionamento', 'ESTACIONAMENTO', 3),
               ('Licenciamento e IPVA', 'LICENCIAMENTO', 4)) v(nome, codigo, ordem)
 WHERE NOT EXISTS (SELECT 1 FROM frota_tipos_despesa t WHERE upper(t.nome) = upper(v.nome) AND t.ativo);

CREATE TEMP TABLE tdesp ON COMMIT DROP AS
SELECT
    (SELECT id FROM frota_tipos_despesa WHERE upper(nome) = 'LAVAGEM' AND ativo LIMIT 1) AS lavagem,
    (SELECT id FROM frota_tipos_despesa WHERE upper(nome) = 'PEDÁGIO' AND ativo LIMIT 1) AS pedagio,
    (SELECT id FROM frota_tipos_despesa WHERE upper(nome) = 'ESTACIONAMENTO' AND ativo LIMIT 1) AS estacionamento,
    (SELECT id FROM frota_tipos_despesa WHERE upper(nome) = 'LICENCIAMENTO E IPVA' AND ativo LIMIT 1) AS licenciamento;

INSERT INTO frota_postos (id, nome, id_base_operacional, observacao, ativo)
SELECT gen_random_uuid(), 'Posto ' || v.nome, b.id, '[seed]', true
  FROM (VALUES ('Rota Norte', 1), ('Central Diesel', 2), ('Estrela do Sertão', 3), ('BR Caatinga', 4)) v(nome, n)
  JOIN bases b ON b.n = ((v.n - 1) % (SELECT count(*) FROM bases)) + 1;

CREATE TEMP TABLE postos ON COMMIT DROP AS
SELECT p.id, p.id_base_operacional, row_number() OVER (ORDER BY p.nome)::int AS n,
       -- Preço relativo: um posto cobra 6% acima dos demais.
       CASE WHEN p.nome = 'Posto Central Diesel' THEN 1.06 ELSE 1.0 END AS fator
  FROM frota_postos p WHERE p.ativo;

-- ── Veículos ─────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE novos ON COMMIT DROP AS
SELECT n,
       'SEE' || chr(64 + ((n - 1) / 9) + 1) || lpad(n::text, 3, '0') AS placa,
       CASE WHEN n <= 9 THEN 'picape' WHEN n <= 12 THEN 'sedan' WHEN n <= 17 THEN 'munck'
            WHEN n <= 22 THEN 'cesto' ELSE 'retro' END AS cat
  FROM generate_series(1, 24) n;

INSERT INTO veiculos (id, placa, modelo, fabricante, id_base_operacional, ativo)
SELECT gen_random_uuid(), placa,
       CASE cat WHEN 'picape' THEN 'Hilux CD 2.8' WHEN 'sedan' THEN 'Virtus 1.0' WHEN 'munck' THEN 'Atego 1719 Munck'
                WHEN 'cesto' THEN 'Constellation 17.190 Cesto' ELSE 'Retro 416F2' END,
       CASE cat WHEN 'picape' THEN 'Toyota' WHEN 'sedan' THEN 'Volkswagen' WHEN 'munck' THEN 'Mercedes-Benz'
                WHEN 'cesto' THEN 'Volkswagen' ELSE 'Caterpillar' END,
       (SELECT id FROM bases WHERE bases.n = ((novos.n - 1) % (SELECT count(*) FROM bases)) + 1),
       true
  FROM novos;

INSERT INTO frota_fichas_veiculo (id, id_veiculo, placa, id_base_operacional, id_tipo_veiculo, ano_fabricacao, ano_modelo,
                                  combustivel, capacidade_tanque_litros, consumo_referencia_km_l, situacao, regime,
                                  locadora, custo_mensal_locacao, inicio_locacao, unidade_medicao, observacao, ativo)
SELECT gen_random_uuid(), v.id, v.placa, v.id_base_operacional,
       CASE nv.cat WHEN 'picape' THEN t.picape WHEN 'sedan' THEN t.sedan WHEN 'munck' THEN t.munck
                   WHEN 'cesto' THEN t.cesto ELSE t.retro END,
       2019 + (nv.n % 6), 2019 + (nv.n % 6),
       CASE nv.cat WHEN 'sedan' THEN 'FLEX' ELSE 'DIESEL_S10' END,
       CASE nv.cat WHEN 'picape' THEN 80 WHEN 'sedan' THEN 52 WHEN 'retro' THEN 125 ELSE 275 END,
       CASE nv.cat WHEN 'picape' THEN 9.5 WHEN 'sedan' THEN 12.5 WHEN 'munck' THEN 4.2 WHEN 'cesto' THEN 4.0 ELSE NULL END,
       CASE nv.n WHEN 4 THEN 'EM_MANUTENCAO' WHEN 15 THEN 'EM_MANUTENCAO' WHEN 11 THEN 'RESERVA'
                 WHEN 12 THEN 'BAIXADO' ELSE 'ATIVO' END,
       CASE WHEN nv.n IN (2, 3, 6, 7, 10, 16, 17, 20, 21) THEN 'LOCADO' ELSE 'PROPRIO' END,
       CASE WHEN nv.n IN (2, 3, 6, 7, 10, 16, 17, 20, 21) THEN 'Localiza Frotas' END,
       CASE WHEN nv.n IN (2, 3, 6, 7, 10) THEN 5200 + nv.n * 90 WHEN nv.n IN (16, 17, 20, 21) THEN 14500 + nv.n * 120 END,
       CASE WHEN nv.n IN (2, 3, 6, 7, 10, 16, 17, 20, 21) THEN DATE '2025-03-01' END,
       CASE nv.cat WHEN 'retro' THEN 'HORAS' ELSE 'KM' END,
       '[seed]', true
  FROM novos nv JOIN veiculos v ON v.placa = nv.placa CROSS JOIN tipos t;

-- Perfil de uso de cada veículo do recorte (existentes e novos).
CREATE TEMP TABLE perfil ON COMMIT DROP AS
SELECT f.id_veiculo, f.placa, f.id_base_operacional AS id_base, f.situacao, f.unidade_medicao,
       row_number() OVER (ORDER BY f.placa)::int AS n,
       CASE WHEN tv.nome ILIKE '%MUNCK%' OR tv.nome ILIKE '%CESTO%' THEN 'pesado'
            WHEN tv.nome ILIKE '%RETRO%' THEN 'equip' ELSE 'leve' END AS cat,
       coalesce(f.consumo_referencia_km_l, CASE WHEN tv.nome ILIKE '%MUNCK%' THEN 4.2 WHEN tv.nome ILIKE '%SEDAN%' THEN 12 ELSE 9.5 END) AS kml_ref,
       coalesce(f.combustivel, 'DIESEL_S10') AS combustivel,
       (f.observacao = '[seed]') AS novo
  FROM frota_fichas_veiculo f
  LEFT JOIN frota_tipos_veiculo tv ON tv.id = f.id_tipo_veiculo
 WHERE f.ativo;

ALTER TABLE perfil ADD COLUMN km_dia numeric, ADD COLUMN kml_real numeric, ADD COLUMN id_colab uuid,
                   ADD COLUMN problema boolean, ADD COLUMN ocioso boolean;
UPDATE perfil p SET
    km_dia = CASE p.cat WHEN 'pesado' THEN 95 + (p.n % 5) * 12 WHEN 'equip' THEN 0 ELSE 120 + (p.n % 7) * 15 END,
    -- Dois veículos consomem bem acima do esperado (km/l fora do padrão).
    kml_real = CASE WHEN p.n % 11 = 3 THEN p.kml_ref * 0.74 ELSE p.kml_ref * (0.93 + (p.n % 5) * 0.03) END,
    id_colab = (SELECT id FROM colab WHERE colab.n = ((p.n - 1) % (SELECT count(*) FROM colab)) + 1),
    problema = (p.n % 7 = 2),
    ocioso = (p.situacao = 'RESERVA');

-- ── Condutores e vínculos ────────────────────────────────────────────────────────────

INSERT INTO frota_condutores (id, id_colaborador, cnh_categoria, cnh_validade, cnh_primeira_habilitacao, observacao, ativo)
SELECT gen_random_uuid(), c.id,
       (ARRAY['B', 'D', 'AD', 'AE', 'AB'])[1 + (c.n % 5)],
       CASE c.n % 6 WHEN 0 THEN r.hoje - 20 WHEN 1 THEN r.hoje + 18 WHEN 2 THEN r.hoje + 27 ELSE r.hoje + 400 + c.n * 30 END,
       DATE '2008-01-01' + (c.n * 97)::int, '[seed]', true
  FROM colab c CROSS JOIN ref r
 WHERE NOT EXISTS (SELECT 1 FROM frota_condutores fc WHERE fc.id_colaborador = c.id AND fc.ativo);

-- Um vínculo aberto por colaborador: o primeiro veículo de cada um.
INSERT INTO frota_vinculos_condutor (id, id_veiculo, id_colaborador, inicio, origem, observacao, ativo)
SELECT DISTINCT ON (p.id_colab) gen_random_uuid(), p.id_veiculo, p.id_colab,
       (r.inicio - 30)::timestamp AT TIME ZONE 'America/Sao_Paulo', 'IMPORTACAO', '[seed]', true
  FROM perfil p CROSS JOIN ref r
 WHERE p.situacao <> 'BAIXADO'
   AND NOT EXISTS (SELECT 1 FROM frota_vinculos_condutor v WHERE v.id_veiculo = p.id_veiculo AND v.fim IS NULL AND v.ativo)
   AND NOT EXISTS (SELECT 1 FROM frota_vinculos_condutor v WHERE v.id_colaborador = p.id_colab AND v.fim IS NULL AND v.ativo)
 ORDER BY p.id_colab, p.n;

-- ── Leituras de odômetro (semanais) ──────────────────────────────────────────────────

CREATE TEMP TABLE leituras ON COMMIT DROP AS
WITH reais AS (
    -- Leituras que já existiam (não são do seed): a carga encaixa entre elas, sem alterá-las.
    SELECT p.id_veiculo, p.n, p.km_dia, p.ocioso, p.situacao,
           (SELECT min(l.lido_em) FROM frota_leituras_odometro l WHERE l.id_veiculo = p.id_veiculo AND l.ativo
               AND l.situacao = 'VALIDA' AND coalesce(l.motivo_situacao, '') <> '[seed]') AS t1,
           (SELECT max(l.lido_em) FROM frota_leituras_odometro l WHERE l.id_veiculo = p.id_veiculo AND l.ativo
               AND l.situacao = 'VALIDA' AND coalesce(l.motivo_situacao, '') <> '[seed]') AS t2
      FROM perfil p WHERE p.unidade_medicao = 'KM'
), marcos AS (
    SELECT r.*,
           (SELECT l.km FROM frota_leituras_odometro l WHERE l.id_veiculo = r.id_veiculo AND l.lido_em = r.t1
             AND coalesce(l.motivo_situacao, '') <> '[seed]' ORDER BY l.km LIMIT 1) AS k1,
           (SELECT l.km FROM frota_leituras_odometro l WHERE l.id_veiculo = r.id_veiculo AND l.lido_em = r.t2
             AND coalesce(l.motivo_situacao, '') <> '[seed]' ORDER BY l.km DESC LIMIT 1) AS k2
      FROM reais r
), semanas AS (
    SELECT m.id_veiculo, (s AT TIME ZONE 'America/Sao_Paulo') AS lido_em, m.t1, m.t2, m.k1, m.k2,
           coalesce(m.k1, 40000 + m.n * 3100) AS km_final,
           CASE WHEN m.ocioso AND s > now() - interval '120 days' THEN 0
                WHEN m.situacao = 'BAIXADO' AND s > now() - interval '60 days' THEN 0
                ELSE round(m.km_dia * 5.4 * (0.82 + random() * 0.36)) END AS rodado
      FROM marcos m CROSS JOIN ref r
      CROSS JOIN LATERAL generate_series((r.inicio - 7)::timestamp + interval '18 hours',
                                         (now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 day', interval '7 days') s
)
-- Antes da primeira leitura real: acumulado semanal que termina nela (ou começa em 5 mil km).
SELECT gen_random_uuid() AS id, id_veiculo, lido_em,
       (greatest(km_final - sum(rodado) OVER (PARTITION BY id_veiculo), 5000)
        + sum(rodado) OVER (PARTITION BY id_veiculo ORDER BY lido_em))::bigint AS km
  FROM semanas
 WHERE t1 IS NULL OR lido_em < t1 - interval '1 day'
UNION ALL
-- Entre a primeira e a última leitura real: interpolada, para o salto não cair num mês só.
SELECT gen_random_uuid(), id_veiculo, lido_em,
       (k1 + (k2 - k1) * extract(epoch FROM lido_em - t1) / extract(epoch FROM t2 - t1))::bigint
  FROM semanas
 WHERE t1 IS NOT NULL AND t2 > t1 + interval '14 days' AND k2 >= k1
   AND lido_em > t1 + interval '1 day' AND lido_em < t2 - interval '1 day';

INSERT INTO frota_leituras_odometro (id, id_veiculo, km, lido_em, origem, situacao, motivo_situacao, unidade, tipo,
                                     id_usuario_registro, ativo)
SELECT l.id, l.id_veiculo, greatest(l.km, 0), l.lido_em, 'IMPORTACAO', 'VALIDA', '[seed]', 'KM', 'LEITURA', r.id_usuario, true
  FROM leituras l CROSS JOIN ref r;

-- ── Abastecimentos ───────────────────────────────────────────────────────────────────

CREATE TEMP TABLE produtos ON COMMIT DROP AS
SELECT
    (SELECT id FROM frota_produtos_abastecimento WHERE nome = 'Diesel S10' LIMIT 1) AS diesel,
    (SELECT id FROM frota_produtos_abastecimento WHERE nome = 'Gasolina comum' LIMIT 1) AS gasolina,
    (SELECT id FROM frota_produtos_abastecimento WHERE nome = 'ARLA 32' LIMIT 1) AS arla;

CREATE TEMP TABLE abast ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, p.id_veiculo, p.id_base, p.id_colab, p.cat, p.combustivel, p.n,
       d + time '07:00' + (random() * interval '10 hours') AS quando,
       -- Litros pelo km do intervalo e o consumo real do veículo.
       -- 0,77: o km médio por dia corrido (as leituras usam km_dia × 5,4 por semana).
       round((p.km_dia * 0.77 * p.intervalo / p.kml_real * (0.9 + random() * 0.2))::numeric, 2) AS litros,
       (SELECT id FROM postos ps WHERE ps.n = 1 + ((p.n + extract(doy FROM d)::int) % (SELECT count(*) FROM postos))) AS id_posto
  FROM (SELECT perfil.*, CASE cat WHEN 'pesado' THEN 4 ELSE 6 END AS intervalo FROM perfil
         WHERE unidade_medicao = 'KM' AND km_dia > 0) p
  CROSS JOIN ref r
  CROSS JOIN LATERAL (SELECT (r.inicio + (p.n % 4) + i)::date AS d
                        FROM generate_series(0, r.hoje - 1 - r.inicio - (p.n % 4), p.intervalo) i) g
 WHERE NOT (p.ocioso AND d > r.hoje - 120)
   AND NOT (p.situacao = 'BAIXADO' AND d > r.hoje - 60);

INSERT INTO frota_abastecimentos (id, id_aparelho, id_veiculo, id_base_operacional, id_condutor, id_usuario_solicitante,
                                  id_posto, situacao, solicitado_em, realizado_em, medicao_realizado, observacao, origem,
                                  ativo)
SELECT a.id, gen_random_uuid(), a.id_veiculo, a.id_base, a.id_colab, r.id_usuario, a.id_posto, 'REALIZADA',
       a.quando AT TIME ZONE 'America/Sao_Paulo', (a.quando + interval '25 minutes') AT TIME ZONE 'America/Sao_Paulo',
       coalesce((SELECT l.km FROM leituras l WHERE l.id_veiculo = a.id_veiculo
                  AND l.lido_em <= a.quando AT TIME ZONE 'America/Sao_Paulo' ORDER BY l.lido_em DESC LIMIT 1), 0),
       '[seed]', 'AVULSA', true
  FROM abast a CROSS JOIN ref r;

INSERT INTO frota_abastecimento_itens (id, id_abastecimento, ordem, id_produto_pedido, quantidade_pedida, id_produto,
                                       quantidade, valor_unitario, valor_total, tanque_cheio, ativo)
SELECT gen_random_uuid(), a.id, 1, x.produto, a.litros, x.produto, a.litros, x.preco,
       round(a.litros * x.preco, 2), true, true
  FROM abast a
  JOIN postos ps ON ps.id = a.id_posto
  CROSS JOIN produtos pr
  CROSS JOIN LATERAL (SELECT CASE WHEN a.combustivel = 'FLEX' THEN pr.gasolina ELSE pr.diesel END AS produto,
                             round(((CASE WHEN a.combustivel = 'FLEX' THEN 6.09 ELSE 6.19 END)
                                    -- Preço sobe ao longo do ano e varia por posto.
                                    * (1 + extract(epoch FROM a.quando - TIMESTAMP '2025-11-01') / 31536000 * 0.05)
                                    * ps.fator)::numeric, 3) AS preco) x;

-- ARLA nos pesados, a cada quatro abastecimentos.
INSERT INTO frota_abastecimento_itens (id, id_abastecimento, ordem, id_produto_pedido, quantidade_pedida, id_produto,
                                       quantidade, valor_unitario, valor_total, tanque_cheio, ativo)
SELECT gen_random_uuid(), a.id, 2, pr.arla, 20, pr.arla, 20, 4.29, 85.80, false, true
  FROM abast a CROSS JOIN produtos pr
 WHERE a.cat = 'pesado' AND extract(doy FROM a.quando)::int % 4 = 0;

INSERT INTO frota_abastecimento_alertas (id, id_abastecimento, tipo, origem, etapa, mensagem, ativo)
SELECT gen_random_uuid(), a.id,
       CASE WHEN p.kml_real < p.kml_ref * 0.85 THEN 'CONSUMO_FORA_PADRAO' WHEN random() < 0.5 THEN 'PRECO_ACIMA_MEDIA'
            ELSE 'FREQUENCIA_ALTA' END,
       'PROGRAMATICO', 'REALIZADO', 'Alerta gerado pela carga de desenvolvimento.', true
  FROM abast a JOIN perfil p ON p.id_veiculo = a.id_veiculo
 WHERE (p.kml_real < p.kml_ref * 0.85 AND random() < 0.35) OR random() < 0.03;

-- ── Ordens de serviço ────────────────────────────────────────────────────────────────

CREATE TEMP TABLE os ON COMMIT DROP AS
WITH base AS (
    -- Preventivas a cada ~90 dias.
    SELECT p.*, 'PREVENTIVA' AS tipo, r.inicio + (p.n * 7 % 80) + k * 90 AS dia
      FROM perfil p CROSS JOIN ref r CROSS JOIN generate_series(0, 3) k
     WHERE p.situacao <> 'BAIXADO'
    UNION ALL
    -- Corretivas: mais nos pesados e nos veículos problemáticos.
    SELECT p.*, 'CORRETIVA', r.inicio + floor(random() * (r.hoje - r.inicio))::int
      FROM perfil p CROSS JOIN ref r
      CROSS JOIN generate_series(1, CASE WHEN p.problema THEN 12 WHEN p.cat = 'pesado' THEN 6 ELSE 3 END) k
)
SELECT gen_random_uuid() AS id, b.id_veiculo, b.placa, b.id_base, b.id_colab, b.cat, b.tipo, b.problema, b.unidade_medicao,
       (b.dia + time '08:00' + random() * interval '8 hours') AS aberta,
       CASE WHEN b.tipo = 'PREVENTIVA' THEN round(random() * 4 + 3) ELSE round(random() * 60 + 4) END AS horas_servico,
       random() AS sorte,
       (SELECT id FROM itens i ORDER BY i.n
         -- Veículo problemático quebra sempre nos mesmos dois itens (gera retrabalho).
         OFFSET floor(random() * CASE WHEN b.problema AND b.tipo = 'CORRETIVA' THEN 2 ELSE (SELECT count(*) FROM itens) END)::int + 0 * b.n LIMIT 1) AS id_item
  FROM base b CROSS JOIN ref r
 WHERE b.dia < r.hoje;

-- As OS dos últimos dias ficam abertas; as dos veículos em manutenção ficam paradas.
ALTER TABLE os ADD COLUMN situacao text, ADD COLUMN id_leitura uuid, ADD COLUMN km bigint;
UPDATE os SET situacao = CASE
        WHEN aberta > now() - interval '3 days' THEN 'PENDENTE'
        WHEN aberta > now() - interval '6 days' THEN 'AGENDADA'
        WHEN aberta > now() - interval '10 days' AND tipo = 'CORRETIVA' THEN 'EM_ANDAMENTO'
        WHEN sorte < 0.03 THEN 'CANCELADA'
        ELSE 'CONCLUIDA' END;
UPDATE os o SET id_leitura = x.id_leitura, km = x.km
  FROM (SELECT o2.id, l.id AS id_leitura, l.km
          FROM os o2
          CROSS JOIN LATERAL (SELECT id, km FROM leituras l WHERE l.id_veiculo = o2.id_veiculo
                                AND l.lido_em <= o2.aberta AT TIME ZONE 'America/Sao_Paulo'
                              ORDER BY l.lido_em DESC LIMIT 1) l) x
 WHERE x.id = o.id;

INSERT INTO frota_ordens_servico (
    id, id_veiculo, placa, id_base_operacional, tipo_manutencao, origem, criticidade, motivo, descricao, id_condutor,
    aberta_em, id_usuario_abertura, km_abertura, situacao, tipo_oficina, oficina_nome, agendada_para, inicio_real,
    previsao_termino, fim_real, veiculo_parado, parado_desde, liberado_em, descricao_servico, valor_total, causa,
    km_encerramento, id_leitura_encerramento, cancelada_em, motivo_cancelamento, sistema_origem, id_externo,
    unidade_medicao, veicular, desconto, acrescimo, ativo)
SELECT o.id, o.id_veiculo, o.placa, o.id_base,
       o.tipo,
       CASE WHEN o.tipo = 'PREVENTIVA' THEN 'PREVENTIVA'
            ELSE (ARRAY['VERBAL', 'CHECKLIST', 'INSPECAO', 'MANUAL'])[1 + floor(o.sorte * 4)::int] END,
       CASE WHEN o.tipo = 'PREVENTIVA' THEN 'BAIXA'
            ELSE (ARRAY['URGENTE', 'ALTA', 'MEDIA', 'MEDIA', 'BAIXA'])[1 + floor(o.sorte * 5)::int] END,
       CASE WHEN o.tipo = 'CORRETIVA' THEN 'PROBLEMA_MECANICO' END,
       CASE WHEN o.tipo = 'PREVENTIVA' THEN 'Revisão preventiva programada' ELSE 'Corretiva: ' || i.nome END,
       o.id_colab,
       o.aberta AT TIME ZONE 'America/Sao_Paulo', r.id_usuario,
       CASE WHEN o.unidade_medicao = 'KM' THEN o.km END,
       o.situacao,
       CASE WHEN o.sorte < 0.3 THEN 'INTERNA' ELSE 'EXTERNA' END,
       CASE WHEN o.sorte >= 0.3 THEN (ARRAY['Diesel Norte', 'Auto Center Juazeiro', 'Mecânica São Jorge', 'Elétrica Bonfim',
                                            'Hidráulica Sertão'])[1 + floor(((o.sorte - 0.3) / 0.7) * 5)::int] END,
       CASE WHEN o.situacao <> 'PENDENTE' THEN (o.aberta + interval '1 day') AT TIME ZONE 'America/Sao_Paulo' END,
       CASE WHEN o.situacao IN ('EM_ANDAMENTO', 'CONCLUIDA') THEN (o.aberta + interval '1 day') AT TIME ZONE 'America/Sao_Paulo' END,
       CASE WHEN o.situacao = 'EM_ANDAMENTO' THEN (o.aberta + interval '4 days') AT TIME ZONE 'America/Sao_Paulo' END,
       CASE WHEN o.situacao = 'CONCLUIDA' THEN (o.aberta + interval '1 day' + o.horas_servico * interval '1 hour') AT TIME ZONE 'America/Sao_Paulo' END,
       -- Corretiva urgente/alta para o veículo; nos veículos em manutenção a OS aberta também.
       (o.tipo = 'CORRETIVA' AND o.situacao <> 'CANCELADA' AND (o.sorte < 0.45 OR o.situacao = 'EM_ANDAMENTO')),
       CASE WHEN o.tipo = 'CORRETIVA' AND o.situacao <> 'CANCELADA' AND (o.sorte < 0.45 OR o.situacao = 'EM_ANDAMENTO')
            THEN o.aberta AT TIME ZONE 'America/Sao_Paulo' END,
       CASE WHEN o.tipo = 'CORRETIVA' AND o.situacao = 'CONCLUIDA' AND o.sorte < 0.45
            THEN (o.aberta + interval '1 day' + o.horas_servico * interval '1 hour') AT TIME ZONE 'America/Sao_Paulo' END,
       CASE WHEN o.situacao = 'CONCLUIDA' THEN CASE WHEN o.tipo = 'PREVENTIVA' THEN 'Revisão conforme plano.' ELSE 'Reparo de ' || lower(i.nome) || '.' END END,
       CASE WHEN o.situacao = 'CONCLUIDA' THEN round((CASE WHEN o.tipo = 'PREVENTIVA' THEN 520 + random() * 900
                                                           ELSE 280 + random() * 4200 END
                                                      * CASE o.cat WHEN 'pesado' THEN 2.4 WHEN 'equip' THEN 2.0 ELSE 1 END)::numeric, 2) END,
       CASE WHEN o.situacao = 'CONCLUIDA' THEN CASE WHEN o.tipo = 'PREVENTIVA' THEN 'SERVICO_PREVENTIVO'
            ELSE (ARRAY['AVARIA', 'DESGASTE_NATURAL', 'DESGASTE_NATURAL', 'USO_INDEVIDO', 'SERVICO_CORRETIVO'])[1 + floor(o.sorte * 5)::int] END END,
       CASE WHEN o.situacao = 'CONCLUIDA' AND o.unidade_medicao = 'KM' THEN o.km END,
       coalesce(o.id_leitura, gen_random_uuid()),
       CASE WHEN o.situacao = 'CANCELADA' THEN (o.aberta + interval '2 hours') AT TIME ZONE 'America/Sao_Paulo' END,
       CASE WHEN o.situacao = 'CANCELADA' THEN 'Aberta em duplicidade.' END,
       'SEED_RELATORIOS', 'OS-' || o.id,
       o.unidade_medicao, true, 0, 0, true
  FROM os o JOIN itens i ON i.id = o.id_item CROSS JOIN ref r;

-- Veículos em manutenção: uma corretiva aberta com o veículo parado há dias.
INSERT INTO frota_ordens_servico (
    id, id_veiculo, placa, id_base_operacional, tipo_manutencao, origem, criticidade, descricao, aberta_em, situacao,
    tipo_oficina, oficina_nome, agendada_para, inicio_real, previsao_termino, veiculo_parado, parado_desde,
    id_leitura_encerramento, sistema_origem, id_externo, unidade_medicao, veicular, desconto, acrescimo, ativo)
SELECT gen_random_uuid(), p.id_veiculo, p.placa, p.id_base, 'CORRETIVA', 'CHECKLIST', 'URGENTE',
       CASE WHEN p.cat = 'pesado' THEN 'Vazamento no sistema hidráulico' ELSE 'Motor falhando em subida' END,
       now() - (8 + p.n % 20) * interval '1 day', 'EM_ANDAMENTO', 'EXTERNA', 'Diesel Norte',
       now() - (7 + p.n % 20) * interval '1 day', now() - (7 + p.n % 20) * interval '1 day', now() - interval '2 days',
       true, now() - (8 + p.n % 20) * interval '1 day', gen_random_uuid(), 'SEED_RELATORIOS', 'OS-PARADO-' || p.n,
       p.unidade_medicao, true, 0, 0, true
  FROM perfil p WHERE p.situacao = 'EM_MANUTENCAO';

INSERT INTO frota_os_itens (id, id_ordem_servico, id_item_manutencao, ativo)
SELECT gen_random_uuid(), o.id, o.id_item, true FROM os o;

-- Repetição do mesmo item no mesmo veículo (base do retrabalho).
UPDATE frota_os_itens it SET id_os_anterior = x.anterior, numero_os_anterior = x.numero_anterior,
                             dias_desde_anterior = x.dias
  FROM (SELECT i.id,
               lag(o.id) OVER w AS anterior, lag(o.numero) OVER w AS numero_anterior,
               (o.aberta_em::date - lag(o.aberta_em) OVER w ::date) AS dias
          FROM frota_os_itens i JOIN frota_ordens_servico o ON o.id = i.id_ordem_servico
         WHERE o.sistema_origem = 'SEED_RELATORIOS' AND o.tipo_manutencao = 'CORRETIVA' AND o.situacao <> 'CANCELADA'
        WINDOW w AS (PARTITION BY o.id_veiculo, i.id_item_manutencao ORDER BY o.aberta_em)) x
 WHERE x.id = it.id AND x.anterior IS NOT NULL;

-- ── Despesas ─────────────────────────────────────────────────────────────────────────

INSERT INTO frota_despesas (id, id_veiculo, data, id_tipo, descricao, valor, id_base_operacional, fornecedor_nome,
                            forma_pagamento, id_solicitacao_financeira, numero_solicitacao_financeira,
                            situacao_pagamento, origem, sistema_origem, id_externo, ativo)
SELECT gen_random_uuid(), d.id_veiculo, d.data, d.tipo, d.descricao, d.valor, d.id_base, d.fornecedor,
       CASE WHEN d.a_pagar THEN 'A_PAGAR' ELSE 'JA_PAGO' END,
       CASE WHEN d.a_pagar THEN gen_random_uuid() END, CASE WHEN d.a_pagar THEN 900000 + d.k END,
       CASE WHEN d.a_pagar THEN 'SOLICITADO' END,
       'IMPORTACAO', 'SEED_RELATORIOS', 'DESP-' || gen_random_uuid(), true
  FROM (
    SELECT p.id_veiculo, p.id_base, (m::date + (p.n % 25)) AS data, td.lavagem AS tipo, 'Lavagem completa' AS descricao,
           round((CASE p.cat WHEN 'pesado' THEN 160 ELSE 70 END + random() * 40)::numeric, 2) AS valor,
           'Lava Jato Sertão' AS fornecedor, false AS a_pagar, row_number() OVER () AS k
      FROM perfil p CROSS JOIN tdesp td CROSS JOIN ref r
      CROSS JOIN generate_series(r.inicio, r.hoje - 26, interval '1 month') m
     WHERE p.situacao <> 'BAIXADO'
    UNION ALL
    SELECT p.id_veiculo, p.id_base, (m::date + (k2 * 7 + p.n % 5)), td.pedagio, 'Pedágio BR-407',
           round((12 + random() * 28)::numeric, 2), 'Via Bahia', false, 0
      FROM perfil p CROSS JOIN tdesp td CROSS JOIN ref r
      CROSS JOIN generate_series(r.inicio, r.hoje - 30, interval '1 month') m CROSS JOIN generate_series(0, 3) k2
     WHERE p.cat = 'pesado' AND p.situacao <> 'BAIXADO'
    UNION ALL
    SELECT p.id_veiculo, p.id_base, (r.inicio + floor(random() * (r.hoje - r.inicio))::int), td.estacionamento,
           'Estacionamento em atendimento', round((8 + random() * 30)::numeric, 2), 'Estapar', random() < 0.2, 0
      FROM perfil p CROSS JOIN tdesp td CROSS JOIN ref r CROSS JOIN generate_series(1, 6) k3
     WHERE p.cat = 'leve'
    UNION ALL
    SELECT p.id_veiculo, p.id_base, DATE '2026-02-10' + (p.n % 20), td.licenciamento, 'IPVA e licenciamento 2026',
           round((CASE p.cat WHEN 'pesado' THEN 3400 WHEN 'leve' THEN 1900 ELSE 900 END + random() * 600)::numeric, 2),
           'SEFAZ-BA', p.n % 9 = 0, 0
      FROM perfil p CROSS JOIN tdesp td
     WHERE p.situacao <> 'BAIXADO'
  ) d;

-- ── Seguros ──────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE seg ON COMMIT DROP AS
SELECT (SELECT id FROM financeiro_fornecedor ORDER BY id LIMIT 1) AS seguradora,
       gen_random_uuid() AS leve, gen_random_uuid() AS pesado_antiga, gen_random_uuid() AS pesado;

INSERT INTO frota_seguradoras (id, id_fornecedor, papel, observacao, usuario_criacao)
SELECT gen_random_uuid(), s.seguradora, 'SEGURADORA', '[seed]', 'seed'
  FROM seg s
 WHERE NOT EXISTS (SELECT 1 FROM frota_seguradoras x WHERE x.id_fornecedor = s.seguradora AND x.papel = 'SEGURADORA' AND x.ativo);

INSERT INTO frota_apolices (id, numero, id_seguradora, segurado, vigencia_inicio, vigencia_fim, valor, franquia, observacao, ativo)
SELECT s.leve, 'SEED-LEVE-2025', s.seguradora, 'EMPRESA', DATE '2025-12-01', DATE '2026-11-30', 86400, 3800, '[seed]', true FROM seg s
UNION ALL
SELECT s.pesado_antiga, 'SEED-PES-2024', s.seguradora, 'EMPRESA', DATE '2025-08-15', DATE '2026-08-14', 198000, 9500, '[seed]', true FROM seg s
UNION ALL
SELECT s.pesado, 'SEED-PES-2026', s.seguradora, 'EMPRESA', DATE '2026-08-15', DATE '2027-08-14', 214000, 9500, '[seed]', true FROM seg s;

-- Três veículos ficam sem seguro (o relatório aponta).
INSERT INTO frota_apolice_veiculos (id, id_apolice, id_veiculo, inicio, ativo)
SELECT gen_random_uuid(), CASE WHEN p.cat = 'leve' THEN s.leve ELSE a.id END, p.id_veiculo,
       CASE WHEN p.cat = 'leve' THEN DATE '2025-12-01' WHEN a.id = s.pesado THEN DATE '2026-08-15' ELSE DATE '2025-08-15' END,
       true
  FROM perfil p CROSS JOIN seg s
  LEFT JOIN LATERAL (SELECT unnest(ARRAY[s.pesado_antiga, s.pesado]) AS id) a ON p.cat <> 'leve'
 WHERE p.situacao <> 'BAIXADO' AND p.n % 10 <> 4;

INSERT INTO frota_apolice_parcelas (id, id_apolice, numero, vencimento, valor, id_solicitacao_financeira,
                                    numero_solicitacao_financeira, situacao_pagamento, ativo)
SELECT gen_random_uuid(), a.id, k, a.vigencia_inicio + ((k - 1) * interval '1 month')::interval, round(a.valor / 10, 2),
       CASE WHEN a.vigencia_inicio + ((k - 1) * interval '1 month') < now() + interval '20 days' THEN gen_random_uuid() END,
       CASE WHEN a.vigencia_inicio + ((k - 1) * interval '1 month') < now() + interval '20 days' THEN 800000 + k END,
       CASE WHEN a.vigencia_inicio + ((k - 1) * interval '1 month') < now() - interval '10 days' THEN 'APROVADO'
            WHEN a.vigencia_inicio + ((k - 1) * interval '1 month') < now() + interval '20 days' THEN 'SOLICITADO' END,
       true
  FROM frota_apolices a CROSS JOIN generate_series(1, 10) k
 WHERE a.observacao = '[seed]';

-- ── Sinistros ────────────────────────────────────────────────────────────────────────

INSERT INTO frota_sinistros (id, id_veiculo, placa, id_base_operacional, ocorrido_em, local, tipo, id_condutor,
                             culpa_condutor, descricao, id_apolice, numero_sinistro_seguradora, seguradora_acionada_em,
                             franquia_paga, situacao, finalizado_em, ativo)
SELECT gen_random_uuid(), p.id_veiculo, p.placa, p.id_base, x.quando, 'BR-407, km ' || (100 + x.k * 13), x.tipo, p.id_colab,
       x.culpa, '[seed] ' || x.texto,
       CASE WHEN x.franquia IS NOT NULL THEN (SELECT av.id_apolice FROM frota_apolice_veiculos av
                                                JOIN frota_apolices a ON a.id = av.id_apolice
                                               WHERE av.id_veiculo = p.id_veiculo AND a.vigencia_inicio <= x.quando::date
                                                 AND a.vigencia_fim >= x.quando::date LIMIT 1) END,
       CASE WHEN x.franquia IS NOT NULL THEN 'SIN-' || x.k END,
       CASE WHEN x.franquia IS NOT NULL THEN x.quando + interval '1 day' END,
       x.franquia, x.situacao, CASE WHEN x.situacao = 'FINALIZADO' THEN x.quando + interval '20 days' END, true
  FROM (VALUES (1, now() - interval '320 days', 'COLISAO_SEM_VITIMA', true, 3800::numeric, 'FINALIZADO', 'Colisão traseira em manobra.'),
               (2, now() - interval '260 days', 'SEM_TERCEIROS', true, NULL, 'FINALIZADO', 'Batida em poste no pátio.'),
               (3, now() - interval '200 days', 'COLISAO_SEM_VITIMA', false, 3800, 'FINALIZADO', 'Terceiro avançou o sinal.'),
               (4, now() - interval '150 days', 'CARGA_AVARIADA', false, NULL, 'FINALIZADO', 'Bobina danificada no transporte.'),
               (5, now() - interval '110 days', 'INTRAFROTA', true, NULL, 'FINALIZADO', 'Manobra entre viaturas na base.'),
               (6, now() - interval '70 days', 'COLISAO_SEM_VITIMA', true, 9500, 'FINALIZADO', 'Saída de pista em estrada de terra.'),
               (7, now() - interval '40 days', 'FURTO', false, NULL, 'FINALIZADO', 'Furto de ferramentas da carroceria.'),
               (8, now() - interval '18 days', 'SEM_TERCEIROS', true, NULL, 'EM_OFICINA', 'Retrovisor quebrado em rua estreita.'),
               (9, now() - interval '6 days', 'COLISAO_SEM_VITIMA', false, NULL, 'RASCUNHO', 'Pequena colisão no estacionamento.')
       ) x(k, quando, tipo, culpa, franquia, situacao, texto)
  JOIN perfil p ON p.n = 1 + (x.k * 5) % (SELECT count(*) FROM perfil)
 WHERE p.situacao <> 'BAIXADO';

-- ── Documentos ───────────────────────────────────────────────────────────────────────

INSERT INTO frota_documentos (id, id_veiculo, tipo, descricao, numero, data_emissao, data_vencimento, observacao, ativo)
SELECT gen_random_uuid(), p.id_veiculo, 'CRLV', 'CRLV-e 2026', 'CRLV-' || p.n, DATE '2026-01-15',
       CASE p.n % 9 WHEN 0 THEN r.hoje - 12 WHEN 4 THEN r.hoje + 9 WHEN 6 THEN r.hoje + 23 ELSE DATE '2027-01-31' END,
       '[seed]', true
  FROM perfil p CROSS JOIN ref r WHERE p.situacao <> 'BAIXADO'
UNION ALL
SELECT gen_random_uuid(), p.id_veiculo, 'TACOGRAFO', 'Aferição do tacógrafo', 'TAC-' || p.n, DATE '2024-11-01',
       CASE p.n % 4 WHEN 1 THEN r.hoje - 35 WHEN 2 THEN r.hoje + 15 ELSE DATE '2027-03-01' END, '[seed]', true
  FROM perfil p CROSS JOIN ref r WHERE p.cat = 'pesado' AND p.situacao <> 'BAIXADO'
UNION ALL
SELECT gen_random_uuid(), p.id_veiculo, 'LAUDO_IMPLEMENTO', 'Laudo do cesto/munck (NR-12)', 'LAU-' || p.n, DATE '2025-12-01',
       CASE p.n % 5 WHEN 3 THEN r.hoje - 4 ELSE DATE '2026-12-01' END, '[seed]', true
  FROM perfil p CROSS JOIN ref r WHERE p.cat = 'pesado' AND p.situacao <> 'BAIXADO';

-- ── Checklists (dias úteis) ──────────────────────────────────────────────────────────

INSERT INTO frota_checklists (id, id_aparelho, id_veiculo, placa, id_base_operacional, id_modelo, modelo_nome, id_condutor,
                              id_usuario_preenchimento, preenchido_em, recebido_em, medicao, unidade_medicao,
                              passagem_veiculo, assinado, comentario, finalidade, ativo)
SELECT gen_random_uuid(), gen_random_uuid(), p.id_veiculo, p.placa, p.id_base, r.id_modelo, r.modelo_nome, p.id_colab,
       r.id_usuario, (d + time '06:50' + random() * interval '50 minutes') AT TIME ZONE 'America/Sao_Paulo',
       (d + time '07:45') AT TIME ZONE 'America/Sao_Paulo', NULL, p.unidade_medicao, false, true, '[seed]', 'USO', true
  FROM perfil p CROSS JOIN ref r
  CROSS JOIN LATERAL (SELECT gs::date AS d FROM generate_series(r.inicio::timestamp, (r.hoje - 1)::timestamp, interval '1 day') gs) dd
 WHERE p.situacao IN ('ATIVO', 'EM_MANUTENCAO')
   AND extract(isodow FROM d) <= 5
   -- Cobertura varia por veículo: de 55% a 98%.
   AND random() < 0.55 + (p.n % 10) * 0.048;

-- ── Telemetria ───────────────────────────────────────────────────────────────────────

INSERT INTO frota_telemetria_rastreadores (id, provedor, id_externo, placa_provedor, nome_provedor, id_veiculo, situacao,
                                           vinculo_manual, ativo)
SELECT gen_random_uuid(), 'UBICALY', 'seed-' || p.placa, p.placa, p.placa, p.id_veiculo, 'VINCULADO', true, true
  FROM perfil p WHERE p.situacao <> 'BAIXADO' AND p.unidade_medicao = 'KM'
   AND NOT EXISTS (SELECT 1 FROM frota_telemetria_rastreadores t WHERE t.id_veiculo = p.id_veiculo AND t.ativo);

INSERT INTO frota_telemetria_dias (id_veiculo, dia, id_rastreador, km, minutos_movimento, minutos_ligado_parado,
                                   km_fora_expediente, minutos_fora_expediente, pontos, calculado_em)
SELECT p.id_veiculo, d::date, t.id,
       round((CASE WHEN extract(isodow FROM d) <= 5 THEN p.km_dia * (0.8 + random() * 0.4) ELSE p.km_dia * 0.08 END)::numeric, 1),
       (CASE WHEN extract(isodow FROM d) <= 5 THEN 180 + random() * 120 ELSE 10 END)::int,
       (CASE WHEN extract(isodow FROM d) <= 5 THEN (CASE WHEN p.n % 6 = 1 THEN 110 ELSE 25 END) + random() * 40 ELSE 0 END)::int,
       round((CASE WHEN p.n % 8 = 5 AND extract(isodow FROM d) >= 6 THEN 15 + random() * 35 ELSE 0 END)::numeric, 1),
       (CASE WHEN p.n % 8 = 5 AND extract(isodow FROM d) >= 6 THEN 40 + random() * 60 ELSE 0 END)::int,
       0, now()
  FROM perfil p
  JOIN frota_telemetria_rastreadores t ON t.id_veiculo = p.id_veiculo AND t.id_externo LIKE 'seed-%'
  CROSS JOIN ref r
  CROSS JOIN LATERAL (SELECT gs::date AS d FROM generate_series(r.inicio::timestamp, (r.hoje - 1)::timestamp, interval '1 day') gs) dd
 WHERE NOT (p.ocioso AND d > r.hoje - 120);

INSERT INTO frota_telemetria_eventos (id, provedor, id_externo, id_rastreador, id_veiculo, placa, tipo, ocorrido_em,
                                      velocidade_kmh, limite_kmh, descricao, id_colaborador, origem_condutor)
SELECT gen_random_uuid(), 'UBICALY', 'seed-' || gen_random_uuid(), t.id, p.id_veiculo, p.placa,
       (ARRAY['EXCESSO_VELOCIDADE', 'EXCESSO_VELOCIDADE', 'FRENAGEM_BRUSCA', 'ACELERACAO_BRUSCA', 'CURVA_BRUSCA'])[1 + floor(random() * 5)::int],
       (r.inicio + floor(random() * (r.hoje - r.inicio))::int + time '07:00' + random() * interval '10 hours') AT TIME ZONE 'America/Sao_Paulo',
       round((85 + random() * 30)::numeric, 1), 80, 'Evento da carga de desenvolvimento', p.id_colab, 'VINCULO'
  FROM perfil p
  JOIN frota_telemetria_rastreadores t ON t.id_veiculo = p.id_veiculo AND t.id_externo LIKE 'seed-%'
  CROSS JOIN ref r
  CROSS JOIN LATERAL generate_series(1, CASE WHEN p.n % 5 = 0 THEN 70 WHEN p.problema THEN 40 ELSE 12 END) k;

-- ── Execução: equipes, turnos e notas ────────────────────────────────────────────────

INSERT INTO tipos_equipe (id, nome, ativo) VALUES (gen_random_uuid(), 'SEED EQUIPE FROTA', true);

INSERT INTO equipes (id, cod_equipe, id_tipo_equipe, id_veiculo_vinculado, id_base_operacional, id_processo,
                     meta_faturamento_mensal, ativo)
SELECT gen_random_uuid(), 'SEED-' || p.placa, (SELECT id FROM tipos_equipe WHERE nome = 'SEED EQUIPE FROTA'),
       p.id_veiculo, p.id_base,
       (SELECT id FROM processos_negocio pn WHERE pn.ativo AND pn.nome = CASE
            WHEN p.cat = 'pesado' AND p.n % 2 = 0 THEN 'LINHA VIVA' WHEN p.cat = 'pesado' THEN 'OBRAS'
            WHEN p.n % 3 = 0 THEN 'COMERCIAL' ELSE 'MANUTENCAO' END LIMIT 1),
       60000, true
  FROM perfil p
 WHERE p.situacao IN ('ATIVO', 'EM_MANUTENCAO') AND p.cat <> 'equip'
   AND NOT EXISTS (SELECT 1 FROM equipes e WHERE e.id_veiculo_vinculado = p.id_veiculo AND e.ativo);

CREATE TEMP TABLE turnos_seed ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, e.id AS id_equipe, e.id_veiculo_vinculado AS id_veiculo,
       (d + time '07:30') AT TIME ZONE 'America/Sao_Paulo' AS inicio,
       (d + time '17:10') AT TIME ZONE 'America/Sao_Paulo' AS fim,
       p.cat, p.n
  FROM equipes e
  JOIN perfil p ON p.id_veiculo = e.id_veiculo_vinculado
  CROSS JOIN ref r
  CROSS JOIN LATERAL (SELECT gs::date AS d FROM generate_series(r.inicio::timestamp, (r.hoje - 1)::timestamp, interval '1 day') gs) dd
 WHERE e.cod_equipe LIKE 'SEED-%' AND extract(isodow FROM d) <= 5 AND random() < 0.88;

INSERT INTO turnos (id, id_equipe, id_usuario_abertura, data_inicio, data_fim, status, ativo, id_veiculo,
                    encerrado_automaticamente, motivo_encerramento)
SELECT t.id, t.id_equipe, r.id_usuario, t.inicio, t.fim, 'FECHADO', true, t.id_veiculo, false, '[seed]'
  FROM turnos_seed t CROSS JOIN ref r;

INSERT INTO execucoes_comercial (id, id_equipe, data_lancamento, status_execucao, valor_total_faturado, data_criacao, ativo,
                                 id_turno, tipo_nota, referencia_provisoria, total_alteracoes)
SELECT gen_random_uuid(), t.id_equipe, t.inicio + (k * interval '75 minutes') + random() * interval '40 minutes',
       CASE WHEN random() < 0.93 THEN 'CONCLUIDO' ELSE 'INICIADO' END,
       round((CASE WHEN t.cat = 'pesado' THEN 900 + random() * 2600 ELSE 180 + random() * 900 END)::numeric, 2),
       t.inicio, true, t.id, 'COMUM', 'SEED-' || substr(t.id::text, 1, 24) || '-' || k, 0
  FROM turnos_seed t
  CROSS JOIN LATERAL generate_series(1, CASE WHEN t.cat = 'pesado' THEN 3 ELSE 5 END + (t.n % 3)) k;

-- ── SST: eventos com veículo ─────────────────────────────────────────────────────────

INSERT INTO eventos_sst (id, numero_registro, tipo, status, data_ocorrencia, data_comunicacao, id_atividade, atividade_nome,
                         id_gestor, gestor_nome, id_base_operacional, base_nome, id_veiculo, veiculo_placa,
                         id_classificacao, telemetria, filmagem, descricao, dias_perdidos, possui_cat, ativo)
SELECT gen_random_uuid(), 'SEED-' || x.k, x.tipo, 'CONCLUIDO', x.quando, x.quando + interval '3 hours',
       (SELECT id FROM atividades_sst ORDER BY nome LIMIT 1), (SELECT nome FROM atividades_sst ORDER BY nome LIMIT 1),
       -- gestor_nome é cifrado pela aplicação: copia o primeiro nome já cifrado do colaborador.
       p.id_colab, (SELECT c.primeiro_nome FROM colaboradores c WHERE c.id = p.id_colab), p.id_base, (SELECT nome FROM bases WHERE bases.id = p.id_base),
       p.id_veiculo, p.placa,
       (SELECT id FROM catalogos_sst WHERE tipo = 'CLASSIFICACAO_EVENTO' ORDER BY nome LIMIT 1),
       'NAO_APLICAVEL', 'NAO_APLICAVEL', '[seed] ' || x.texto, x.dias, x.dias > 0, true
  FROM (VALUES (1, now() - interval '300 days', 'DANO_MATERIAL', 0, 'Dano no para-choque durante manobra.'),
               (2, now() - interval '190 days', 'ACIDENTE_TIPICO', 3, 'Torção ao descer da carroceria.'),
               (3, now() - interval '95 days', 'INCIDENTE_SEM_LESAO', 0, 'Quase colisão em cruzamento.'),
               (4, now() - interval '30 days', 'DANO_MATERIAL', 0, 'Cesto tocou galho durante deslocamento.')
       ) x(k, quando, tipo, dias, texto)
  JOIN perfil p ON p.n = 1 + (x.k * 7) % (SELECT count(*) FROM perfil);

COMMIT;

\echo 'Seed dos relatórios gerenciais da frota criado.'
SELECT 'veículos' AS item, count(*) FROM frota_fichas_veiculo WHERE ativo
UNION ALL SELECT 'OS', count(*) FROM frota_ordens_servico WHERE sistema_origem = 'SEED_RELATORIOS'
UNION ALL SELECT 'abastecimentos', count(*) FROM frota_abastecimentos WHERE observacao = '[seed]'
UNION ALL SELECT 'despesas', count(*) FROM frota_despesas WHERE sistema_origem = 'SEED_RELATORIOS'
UNION ALL SELECT 'leituras', count(*) FROM frota_leituras_odometro WHERE motivo_situacao = '[seed]'
UNION ALL SELECT 'checklists', count(*) FROM frota_checklists WHERE comentario = '[seed]'
UNION ALL SELECT 'turnos', count(*) FROM turnos WHERE motivo_encerramento = '[seed]'
UNION ALL SELECT 'notas', count(*) FROM execucoes_comercial WHERE referencia_provisoria LIKE 'SEED-%';
