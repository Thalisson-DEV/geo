"""Cria os usuários da equipe técnica/administrativa usados nos históricos (programação, medição, comunicados).
Login e vínculo com colaborador passam pela API (campos cifrados). Idempotente: pula logins que já existem.
Uso: python 15_usuarios_operacao.py <token> [base_url]"""
import json
import secrets
import sys
import urllib.error
import urllib.request

TOKEN = sys.argv[1]
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8080/api"

# login, e-mail, perfil, nome do colaborador a vincular (ou None)[, tipo de usuário]
USUARIOS = [
    ("CMENEZES", "carla.menezes@nexo.app", "BACKOFFICE_TECNICO", None),
    ("RTAVARES", "rodrigo.tavares@nexo.app", "BACKOFFICE_TECNICO", None),
    ("PNOVAES", "patricia.novaes@nexo.app", "BACKOFFICE_TECNICO", None),
    ("MALIMA", "maria.lima@nexo.app", "COORDENADOR_TECNICO", "MARIA APARECIDA LIMA"),
    ("JCSANTOS", "jose.santos@nexo.app", "COORDENADOR_TECNICO", "JOSÉ CARLOS DOS SANTOS"),
    ("GALMEIDA", "gerson.almeida@nexo.app", "BACKOFFICE_ALMOXARIFADO", None),
    ("LREIS", "luana.reis@nexo.app", "COORDENADOR_SESMT", None),
    ("FBRAGA", "fernando.braga@nexo.app", "ADMINISTRADOR", None),
    ("BFREITAS", "bruna.freitas@nexo.app", "BACKOFFICE_COMERCIAL", None),
    ("TSOUZA", "tiago.souza@nexo.app", "COORDENADOR_COMERCIAL", None),
    ("RPIRES", "renata.pires@nexo.app", "GESTOR_FROTA", None),
    ("DLEAL", "danilo.leal@nexo.app", "OPERACAO_FROTA", None),
    ("MVIANA", "marcela.viana@nexo.app", "BACKOFFICE_SESMT", None),
    ("KSANTANA", "kleber.santana@nexo.app", "OFICINA_FROTA", None),
    ("FCSILVA", "francisco.silva@nexo.app", "BACKOFFICE_TECNICO", "FRANCISCO DAS CHAGAS SILVA", "CAMPO"),
    ("PRALMEIDA", "paulo.almeida@nexo.app", "BACKOFFICE_TECNICO", "PAULO ROBERTO ALMEIDA", "CAMPO"),
    ("FCARVALHO", "fabio.carvalho@nexo.app", "BACKOFFICE_TECNICO", "FÁBIO JÚNIOR CARVALHO", "CAMPO"),
    ("ALOPES", "adriano.lopes@nexo.app", "BACKOFFICE_TECNICO", "ADRIANO MOREIRA LOPES", "CAMPO"),
    ("EMREIS", "eliene.reis@nexo.app", "BACKOFFICE_TECNICO", "ELIENE MARIA DOS REIS", "CAMPO"),
    ("CEMATOS", "carlos.matos@nexo.app", "BACKOFFICE_TECNICO", "CARLOS EDUARDO MATOS", "CAMPO"),
    ("UMACEDO", "ubiratan.macedo@nexo.app", "BACKOFFICE_TECNICO", "UBIRATAN MACEDO", "CAMPO"),
    ("SRCAMPOS", "sandra.campos@nexo.app", "BACKOFFICE_TECNICO", "SANDRA REGINA CAMPOS", "CAMPO"),
    ("JOSUEC", "josue.conceicao@nexo.app", "BACKOFFICE_TECNICO", "JOSUÉ CONCEIÇÃO", "CAMPO"),
]


def chamar(metodo, caminho, corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(BASE + caminho, data=dados, method=metodo, headers={
        "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        txt = r.read()
        return json.loads(txt) if txt else None


def lista(caminho):
    r = chamar("GET", caminho)
    return r["content"] if isinstance(r, dict) and "content" in r else r


perfis = {p["nome"]: p["id"] for p in lista("/v1/iam/perfis?page=0&size=100")}
existentes = {u["login"].upper() for u in lista("/v1/iam/usuarios?page=0&size=500")}
colabs = {(c.get("nomeCompleto") or "").upper(): c["id"] for c in lista("/v1/rh/colaboradores?page=0&size=500")}

for login, email, perfil, colab, *tipo in USUARIOS:
    if login in existentes:
        print("existe", login)
        continue
    corpo = {"login": login, "email": email, "senha": secrets.token_urlsafe(18) + "!A1",
             "idPerfil": perfis[perfil], "idColaborador": colabs.get(colab) if colab else None,
             "tipo": tipo[0] if tipo else "ADMINISTRATIVO"}
    try:
        chamar("POST", "/v1/iam/usuarios", corpo)
        print("criado", login)
    except urllib.error.HTTPError as e:
        print("falhou", login, e.code, e.read()[:300])
