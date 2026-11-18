-- V246: avisos de requisição de material só no sistema, sem e-mail.
--
-- "Requisição liberada para separação", "Requisição de material aprovada" e
-- "rejeitada" disparam a cada requisição, técnica ou comercial, e lotavam a caixa
-- de e-mail do almoxarifado e de quem requisita. O aviso continua no sininho; só o
-- e-mail é desligado. A alteração vale para a versão em uso de cada automação,
-- inclusive passos dentro de condições, e para as regras legadas equivalentes.

CREATE FUNCTION pg_temp.sem_email(passos jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    resultado jsonb := '[]'::jsonb;
    passo jsonb;
BEGIN
    IF passos IS NULL OR jsonb_typeof(passos) <> 'array' THEN
        RETURN passos;
    END IF;
    FOR passo IN SELECT * FROM jsonb_array_elements(passos) LOOP
        IF passo->>'type' = 'notify.people' THEN
            passo := jsonb_set(passo, '{params,email}', 'false'::jsonb, true);
        END IF;
        IF passo ? 'then' THEN
            passo := jsonb_set(passo, '{then}', pg_temp.sem_email(passo->'then'));
        END IF;
        IF passo ? 'else' THEN
            passo := jsonb_set(passo, '{else}', pg_temp.sem_email(passo->'else'));
        END IF;
        resultado := resultado || jsonb_build_array(passo);
    END LOOP;
    RETURN resultado;
END $$;

UPDATE automacao_versoes v
SET definicao = jsonb_set(v.definicao, '{steps}', pg_temp.sem_email(v.definicao->'steps')),
    data_ultima_alteracao = CURRENT_TIMESTAMP,
    usuario_ultima_alteracao = 'flyway:V246'
FROM automacoes a
WHERE a.id = v.id_automacao
  AND v.numero = a.numero_versao
  AND a.chave_evento IN ('estoque.material_aprovado', 'estoque.material_rejeitado')
  AND v.definicao ? 'steps';

UPDATE regras_notificacao
SET enviar_email = FALSE,
    data_ultima_alteracao = CURRENT_TIMESTAMP,
    usuario_ultima_alteracao = 'flyway:V246'
WHERE chave_gatilho IN ('estoque.material_aprovado', 'estoque.material_rejeitado');
