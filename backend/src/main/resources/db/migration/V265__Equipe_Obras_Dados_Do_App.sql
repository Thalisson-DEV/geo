-- O perfil EQUIPE_OBRAS (V263) só tinha as permissões de Obras, e o app da equipe também baixa a equipe e seus membros,
-- municípios, bases, veículos, processos, materiais, estoques, saldos, números de série e transferências do caminhão
-- (aba Material). Sem elas, o app mostrava "Alguns dados não foram carregados" logo no primeiro acesso.
INSERT INTO perfil_permissoes (id_perfil, id_permissao)
SELECT p.id, perm.id
FROM perfis_acesso p
CROSS JOIN permissoes perm
WHERE p.nome = 'EQUIPE_OBRAS'
  AND perm.nome IN ('rh:equipe:read', 'rh:colaborador:read', 'rh:municipio:read', 'rh:base-operacional:read',
                    'rh:veiculo:read', 'rh:processo-negocio:read', 'estoque:material:read', 'estoque:estoque:read',
                    'estoque:saldo:read', 'estoque:movimentacao:read', 'estoque:movimentacao:write')
ON CONFLICT DO NOTHING;
