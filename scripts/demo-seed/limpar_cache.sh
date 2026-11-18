#!/usr/bin/env bash
# Apaga só os grupos de cache afetados pela carga (o Redis é compartilhado: nunca FLUSHALL/FLUSHDB).
# Uso: ./limpar_cache.sh [container_redis]   (padrão: ces-redis)
R=${1:-ces-redis}
for g in obras obras-status obras-agentes obras-tipos-anexos obras-kits obras-rotas equipes equipes-membros bases-operacionais \
         centros-faturamento municipios processos-negocio tipos-equipe supervisores coordenadores colaboradores usuarios \
         acoes acoes-valores materiais estoques saldos-v3 lookup-bootstrap-v1 metas-faturamento chamado-topicos-v2 chamado-equipes-v2 \
         financeiro-fornecedores financeiro-formularios sst-catalogos sst-atividades sst-governanca-corpos sst-governanca-perfis \
         inspecoes-seguranca metas-inspecao formularios-inspecao-v2 veiculos execucoes-v3 notificacao-preferencias; do
  docker exec "$R" redis-cli --scan --pattern "${g}::*" | while read -r k; do docker exec "$R" redis-cli DEL "$k" > /dev/null; done
done
echo "cache limpo"
