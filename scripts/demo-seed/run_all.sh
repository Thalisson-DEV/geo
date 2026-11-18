#!/usr/bin/env bash
# Carga de demonstração completa, na ordem certa. Cada .sql roda em uma transação própria.
#
# PRÉ-REQUISITOS
#  1. Banco migrado pelo Flyway (backend no ar ao menos uma vez) e backend acessível na URL da API.
#  2. Cadastros base que NÃO vêm das migrations e que os scripts usam pelo nome/código:
#     bases JUAZEIRO/JACOBINA/BONFIM/REMANSO (+ "BASE SENHOR DO BONFIM", renomeada para CAMPO FORMOSO no 16),
#     municípios da região, equipes LV-JZR-01, LV-JZR-02, LV-JCB-01, RET-JZR-01, RET-BNF-01, CON-JZR-01, CON-JZR-02,
#     CON-RMS-01, CON-JCB-01, CON-BNF-01 (processo OBRAS) com membros, colaboradores (encarregados/eletricistas/auxiliares),
#     um supervisor e um coordenador, contrato ativo, ações SRV-00x, materiais 3000xx, veículos, fornecedores, tópicos de
#     chamado e formulários de inspeção. No ambiente local eles vieram da massa inicial (usuario_criacao = MASSA/USRADMIN):
#     para outro banco, copie esses cadastros antes (pg_dump --data-only das tabelas de cadastro).
#  3. Python 3 com requests, Pillow, numpy e PyMuPDF (fitz) para os passos que usam a API.
#  4. Os passos .py precisam de token: o script faz login com USRADMIN e ADMIN_PADRAO_SENHA.
#     Os arquivos (projetos, fotos, As Built) vão para o storage configurado no backend (R2).
#
# USO
#   ADMIN_PADRAO_SENHA=... ./run_all.sh                        # banco local (container ces-postgres, base nexo-db)
#   PSQL="psql postgresql://usuario:senha@host:porta/banco" API=https://.../api ADMIN_PADRAO_SENHA=... ./run_all.sh
#   DEMO_HOJE=2026-11-04 ./run_all.sh                           # data "de hoje" da massa de Obras (padrão: data local)
#   SO_OBRAS=1 ./run_all.sh                                    # refaz só o domínio de Obras (14 em diante)
set -u
cd "$(dirname "$0")"
API=${API:-http://localhost:8080/api}
DEMO_HOJE=${DEMO_HOJE:-$(TZ=America/Sao_Paulo date +%F)}
export PGOPTIONS="-c demo.hoje=${DEMO_HOJE}"
PSQL=${PSQL:-docker exec -e PGOPTIONS -i ces-postgres psql -U postgres -d nexo-db}

sql() { echo "== $1"; $PSQL -v ON_ERROR_STOP=1 -q < "$1" > /dev/null || { echo "FALHOU: $1"; exit 1; }; }
py() { echo "== $1"; python "$@" || echo "AVISO: $1 terminou com erro (pode ser reexecutado)"; }

if [ -z "${ADMIN_PADRAO_SENHA:-}" ] && [ -f ../../backend/.env ]; then
  ADMIN_PADRAO_SENHA=$(grep '^ADMIN_PADRAO_SENHA=' ../../backend/.env | cut -d= -f2- | tr -d '\r"')
fi
TOKEN=$(curl -s -X POST "$API/v1/auth/login" -H 'Content-Type: application/json' \
  -d "{\"login\":\"USRADMIN\",\"senha\":\"${ADMIN_PADRAO_SENHA}\"}" | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
[ -n "$TOKEN" ] || { echo "Não foi possível obter o token"; exit 1; }

if [ -z "${SO_OBRAS:-}" ]; then
  for f in 01_frota_veiculos.sql 02_descontos.sql 03_financeiro.sql 04_chamados_notificacoes.sql 05_estoque.sql 06_sst.sql \
           07_execucao_frota_odometro.sql 08_frota_cadastros.sql 09_frota_operacao.sql 10_frota_checklist_preventiva.sql 11_limpeza_rotulos.sql; do
    sql "$f"
  done
  py 12_renomear_colaboradores.py "$TOKEN" "$API"
  sql 13_frota_complementos.sql
fi

sql 14_reset_obras.sql
py 15_usuarios_operacao.py "$TOKEN" "$API"
for f in 16_obras_cadastros.sql 17_obras_carteira.sql 18_obras_planejamento.sql 19_obras_programacao_execucao.sql \
         20_obras_medicao_documentacao.sql 21_estoque_almoxarifados.sql; do
  sql "$f"
done
[ "$PSQL" = "${PSQL#docker}" ] || bash limpar_cache.sh
py 22_obras_arquivos.py "$TOKEN" "$API"
py 23_solicitacoes_material.py "$TOKEN" "$API" "$DEMO_HOJE"
sql 24_comunicados.sql
sql 25_chamados_sst_financeiro.sql
py 26_sst_governanca.py "$TOKEN" "$API"
sql 27_obras_ajuste_datas.sql
sql 28_descontos_itens_financeiro.sql
py 29_financeiro_documentos.py "$TOKEN" "$API"
sql 30_financeiro_dados_pagamento.sql
py 32_visita_previa.py "$TOKEN" "$API"
sql 35_obras_book_entrega.sql
# Redis compartilhado: só os grupos de cache afetados (nunca FLUSHALL). Em outro ambiente, limpe o cache equivalente.
[ "$PSQL" = "${PSQL#docker}" ] || bash limpar_cache.sh
echo "Carga concluída (hoje = $DEMO_HOJE)."
