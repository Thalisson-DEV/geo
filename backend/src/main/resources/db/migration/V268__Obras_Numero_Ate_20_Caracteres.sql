-- O número da obra passa de 7 para até 20 caracteres: há contratantes com numeração maior (ex.: 440247665).
-- O PostgreSQL não muda o tipo de coluna usada por view, então as views que dependem de obras (as do copiloto,
-- inclusive as que leem outras views) são guardadas, derrubadas e recriadas com a mesma definição.
DO $$
DECLARE
    v record;
BEGIN
    CREATE TEMP TABLE _views_de_obras ON COMMIT DROP AS
    WITH RECURSIVE dependentes(oid, nivel) AS (
        SELECT DISTINCT r.ev_class, 1
        FROM pg_depend d
        JOIN pg_rewrite r ON r.oid = d.objid
        WHERE d.refobjid = 'public.obras'::regclass
          AND r.ev_class <> 'public.obras'::regclass
        UNION
        SELECT DISTINCT r.ev_class, dep.nivel + 1
        FROM dependentes dep
        JOIN pg_depend d ON d.refobjid = dep.oid
        JOIN pg_rewrite r ON r.oid = d.objid
        WHERE r.ev_class <> dep.oid
    )
    SELECT n.nspname AS esquema, c.relname AS nome, max(dep.nivel) AS nivel, pg_get_viewdef(c.oid) AS definicao
    FROM dependentes dep
    JOIN pg_class c ON c.oid = dep.oid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'v'
    GROUP BY n.nspname, c.relname, c.oid;

    FOR v IN SELECT * FROM _views_de_obras ORDER BY nivel DESC LOOP
        EXECUTE format('DROP VIEW IF EXISTS %I.%I', v.esquema, v.nome);
    END LOOP;

    ALTER TABLE public.obras ALTER COLUMN numero TYPE VARCHAR(20);

    FOR v IN SELECT * FROM _views_de_obras ORDER BY nivel LOOP
        EXECUTE format('CREATE VIEW %I.%I AS %s', v.esquema, v.nome, v.definicao);
    END LOOP;
END $$;
