-- Troca rótulos de massa de teste por nomes realistas.
BEGIN;
CREATE TEMP TABLE eq_map(old text, new text);
INSERT INTO eq_map VALUES
 ('EQ-TESTE-01','LV-JZR-01'),('FIC-LV-01','LV-JZR-02'),('FIC-LV-02','LV-JCB-01'),('FIC-RET-01','RET-JZR-01'),('FIC-RET-02','RET-BNF-01'),
 ('FIC-CON-01','CON-JZR-01'),('FIC-CON-02','CON-JZR-02'),('FIC-CON-03','CON-RMS-01'),('FIC-CON-04','CON-JCB-01'),('FIC-CON-05','CON-BNF-01');

DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT c.table_name, c.column_name FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name)
   WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.data_type IN ('character varying','text')
     AND (c.column_name ILIKE '%equipe%' OR c.column_name = 'cod_equipe')
 LOOP
   EXECUTE format('UPDATE %I x SET %I = m.new FROM eq_map m WHERE x.%I = m.old', r.table_name, r.column_name, r.column_name);
 END LOOP;
END $$;

UPDATE bases_operacionais SET nome = 'BASE SENHOR DO BONFIM', endereco = 'Av. Antônio Carlos Magalhães, 1200 - Centro' WHERE nome = 'BASE TESTE';
UPDATE contratos SET numero_contrato = 'CT-2026-0147', cliente = 'Distribuidora de Energia do Nordeste' WHERE numero_contrato = 'CT-TESTE-01';
UPDATE tipos_equipe SET nome = 'CONSTRUÇÃO DE REDES' WHERE nome = 'CONSTRUCAO TESTE' AND NOT EXISTS (SELECT 1 FROM tipos_equipe WHERE nome = 'CONSTRUÇÃO DE REDES');
UPDATE centros_faturamento SET nome = 'CENTRO VALE DO SÃO FRANCISCO' WHERE nome = 'CENTRO TESTE';
UPDATE municipios SET nome = 'CAMPO FORMOSO' WHERE nome = 'MUNICIPIO TESTE' AND NOT EXISTS (SELECT 1 FROM municipios WHERE nome = 'CAMPO FORMOSO');
UPDATE estoques SET nome_identificador = 'ALMOX CENTRAL JUAZEIRO' WHERE nome_identificador = 'ALMOX CENTRAL TESTE';
UPDATE estoques SET nome_identificador = replace(nome_identificador, 'EQ-TESTE-01', 'LV-JZR-01') WHERE nome_identificador LIKE '%EQ-TESTE-01%';
UPDATE metas_faturamento_equipe SET descricao = 'Meta mensal de faturamento' WHERE descricao ~* '(fict|teste)';

UPDATE programacoes SET descricao = 'Substituição de poste e reconstrução de rede BT' WHERE descricao ~* 'teste';
UPDATE eventos_programacao SET observacao = 'Descrição ajustada após visita técnica' WHERE observacao ~* '(teste|fict)';
UPDATE visitas_previas_obra SET titulo_modelo = 'Pré-vistoria de obra' WHERE titulo_modelo ~* 'fict';
UPDATE visitas_previas_obra SET responsavel = 'ANA PAULA SOUZA' WHERE responsavel = 'ANA FICTICIA';
UPDATE visitas_previas_obra SET responsavel = 'BRUNO CARVALHO' WHERE responsavel = 'BRUNO FICTICIO';
UPDATE visitas_previas_obra SET observacoes = 'Acesso pela estrada vicinal, poste com inclinação e ramal sem identificação.' WHERE observacoes ~* 'teste';
UPDATE modelos_checklist_obra SET titulo = replace(replace(titulo, ' fictícia', ''), 'Pré-vistoria', 'Pré-vistoria de obra') WHERE titulo ~* 'fict';
UPDATE modelos_checklist_obra SET descricao = 'Modelo padrão da área de obras' WHERE descricao ~* 'teste';
UPDATE fichas_as_built SET titulo_modelo = 'Ficha As Built' WHERE titulo_modelo ~* 'fict';
UPDATE equipamentos_obra SET observacao = 'Instalado conforme projeto' WHERE observacao ~* 'teste';
UPDATE evidencias_ponto_obra SET legenda = 'Poste instalado e aterramento concluído' WHERE legenda ~* 'teste';
UPDATE solicitacoes_material SET observacao = 'Material para obra programada da semana' WHERE observacao ~* 'teste';
UPDATE medicoes_obras SET observacao = 'Medição do ciclo mensal' WHERE observacao ~* 'teste';
UPDATE medicoes_obras SET justificativa_estorno = 'Ciclo gerado na competência errada' WHERE justificativa_estorno ~* 'teste';
UPDATE importacoes_obras SET nome_arquivo = replace(nome_arquivo, '-teste', '-out-2026');
UPDATE anexos_obras SET nome_arquivo = replace(replace(nome_arquivo, '-ficticio', '-executivo'), '-teste', '-basico');
COMMIT;
