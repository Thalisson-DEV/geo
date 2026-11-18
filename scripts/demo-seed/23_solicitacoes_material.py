"""Solicitações técnicas de material das obras pela API (a trilha de eventos é encadeada por hash, então nada via SQL).
Para cada obra do processo OBRAS com frentes programadas, pede o material da próxima frente ao almoxarifado da região
e leva cada pedido a um estágio diferente: aguardando agendamento, pronto para separar, em separação, separado,
entregue (total ou parcial), com reserva registrada ou com pendência.
Idempotente: pula obras que já têm solicitação técnica.
Uso: python 23_solicitacoes_material.py <token> [base_url] [hoje AAAA-MM-DD]"""
import base64
import io
import random
import sys
import uuid
from datetime import date, datetime, timedelta

import requests
from PIL import Image, ImageDraw

TOKEN = sys.argv[1]
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8080/api"
HOJE = date.fromisoformat(sys.argv[3]) if len(sys.argv) > 3 else date.today()
S = requests.Session()
S.headers["Authorization"] = "Bearer " + TOKEN
rnd = random.Random(23)


def get(caminho, **params):
    r = S.get(BASE + caminho, params=params, timeout=60)
    r.raise_for_status()
    return r.json() if r.content else None


def enviar(metodo, caminho, corpo):
    r = S.request(metodo, BASE + caminho, json=corpo, timeout=60, headers={"Idempotency-Key": str(uuid.uuid4())})
    if r.status_code >= 300:
        print("  falhou", metodo, caminho, r.status_code, r.text[:220])
        return None
    return r.json() if r.content else True


def assinatura(semente):
    g = random.Random(semente)
    img = Image.new("RGBA", (360, 120), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    x, y = 20, 70
    pts = []
    for _ in range(40):
        x += g.uniform(5, 10)
        y = max(20, min(100, y + g.uniform(-14, 14)))
        pts.append((x, y))
    d.line(pts, fill=(20, 30, 90, 255), width=3)
    out = io.BytesIO()
    img.save(out, "PNG")
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode()


_membros = {}


def saque(id_equipe):
    if id_equipe not in _membros:
        _membros[id_equipe] = [m["idColaborador"] for m in (get(f"/v1/equipes/{id_equipe}/membros") or []) if m.get("vinculoAtivo")]
    return _membros[id_equipe][0] if _membros[id_equipe] else None


def lista(caminho, **params):
    r = get(caminho, **params)
    return r["content"] if isinstance(r, dict) and "content" in r else r


def main():
    materiais = {m["codigo"]: m["id"] for m in lista("/v1/materiais", page=0, size=1000)}
    estoques = {e["nomeIdentificador"]: e["id"] for e in lista("/v1/estoques", page=0, size=200)}
    almox_por_base = {"JUAZEIRO": "ALMOX CENTRAL JUAZEIRO", "REMANSO": "ALMOX CENTRAL JUAZEIRO", "JACOBINA": "ALMOX JACOBINA",
                      "BONFIM": "ALMOX SENHOR DO BONFIM", "CAMPO FORMOSO": "ALMOX SENHOR DO BONFIM"}
    concreto = {"300115", "300116", "300101"}
    motivos = lista("/v1/motivos-pendencia", page=0, size=50) or []
    motivo = motivos[0]["id"] if motivos else None
    obras = [o for o in lista("/v1/obras", page=0, size=300) if (o.get("processoNome") or "") == "OBRAS"
             and o.get("statusNome") in ("EM EXECUÇÃO", "PLANEJADA", "PARALISADA")]
    n = 0
    for o in sorted(obras, key=lambda x: x["numero"]):
        if (get(f"/v1/obras/{o['id']}/solicitacoes-material") or {}).get("solicitacoes"):
            continue
        progs = [p for p in get(f"/v1/obras/{o['id']}/programacoes") if p.get("situacao") in ("PROGRAMADA", "EM_ANDAMENTO", "ATRASADA")]
        progs = sorted(progs, key=lambda p: datetime.strptime(p["inicio"], "%d/%m/%Y"))[:2]
        almox = estoques.get(almox_por_base.get(o.get("baseOperacionalNome") or "", "ALMOX CENTRAL JUAZEIRO"))
        for j, p in enumerate(progs):
            det = get(f"/v1/obras/programacoes/{p['id']}")
            soma = {}
            for it in det.get("itens", []):
                if it.get("tipo") == "MATERIAL" and it["codigo"] in materiais and (it.get("quantidade") or 0) > (it.get("quantidadeExecutada") or 0):
                    soma[it["codigo"]] = soma.get(it["codigo"], 0) + it["quantidade"] - (it.get("quantidadeExecutada") or 0)
            if not soma:
                continue
            inicio = datetime.strptime(p["inicio"], "%d/%m/%Y").date()
            estagio = (n + j) % 9
            itens = [{"idMaterial": materiais[c], "tipoMovimentacao": "ADICAO_CONCRETO" if c in concreto else "ADICAO_COMUM",
                      "quantidade": round(q + (0 if c in concreto else q * 0.03), 3)} for c, q in soma.items()]
            corpo = {"idObra": o["id"], "idAlmoxarifadoAtendimento": almox, "idEquipe": p["idEquipe"],
                     "dataPrevista": None if estagio == 0 else str(max(HOJE, inicio - timedelta(days=1))),
                     "observacao": f"Material da programação #{p['numero']} ({det.get('descricao', '')[:60]})", "itens": itens}
            r = enviar("POST", "/v1/solicitacoes-material/tecnicas", corpo)
            if not r:
                continue
            n += 1
            for criada in r.get("solicitacoesCriadas", []):
                sid = criada["id"]
                sol = get(f"/v1/solicitacoes-material/{sid}")
                versao = sol.get("versao", 0)
                if estagio in (5, 6, 7) or (estagio in (2, 3, 4) and rnd.random() < 0.6):
                    rr = enviar("PUT", f"/v1/solicitacoes-material/tecnicas/{sid}/reserva",
                                {"versaoEsperada": versao, "numero": str(rnd.randint(4100000000, 4199999999)), "dataCriacao": str(HOJE - timedelta(days=rnd.randint(1, 5)))})
                    if rr:
                        versao = get(f"/v1/solicitacoes-material/{sid}").get("versao", versao)
                if estagio in (3, 4, 5, 6, 7):
                    if enviar("POST", f"/v1/solicitacoes-material/tecnicas/{sid}/separacao/iniciar", {"versaoEsperada": versao}):
                        versao = get(f"/v1/solicitacoes-material/{sid}").get("versao", versao)
                if estagio in (4, 5, 6, 7):
                    if enviar("POST", f"/v1/solicitacoes-material/tecnicas/{sid}/separacao/concluir", {"versaoEsperada": versao}):
                        versao = get(f"/v1/solicitacoes-material/{sid}").get("versao", versao)
                if estagio in (5, 6, 7):
                    sol = get(f"/v1/solicitacoes-material/{sid}")
                    entrega = []
                    for it in sol.get("itens", []):
                        q = float(it.get("quantidade") or 0)
                        if estagio == 7:
                            q = round(q * 0.6, 3) if q > 1 else q
                        entrega.append({"idItemSolicitacao": it["id"], "quantidade": q})
                    enviar("POST", f"/v1/solicitacoes-material/tecnicas/{sid}/entregas",
                           {"versaoEsperada": sol.get("versao", versao), "idEquipe": p["idEquipe"], "idColaboradorSaque": saque(p["idEquipe"]),
                            "saqueForaEquipe": False, "assinaturaAlmox": assinatura(sid + "a"),
                            "assinaturaEquipe": assinatura(sid + "e"), "itens": entrega})
                if estagio == 8:
                    enviar("POST", f"/v1/solicitacoes-material/{sid}/pendencia",
                           {"idMotivoPendencia": motivo, "justificativa": "Aguardando número de reserva da distribuidora para liberar a separação."})
        print("obra", o["numero"], "programações", len(progs))
    print("pedidos criados:", n)


if __name__ == "__main__":
    main()
