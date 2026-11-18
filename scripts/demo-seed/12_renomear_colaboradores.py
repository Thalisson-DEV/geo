"""Renomeia colaboradores com nome de teste pela API (o nome é cifrado no banco).
Uso: python 12_renomear_colaboradores.py <token> [base_url]"""
import json
import sys
import urllib.request

TOKEN = sys.argv[1]
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8080/api"
NOMES = [
    "JOSÉ CARLOS DOS SANTOS", "MARIA APARECIDA LIMA", "ANTÔNIO MARCOS OLIVEIRA", "FRANCISCO DAS CHAGAS SILVA",
    "JOÃO PAULO NASCIMENTO", "RAIMUNDO NONATO SOUZA", "ANA CLÁUDIA FERREIRA", "PAULO ROBERTO ALMEIDA",
    "EDVALDO PEREIRA COSTA", "CÍCERO ALVES BARBOSA", "LUCIANO RIBEIRO MENDES", "FÁBIO JÚNIOR CARVALHO",
    "MARCOS ANTÔNIO ROCHA", "SEBASTIÃO GOMES DIAS", "JOSIVALDO SANTANA", "ADRIANO MOREIRA LOPES",
    "GILVAN BATISTA CRUZ", "RENATO SOARES VIEIRA", "VALDEMIR CARDOSO", "ELIENE MARIA DOS REIS",
    "DIEGO FERNANDES ARAÚJO", "WASHINGTON LUÍS PINTO", "JAILSON MONTEIRO", "CARLOS EDUARDO MATOS",
    "ROBSON TEIXEIRA NUNES", "JOSENILDO CORREIA", "ELISÂNGELA RAMOS", "UBIRATAN MACEDO", "IVANILDO FREITAS",
    "RAFAEL AUGUSTO MOURA", "GENIVALDO BISPO", "SANDRA REGINA CAMPOS", "MANOEL MESSIAS ANDRADE",
    "TIAGO HENRIQUE BRITO", "EVERALDO PASSOS", "JOSUÉ CONCEIÇÃO", "ROSÂNGELA AZEVEDO", "ARNALDO QUEIROZ",
    "VINÍCIUS SAMPAIO", "LEANDRO FONSECA", "DEJAIR MARQUES", "ÉRICA SILVEIRA",
]


def chamar(metodo, caminho, corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(BASE + caminho, data=dados, method=metodo, headers={
        "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        txt = r.read()
        return json.loads(txt) if txt else None


lista = chamar("GET", "/v1/rh/colaboradores?page=0&size=200")["content"]
i = 0
for c in lista:
    nome = (c.get("nomeCompleto") or "").upper()
    if "TESTE" not in nome and "FICT" not in nome:
        continue
    novo = NOMES[i % len(NOMES)]
    i += 1
    partes = novo.split()
    try:
        chamar("PUT", f"/v1/rh/colaboradores/{c['id']}", {
            "primeiroNome": partes[0], "ultimoNome": partes[-1], "nomeCompleto": novo,
            "idProcesso": c["processo"]["id"], "idBaseOperacional": c["baseOperacional"]["id"],
            "idFuncao": c["funcao"]["id"]})
        print("ok", nome, "->", novo)
    except Exception as e:  # noqa: BLE001
        print("falhou", nome, e)
print("renomeados:", i)
