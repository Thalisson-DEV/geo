-- A Bússola consulta o estoque operacional pelas views da camada semântica. As peças e os
-- almoxarifados da oficina da frota (tipo e catálogo FROTA, V218) ficam fora delas, para os saldos
-- e movimentações da frota não entrarem nas respostas sobre o almoxarifado.
-- Mesmas colunas de antes; só o filtro é novo. Rollback: reaplicar as definições sem o filtro.

CREATE OR REPLACE VIEW copiloto.materiais AS
SELECT m.id AS material_id,
    m.cod_material AS material_codigo,
    m.descricao AS material,
    m.unidade_medida,
    m.detalha_serie AS controla_numero_serie,
    pn.nome AS processo,
    av.nome AS avaliacao_tecnica,
    ci.codigo AS centro_investimento,
    m.ativo,
    m.data_criacao AS criado_em
   FROM public.materiais m
     LEFT JOIN public.processos_negocio pn ON pn.id = m.id_processo
     LEFT JOIN public.avaliacoes_material av ON av.id = m.id_avaliacao_tecnica
     LEFT JOIN public.centros_investimento ci ON ci.id = m.id_centro_investimento
  WHERE m.catalogo = 'OPERACIONAL';

CREATE OR REPLACE VIEW copiloto.estoques AS
SELECT e.id AS estoque_id,
    e.nome_identificador AS estoque,
    te.nome AS tipo_estoque,
    COALESCE(b.id, beq.id) AS base_operacional_id,
    COALESCE(b.nome, beq.nome) AS base_operacional,
    eq.id AS equipe_id,
    eq.cod_equipe AS equipe,
    o.id AS obra_id,
    o.numero AS obra_numero,
    e.ativo
   FROM public.estoques e
     LEFT JOIN public.tipos_estoque te ON te.id = e.id_tipo_estoque
     LEFT JOIN public.bases_operacionais b ON b.id = e.id_base_operacional
     LEFT JOIN public.equipes eq ON eq.id = e.id_equipe
     LEFT JOIN public.bases_operacionais beq ON beq.id = eq.id_base_operacional
     LEFT JOIN public.obras o ON o.id = e.id_obra
  WHERE COALESCE(te.nome, '') <> 'FROTA';

CREATE OR REPLACE VIEW copiloto.saldos AS
SELECT s.id AS saldo_id,
    s.id_estoque AS estoque_id,
    e.nome_identificador AS estoque,
    te.nome AS tipo_estoque,
    COALESCE(b.nome, beq.nome) AS base_operacional,
    eq.cod_equipe AS equipe,
    s.id_material AS material_id,
    m.cod_material AS material_codigo,
    m.descricao AS material,
    m.unidade_medida,
    s.condicao,
    s.quantidade,
    COALESCE(s.data_ultima_alteracao, s.data_criacao) AS atualizado_em
   FROM public.saldos s
     JOIN public.estoques e ON e.id = s.id_estoque
     JOIN public.materiais m ON m.id = s.id_material
     LEFT JOIN public.tipos_estoque te ON te.id = e.id_tipo_estoque
     LEFT JOIN public.bases_operacionais b ON b.id = e.id_base_operacional
     LEFT JOIN public.equipes eq ON eq.id = e.id_equipe
     LEFT JOIN public.bases_operacionais beq ON beq.id = eq.id_base_operacional
  WHERE s.ativo = true
    AND m.catalogo = 'OPERACIONAL';

CREATE OR REPLACE VIEW copiloto.movimentacoes AS
SELECT mv.id AS movimentacao_id,
    mv.data_hora,
    (mv.data_hora AT TIME ZONE 'America/Sao_Paulo'::text)::date AS data,
    date_trunc('month'::text, (mv.data_hora AT TIME ZONE 'America/Sao_Paulo'::text))::date AS mes,
    mv.tipo_movimentacao,
    mv.id_material AS material_id,
    m.cod_material AS material_codigo,
    m.descricao AS material,
    m.unidade_medida,
    mv.quantidade,
    mv.condicao,
    mv.num_serie AS numero_serie,
    mv.id_estoque_origem AS estoque_origem_id,
    eo.nome_identificador AS estoque_origem,
    COALESCE(bo.nome, beo.nome) AS base_origem,
    mv.id_estoque_destino AS estoque_destino_id,
    ed.nome_identificador AS estoque_destino,
    COALESCE(bd.nome, bed.nome) AS base_destino,
    mv.id_obra AS obra_id,
    o.numero AS obra_numero,
    mv.id_equipe AS equipe_id,
    eq.cod_equipe AS equipe,
    mv.id_solicitacao AS solicitacao_id,
    mv.id_reserva AS reserva_id,
        CASE mv.tipo_tecnico
            WHEN '221'::text THEN 'ADICAO_COMUM'::text
            WHEN '921'::text THEN 'ADICAO_CONCRETO'::text
            WHEN '222'::text THEN 'DEVOLUCAO_COMUM'::text
            WHEN '922'::text THEN 'DEVOLUCAO_CONCRETO'::text
            ELSE NULL::text
        END AS tipo_tecnico,
    mv.tipo_obra_snapshot AS tipo_obra,
    mv.codigo_ocorrencia_snapshot AS ocorrencia,
    mv.id_referencia_operacao AS operacao_id,
    mv.id_usuario_operador AS operador_usuario_id,
    initcap(cop.nome_busca) AS operador
   FROM public.movimentacoes_estoque mv
     JOIN public.materiais m ON m.id = mv.id_material
     LEFT JOIN public.estoques eo ON eo.id = mv.id_estoque_origem
     LEFT JOIN public.bases_operacionais bo ON bo.id = eo.id_base_operacional
     LEFT JOIN public.equipes eqo ON eqo.id = eo.id_equipe
     LEFT JOIN public.bases_operacionais beo ON beo.id = eqo.id_base_operacional
     LEFT JOIN public.estoques ed ON ed.id = mv.id_estoque_destino
     LEFT JOIN public.bases_operacionais bd ON bd.id = ed.id_base_operacional
     LEFT JOIN public.equipes eqd ON eqd.id = ed.id_equipe
     LEFT JOIN public.bases_operacionais bed ON bed.id = eqd.id_base_operacional
     LEFT JOIN public.obras o ON o.id = mv.id_obra
     LEFT JOIN public.equipes eq ON eq.id = mv.id_equipe
     LEFT JOIN public.usuarios uop ON uop.id = mv.id_usuario_operador
     LEFT JOIN public.colaboradores cop ON cop.id = uop.id_colaborador
  WHERE mv.ativo = true
    AND m.catalogo = 'OPERACIONAL';
