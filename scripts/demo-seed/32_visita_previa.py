"""Visita prévia (pré-vistoria) de demonstração, pela API:
- modelo "Pré-vistoria de obra" com seções de acesso, segurança e via, rede elétrica, terreno, imóveis e conclusão, cada
  pergunta de Sim/Não com a resposta conforme (a esperada); outra resposta aparece como não conformidade;
- as visitas existentes passam para esse modelo, com respostas coerentes entre si (zona rural com base mais longe, rede
  divergente leva a "revisar o projeto", poda e solo rochoso com foto) e o responsável ligado a um colaborador;
- parte das visitas ganha evidências: fotos nas perguntas não conformes, vista geral e, em algumas, um croqui em PDF.
  As evidências são opcionais: muitas visitas ficam sem nenhuma, como no uso real.
Idempotente: o modelo é reaproveitado, a visita que já está no modelo novo não é refeita e a que já tem evidência não
ganha outra. Requer requests, Pillow, numpy e PyMuPDF (fitz), os mesmos do 22.
Uso: python 32_visita_previa.py <token> [base_url]"""
import importlib.util
import os
import random
import sys
from datetime import date, datetime, timedelta

import requests

TOKEN = sys.argv[1]
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8080/api"
S = requests.Session()
S.headers["Authorization"] = "Bearer " + TOKEN

# Reaproveita o gerador de fotos e de PDF do passo 22.
_spec = importlib.util.spec_from_file_location("arquivos_obras", os.path.join(os.path.dirname(os.path.abspath(__file__)), "22_obras_arquivos.py"))
arquivos = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(arquivos)

TITULO = "Pré-vistoria de obra"
DESCRICAO = "Checklist feito antes da execução: acesso, segurança, rede, terreno e imóveis do trecho."
SN = ["Sim", "Não"]


def p(id_, enunciado, conforme=None, opcoes=None, tipo="ESCOLHA_UNICA", obrigatoria=True, na=False):
    return {"id": id_, "enunciado": enunciado, "tipo": tipo, "obrigatoria": obrigatoria, "aceitaNaoSeAplica": na,
            "opcoes": (opcoes or SN) if tipo in ("ESCOLHA_UNICA", "MULTIPLA_ESCOLHA") else None,
            "opcaoConforme": conforme if tipo == "ESCOLHA_UNICA" else None}


ESTRUTURA = {"grupos": [
    {"titulo": "Acesso e logística", "perguntas": [
        p("pv2-acesso-veiculo", "Há acesso para veículos e equipamentos?", "Sim"),
        p("pv2-autorizacao", "O acesso requer autorização?", "Não"),
        p("pv2-zona", "Zona", opcoes=["Urbana", "Rural"]),
        p("pv2-veiculo", "Veículo que chega até os pontos", "Caminhão com guindauto", ["Caminhão com guindauto", "Picape", "Somente a pé"]),
        p("pv2-distancia-base", "Distância da base (km)", tipo="NUMERO", na=True),
        p("pv2-chuva", "Com terreno molhado (chuva), a obra pode ser executada?", "Sim"),
    ]},
    {"titulo": "Segurança e via", "perguntas": [
        p("pv2-area-risco", "Haverá acesso a alguma área de risco à segurança?", "Não"),
        p("pv2-fluxo", "Há fluxo de veículos na via do local?", "Não"),
        p("pv2-interdicao", "Será necessário interditar a via?", "Não"),
        p("pv2-internet", "Há sinal de internet no local?", "Sim"),
        p("pv2-distancia-sinal", "Distância até um local com sinal (m)", tipo="NUMERO", obrigatoria=False, na=True),
    ]},
    {"titulo": "Rede elétrica", "perguntas": [
        p("pv2-linha-viva", "A seção do condutor permite trabalho em linha viva?", "Sim", na=True),
        p("pv2-cruzamento", "Há cruzamento com outro alimentador a isolar, com religamento bloqueado?", "Não"),
        p("pv2-desligamento", "Será necessário desligamento?", "Não"),
        p("pv2-divergente", "A rede existente diverge do projeto?", "Não"),
        p("pv2-construido", "Parte do trecho já está construída?"),
    ]},
    {"titulo": "Terreno e vegetação", "perguntas": [
        p("pv2-poda", "Há necessidade de poda?", "Não"),
        p("pv2-solo-rochoso", "O solo é rochoso?", "Não"),
        p("pv2-interferencias", "Interferências encontradas", tipo="MULTIPLA_ESCOLHA",
          opcoes=["Vegetação", "Muro ou cerca", "Calçada", "Rede de telecom", "Curso d'água", "Nenhuma"]),
    ]},
    {"titulo": "Imóveis e clientes", "perguntas": [
        p("pv2-casa-abandonada", "Há imóvel abandonado no trecho?", "Não", na=True),
        p("pv2-casa-ligada", "Há imóvel já ligado à rede no trecho?", na=True),
    ]},
    {"titulo": "Conclusão", "perguntas": [
        p("pv2-seguir-projeto", "A obra pode seguir conforme o projeto?", "Sim", ["Sim", "Não, precisa de revisão"]),
        p("pv2-obs", "Observações para a equipe", tipo="TEXTO", obrigatoria=False),
    ]},
]}

OBSERVACOES = [
    "Combinar com os moradores o horário do desligamento.",
    "Portão da propriedade fica trancado; pegar a chave com o responsável na sede.",
    "Levar escada extra: dois postes ficam em área alagadiça.",
    "Trecho com cachorros soltos; avisar a equipe.",
    "Acesso pela estrada vicinal depois da ponte; caminhão passa com cuidado.",
    "Reservar sinalização para a via, há fluxo de ônibus escolar pela manhã.",
]
LEGENDAS = {
    "pv2-poda": ["Galhos sobre a rede no vão entre os pontos", "Vegetação encostando no condutor"],
    "pv2-solo-rochoso": ["Afloramento de rocha no local do poste", "Solo rochoso na cava prevista"],
    "pv2-interdicao": ["Via estreita, sem acostamento", "Trecho da via que precisa ser interditado"],
    "pv2-divergente": ["Estrutura existente diferente da prevista no projeto", "Rede existente fora da posição do projeto"],
    "pv2-acesso-veiculo": ["Acesso sem condição para o caminhão", "Estrada de terra com erosão"],
    "pv2-area-risco": ["Área próxima a talude", "Margem de canal ao lado do trecho"],
    "pv2-casa-abandonada": ["Imóvel abandonado ao lado do ponto"],
    None: ["Vista geral do trecho", "Início do trecho a partir da via", "Ponto de chegada da equipe"],
}


def get(caminho, **params):
    r = S.get(BASE + caminho, params=params, timeout=60)
    r.raise_for_status()
    return r.json() if r.content else None


def modelo():
    existentes = get("/v1/obras/checklists", finalidade="VISITA_PREVIA", ativo=True, size=100)["content"]
    atual = next((m for m in existentes if m["titulo"].strip().lower() == TITULO.lower()), None)
    corpo = {"finalidade": "VISITA_PREVIA", "titulo": TITULO, "descricao": DESCRICAO, "estrutura": ESTRUTURA}
    if atual is None:
        r = S.post(BASE + "/v1/obras/checklists", json=corpo, timeout=60)
        r.raise_for_status()
        atual = r.json()
        print("modelo criado", atual["id"])
    elif not atual.get("emUso"):
        r = S.put(BASE + f"/v1/obras/checklists/{atual['id']}", json=corpo, timeout=60)
        r.raise_for_status()
        atual = r.json()
        print("modelo atualizado", atual["id"])
    else:
        print("modelo já em uso, mantido", atual["id"])
    return atual, [m for m in existentes if m["id"] != atual["id"]]


def respostas(rnd, numero):
    """Respostas coerentes: a maioria conforme, com algumas não conformidades que puxam as seguintes."""
    rural = rnd.random() < 0.55
    r = {}

    def sim(prob):
        return "Sim" if rnd.random() < prob else "Não"

    r["pv2-zona"] = ["Rural" if rural else "Urbana"]
    r["pv2-acesso-veiculo"] = [sim(0.85 if rural else 0.97)]
    r["pv2-autorizacao"] = [sim(0.35 if rural else 0.1)]
    if r["pv2-acesso-veiculo"] == ["Não"]:
        r["pv2-veiculo"] = ["Somente a pé"]
    else:
        r["pv2-veiculo"] = [rnd.choices(["Caminhão com guindauto", "Picape"], [0.8, 0.2])[0]]
    r["pv2-chuva"] = [sim(0.6 if rural else 0.9)]
    r["pv2-area-risco"] = [sim(0.08)]
    r["pv2-fluxo"] = [sim(0.15 if rural else 0.6)]
    r["pv2-interdicao"] = ["Sim" if r["pv2-fluxo"] == ["Sim"] and rnd.random() < 0.45 else "Não"]
    r["pv2-internet"] = [sim(0.6 if rural else 0.98)]
    r["pv2-linha-viva"] = [sim(0.8)]
    r["pv2-cruzamento"] = [sim(0.12)]
    r["pv2-desligamento"] = ["Sim" if r["pv2-linha-viva"] == ["Não"] or r["pv2-cruzamento"] == ["Sim"] or rnd.random() < 0.2 else "Não"]
    r["pv2-divergente"] = [sim(0.12)]
    r["pv2-construido"] = [sim(0.3)]
    r["pv2-poda"] = [sim(0.4 if rural else 0.25)]
    r["pv2-solo-rochoso"] = [sim(0.3)]
    interf = [i for i, prob in (("Vegetação", 0.5 if r["pv2-poda"] == ["Sim"] else 0.1), ("Muro ou cerca", 0.25), ("Calçada", 0.05 if rural else 0.5),
                                ("Rede de telecom", 0.08 if rural else 0.45), ("Curso d'água", 0.12 if rural else 0.02)) if rnd.random() < prob]
    r["pv2-interferencias"] = interf or ["Nenhuma"]
    r["pv2-seguir-projeto"] = ["Não, precisa de revisão" if r["pv2-divergente"] == ["Sim"] else "Sim"]

    itens = []
    for grupo in ESTRUTURA["grupos"]:
        for q in grupo["perguntas"]:
            qid = q["id"]
            if qid in r:
                itens.append({"idPergunta": qid, "valor": None, "selecionadas": r[qid], "naoSeAplica": False})
            elif qid == "pv2-distancia-base":
                itens.append({"idPergunta": qid, "valor": str(round(rnd.uniform(18, 140) if rural else rnd.uniform(2, 25), 1)), "selecionadas": [], "naoSeAplica": False})
            elif qid == "pv2-distancia-sinal":
                if r["pv2-internet"] == ["Sim"]:
                    itens.append({"idPergunta": qid, "valor": None, "selecionadas": [], "naoSeAplica": True})
                else:
                    itens.append({"idPergunta": qid, "valor": str(rnd.choice([300, 500, 800, 1200, 2000])), "selecionadas": [], "naoSeAplica": False})
            elif qid in ("pv2-casa-abandonada", "pv2-casa-ligada"):
                if rural and rnd.random() < 0.4:
                    itens.append({"idPergunta": qid, "valor": None, "selecionadas": [], "naoSeAplica": True})
                else:
                    prob = 0.12 if qid == "pv2-casa-abandonada" else 0.55
                    itens.append({"idPergunta": qid, "valor": None, "selecionadas": [sim(prob)], "naoSeAplica": False})
            elif qid == "pv2-obs":
                itens.append({"idPergunta": qid, "valor": rnd.choice(OBSERVACOES) if rnd.random() < 0.5 else None, "selecionadas": [], "naoSeAplica": False})
    return itens


def nao_conformes(itens):
    esperadas = {q["id"]: q["opcaoConforme"] for g in ESTRUTURA["grupos"] for q in g["perguntas"] if q.get("opcaoConforme")}
    return [i["idPergunta"] for i in itens if i["idPergunta"] in esperadas and i["selecionadas"] and esperadas[i["idPergunta"]] not in i["selecionadas"]]


def croqui_pdf(obra):
    return arquivos.texto_pdf(f"Croqui da pré-vistoria · Obra {obra['numero']}", [
        "Levantamento feito no local antes da execução. O desenho de campo foi passado a limpo para a equipe.",
        "Pontos de acesso, interferências e posição prevista dos postes conferidos com o projeto. Divergências anotadas no checklist.",
        "Documento de apoio: não substitui o projeto aprovado.",
    ])


def enviar(id_obra, id_visita, nome, conteudo, tipo, id_pergunta=None, legenda=None):
    dados = {k: v for k, v in (("idPergunta", id_pergunta), ("legenda", legenda)) if v}
    r = S.post(BASE + f"/v1/obras/{id_obra}/documentacao/visitas/{id_visita}/evidencias", data=dados,
               files={"arquivo": (nome, conteudo, tipo)}, timeout=120)
    if r.status_code >= 300:
        print("  evidência falhou", r.status_code, r.text[:160])
        return False
    return True


def main():
    m, antigos = modelo()
    obras = get("/v1/obras", page=0, size=300)["content"]
    print("obras:", len(obras))
    colaboradores_vistos = []
    total_visitas = total_evid = 0
    for o in sorted(obras, key=lambda x: x["numero"]):
        doc = get(f"/v1/obras/{o['id']}/documentacao")
        for v in doc.get("visitas", []):
            rnd = random.Random(f"{o['numero']}-{v['id']}")
            if v.get("idColaborador"):
                colaboradores_vistos.append((v["idColaborador"], v["responsavel"]))
            id_colab = v.get("idColaborador") or (rnd.choice(colaboradores_vistos)[0] if colaboradores_vistos else None)
            itens = v["respostas"]["itens"]
            if v["idModelo"] != m["id"]:
                itens = respostas(rnd, o["numero"])
                corpo = {"idModelo": m["id"], "dataVisita": v["dataVisita"], "idColaborador": id_colab,
                         "responsavel": None if id_colab else v["responsavel"], "observacoes": v.get("observacoes"), "respostas": itens}
                r = S.put(BASE + f"/v1/obras/{o['id']}/documentacao/visitas/{v['id']}", json=corpo, timeout=60)
                if r.status_code >= 300:
                    print("  visita falhou", o["numero"], r.status_code, r.text[:200])
                    continue
                v = r.json()
                total_visitas += 1
            if v.get("evidencias"):
                continue
            # Evidência é opcional: cerca de metade das visitas fica sem nenhuma. Sorteio próprio, para a decisão ser a
            # mesma em toda execução (as respostas só são sorteadas na primeira).
            rnd = random.Random(f"evidencias-{o['numero']}-{v['id']}")
            if rnd.random() < 0.5:
                continue
            quando = datetime.combine(date.fromisoformat(v["dataVisita"]), datetime.min.time()) + timedelta(hours=rnd.randint(8, 15), minutes=rnd.randint(0, 59))
            rodape = [quando.strftime("%d/%m/%Y %H:%M"), f"Pré-vistoria · obra {o['numero']}", o.get("municipioNome") or ""]
            alvos = [q for q in nao_conformes([{"idPergunta": i["idPergunta"], "selecionadas": i.get("selecionadas") or []} for i in itens]) if q in LEGENDAS]
            alvos = alvos[:3] + [None]
            for n, alvo in enumerate(alvos):
                tipo_foto = "foto-geral" if alvo in (None, "pv2-acesso-veiculo", "pv2-interdicao", "pv2-area-risco", "pv2-casa-abandonada") else "foto-estrutura"
                img = arquivos.foto(tipo_foto, hash((o["numero"], v["id"], alvo, n)) & 0xFFFFFFFF, [t for t in rodape if t])
                nome = f"IMG_{(quando + timedelta(minutes=3 * n)):%Y%m%d_%H%M%S}.jpg"
                if enviar(o["id"], v["id"], nome, img, "image/jpeg", alvo, rnd.choice(LEGENDAS[alvo])):
                    total_evid += 1
            if rnd.random() < 0.25 and enviar(o["id"], v["id"], f"croqui-pre-vistoria-{o['numero']}.pdf", croqui_pdf(o), "application/pdf",
                                               None, "Croqui de campo"):
                total_evid += 1
    print("visitas no modelo novo:", total_visitas, "· evidências lançadas:", total_evid)

    # O modelo antigo de demonstração sai de cena depois que nenhuma visita o usa mais.
    for antigo in antigos:
        atual = get(f"/v1/obras/checklists/{antigo['id']}")
        if atual.get("ativo") and not atual.get("emUso") and antigo["titulo"].lower().startswith("pré-vistoria"):
            S.delete(BASE + f"/v1/obras/checklists/{antigo['id']}", timeout=60)
            print("modelo antigo desativado:", antigo["titulo"])


if __name__ == "__main__":
    main()
