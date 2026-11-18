"""Governança de SST pela API: CIPA e brigadas por base, com integrantes e plano de ação em vários estágios.
Idempotente: não recria corpos com o mesmo nome. Uso: python 26_sst_governanca.py <token> [base_url]"""
import sys
import uuid
from datetime import date, timedelta

import requests

TOKEN = sys.argv[1]
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8080/api"
S = requests.Session()
S.headers["Authorization"] = "Bearer " + TOKEN
HOJE = date.today()


def get(c, **p):
    r = S.get(BASE + c, params=p, timeout=60)
    r.raise_for_status()
    return r.json() if r.content else None


def env(m, c, corpo):
    r = S.request(m, BASE + c, json=corpo, timeout=60, headers={"Idempotency-Key": str(uuid.uuid4())})
    if r.status_code >= 300:
        print("  falhou", m, c, r.status_code, r.text[:250])
        return None
    return r.json() if r.content else True


def lista(c, **p):
    r = get(c, **p)
    return r["content"] if isinstance(r, dict) and "content" in r else r


bases = {b["nome"]: b["id"] for b in lista("/v1/bases-operacionais", page=0, size=50)}
colabs = lista("/v1/rh/colaboradores", page=0, size=500)
por_base = {}
for c in colabs:
    por_base.setdefault((c.get("baseOperacional") or {}).get("nome"), []).append(c)

existentes = {(c.get("corpo") or c).get("nome") for c in (lista("/v1/sst/governanca/corpos", page=0, size=100) or [])}


def versao_corpo(cid):
    d = get(f"/v1/sst/governanca/corpos/{cid}")
    return (d.get("corpo") or d).get("versao", 0)

CORPOS = [
    ("BRIGADA", None, "Brigada de Emergência - Base Juazeiro", "JUAZEIRO",
     [("COORDENADOR_GERAL",), ("CHEFE",), ("LIDER",), ("BRIGADISTA",), ("BRIGADISTA",), ("BRIGADISTA",)]),
    ("BRIGADA", None, "Brigada de Emergência - Base Jacobina", "JACOBINA",
     [("COORDENADOR_GERAL",), ("LIDER",), ("BRIGADISTA",), ("BRIGADISTA",)]),
    ("CIPA", "REPRESENTANTE_NOMEADO", "Representante da CIPA - Base Remanso", "REMANSO", [("REPRESENTANTE_NOMEADO",)]),
    ("BRIGADA", None, "Brigada de Emergência - Base Bonfim", "BONFIM",
     [("COORDENADOR_GERAL",), ("LIDER",), ("BRIGADISTA",), ("BRIGADISTA",)]),
]

ACOES = [
    ("Recarregar extintores vencidos da base", "Dois extintores de PQS com carga vencida no pátio de veículos.", "CORRETIVA", "ALTA", 10, "CONCLUIDA"),
    ("Simulado de abandono da base", "Simulado anual com cronometragem e ponto de encontro sinalizado.", "PREVENTIVA", "MEDIA", 25, "ABERTA"),
    ("Sinalizar rota de fuga do almoxarifado", "Instalar placas fotoluminescentes e iluminação de emergência.", "CORRETIVA", "ALTA", 12, "EM_ANDAMENTO"),
    ("Inspeção mensal dos kits de primeiros socorros", "Conferir validade dos itens e repor o que faltar nas viaturas.", "INSPECAO", "MEDIA", 6, "CONCLUIDA"),
    ("Treinamento de resgate em poste", "Reciclagem prática de resgate com a equipe de linha viva.", "PREVENTIVA", "CRITICA", 30, "EM_ANDAMENTO"),
    ("Corrigir piso escorregadio na entrada da oficina", "Aplicar faixa antiderrapante e sinalizar o desnível.", "CORRETIVA", "BAIXA", 15, "CANCELADA"),
    ("Revisar plano de atendimento a emergências", "Atualizar telefones, rotas até o hospital e responsáveis por turno.", "OUTRA", "MEDIA", 20, "ABERTA"),
    ("Instalar lava-olhos no depósito de baterias", "Requisito para manuseio de eletrólito na oficina.", "CORRETIVA", "ALTA", 18, "ABERTA"),
]

for tipo, regime, nome, base, papeis in CORPOS:
    if nome in existentes or base not in bases:
        continue
    inicio = date(HOJE.year, 1, 1) if tipo == "CIPA" else HOJE - timedelta(days=150)
    corpo = env("POST", "/v1/sst/governanca/corpos", {
        "tipo": tipo, "regimeComposicao": regime, "nome": nome, "idBaseOperacional": bases[base],
        "unidadeGovernanca": f"Base operacional {base.title()}", "uf": "BA", "inicioPeriodo": str(inicio),
        "fimPeriodo": str(inicio.replace(year=inicio.year + 1) - timedelta(days=1)), "grauRisco": 3,
        "hipoteseRepresentanteNomeadoConfirmada": regime == "REPRESENTANTE_NOMEADO"})
    if not corpo:
        continue
    cid = (corpo.get("corpo") or corpo)["id"]
    pessoas = por_base.get(base, []) or colabs
    for i, (papel,) in enumerate(papeis):
        membro = {"idColaborador": pessoas[i % len(pessoas)]["id"], "papel": papel, "reeleito": False,
                  "inicioParticipacao": str(inicio), "turnoDisponivel": "Diurno"}
        if tipo == "CIPA":
            membro.update({"representacao": "EMPREGADOS", "origem": "DESIGNADO",
                           "atoDesignacao": "Portaria interna 012/" + str(inicio.year)})
        env("POST", f"/v1/sst/governanca/corpos/{cid}/membros", {"versao": versao_corpo(cid), "membro": membro})
    env("POST", f"/v1/sst/governanca/corpos/{cid}/ativacao", {"versao": versao_corpo(cid)})
    for j, (titulo, desc, tipo_acao, prio, prazo, estado) in enumerate(ACOES):
        if (j + len(nome)) % 2 == 0 and tipo == "BRIGADA" and base != "JUAZEIRO":
            continue
        acao = env("POST", "/v1/sst/governanca/acoes", {
            "idCorpo": cid, "idBaseOperacional": bases[base], "clientRequestId": str(uuid.uuid4()), "titulo": titulo, "descricao": desc,
            "tipo": tipo_acao, "prioridade": prio, "idResponsavel": pessoas[(j + 1) % len(pessoas)]["id"], "prazo": str(HOJE + timedelta(days=prazo))})
        if not acao:
            continue
        aid, versao = acao["id"], acao.get("versao", 0)
        if estado in ("EM_ANDAMENTO", "CONCLUIDA"):
            r = env("POST", f"/v1/sst/governanca/acoes/{aid}/inicio", {"versaoEsperada": versao})
            versao = get(f"/v1/sst/governanca/acoes/{aid}").get("versao", versao + 1)
        if estado == "CONCLUIDA":
            env("POST", f"/v1/sst/governanca/acoes/{aid}/conclusao", {"versaoEsperada": versao, "resultado": "Ação executada e conferida pela brigada; registro fotográfico arquivado."})
        if estado == "CANCELADA":
            env("POST", f"/v1/sst/governanca/acoes/{aid}/cancelamento", {"versaoEsperada": versao, "motivo": "Área será reformada no próximo trimestre; ação incorporada ao projeto da reforma."})
    print("corpo", nome)
