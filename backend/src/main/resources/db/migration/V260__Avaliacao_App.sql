-- V260: avaliação do aplicativo pelos próprios usuários.
--
-- Pesquisa temporária: quem usa o GEO (web ou app de campo) dá uma nota em estrelas e
-- conta o que achou — se está fácil, o que dá problema sempre, o que sugere.
--
-- Três tabelas, e a separação entre as duas últimas é o ponto do desenho:
--   * avaliacao_campanhas      — o período em que a pesquisa está aberta. Fora dele nada
--                                aparece; repetir a pesquisa depois é abrir outra campanha.
--   * avaliacao_participacoes  — o que cada usuário fez com o convite (respondeu, adiou,
--                                recusou). É o que impede o convite de voltar em outro
--                                aparelho: a memória fica no servidor, não no navegador.
--   * avaliacao_respostas      — o conteúdo. Na resposta anônima, id_usuario fica nulo e
--                                NÃO existe coluna que ligue a resposta à participação.
--
-- Por que a data, e não a hora, nas duas pontas: com a hora exata, a resposta anônima e a
-- participação "respondida às 14:32:07" seriam pareáveis pelo instante, e o anonimato
-- seria só de fachada. Com o dia, o pareamento cai no meio de todos os que responderam
-- naquele dia. Pelo mesmo motivo a resposta não tem as colunas de auditoria
-- (usuario_criacao gravaria o login de quem escreveu).


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1) Campanhas
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE avaliacao_campanhas (
    id UUID PRIMARY KEY,
    titulo VARCHAR(120) NOT NULL,
    inicio TIMESTAMP WITH TIME ZONE NOT NULL,
    fim TIMESTAMP WITH TIME ZONE NOT NULL,
    encerrada_em TIMESTAMP WITH TIME ZONE,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_avaliacao_campanhas_periodo CHECK (fim > inicio)
);

CREATE INDEX idx_avaliacao_campanhas_periodo ON avaliacao_campanhas (inicio, fim);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2) Participações (uma por usuário e campanha)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE avaliacao_participacoes (
    id_campanha UUID NOT NULL REFERENCES avaliacao_campanhas (id),
    id_usuario UUID NOT NULL,
    situacao VARCHAR(20) NOT NULL,
    adiada_ate TIMESTAMP WITH TIME ZONE,
    adiamentos INTEGER NOT NULL DEFAULT 0,
    data_situacao DATE NOT NULL,
    PRIMARY KEY (id_campanha, id_usuario),
    CONSTRAINT ck_avaliacao_participacoes_situacao
        CHECK (situacao IN ('RESPONDIDA', 'ADIADA', 'RECUSADA'))
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3) Respostas
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE avaliacao_respostas (
    id UUID PRIMARY KEY,
    id_campanha UUID NOT NULL REFERENCES avaliacao_campanhas (id),
    id_usuario UUID,
    origem VARCHAR(10) NOT NULL,
    estrelas SMALLINT NOT NULL,
    facilidade VARCHAR(10),
    -- Códigos separados por vírgula (LENTIDAO,LOGIN...). Vazio = nenhum problema.
    problemas VARCHAR(200) NOT NULL DEFAULT '',
    problema_detalhe VARCHAR(1000),
    sugestao VARCHAR(2000),
    versao_app VARCHAR(60),
    respondida_em DATE NOT NULL,
    CONSTRAINT ck_avaliacao_respostas_origem CHECK (origem IN ('WEB', 'CAMPO')),
    CONSTRAINT ck_avaliacao_respostas_estrelas CHECK (estrelas BETWEEN 1 AND 5),
    CONSTRAINT ck_avaliacao_respostas_facilidade
        CHECK (facilidade IS NULL OR facilidade IN ('FACIL', 'RAZOAVEL', 'DIFICIL'))
);

CREATE INDEX idx_avaliacao_respostas_campanha ON avaliacao_respostas (id_campanha, respondida_em DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4) Primeira campanha: 30 dias a partir da publicação
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO avaliacao_campanhas (id, titulo, inicio, fim)
VALUES (gen_random_uuid(), 'Avaliação do GEO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days');


-- ═══════════════════════════════════════════════════════════════════════════════
-- 5) Permissões do painel de resultados
-- ═══════════════════════════════════════════════════════════════════════════════
-- Responder não pede permissão: qualquer usuário autenticado é convidado.

INSERT INTO permissoes (id, versao, data_criacao, usuario_criacao, ativo, nome)
VALUES
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'avaliacao:read'),
    (gen_random_uuid(), 0, CURRENT_TIMESTAMP, 'SISTEMA', TRUE, 'avaliacao:manage')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT p.id, perm.id
FROM perfis_acesso p
CROSS JOIN permissoes perm
WHERE p.nome = 'ADMINISTRADOR'
  AND perm.nome IN ('avaliacao:read', 'avaliacao:manage')
ON CONFLICT DO NOTHING;
