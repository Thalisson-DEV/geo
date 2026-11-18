"""Documentos das solicitações financeiras pela API (arquivo no storage + vínculo): orçamento e nota fiscal nas
compras; nota fiscal ou recibo e boleto nos pagamentos. Idempotente: pula solicitações que já têm documento.
Uso: python 29_financeiro_documentos.py <token> [base_url]"""
import json
import random
import sys
from datetime import date, datetime, timedelta

import fitz  # PyMuPDF
import requests

TOKEN = sys.argv[1]
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8080/api"
S = requests.Session()
S.headers["Authorization"] = "Bearer " + TOKEN
rnd = random.Random(29)


def get(c, **p):
    r = S.get(BASE + c, params=p, timeout=60)
    r.raise_for_status()
    return r.json() if r.content else None


def pdf(titulo, linhas):
    doc = fitz.open()
    pg = doc.new_page(width=595, height=842)
    pg.draw_rect(fitz.Rect(30, 30, 565, 812), color=(0.3, 0.3, 0.3), width=0.8)
    pg.insert_text((50, 70), titulo, fontsize=15, fontname="hebo")
    y = 110
    for rot, val in linhas:
        pg.insert_text((50, y), rot, fontsize=9, fontname="hebo")
        pg.insert_text((200, y), str(val)[:70], fontsize=9, fontname="helv")
        y += 20
    b = doc.tobytes(deflate=True)
    doc.close()
    return b


def val(s, chave):
    v = (s.get("valores") or {}).get(chave) or {}
    return v.get("valor"), v.get("exibicao")


def enviar(tipo_sol, s, tipo_doc, nome, numero, valor, emissao, venc=None, codigo=None):
    forn = s.get("fornecedor") or {}
    dados = {"tipo": tipo_doc, "numeroDocumento": numero, "fornecedorId": forn.get("id"), "emissorNome": forn.get("nome"),
             "dataEmissao": str(emissao), "dataVencimento": str(venc) if venc else None, "valor": valor,
             "baseId": val(s, "baseId")[0], "processoId": val(s, "processoId")[0], "codigoPagamento": codigo,
             "descricao": (val(s, "descricao")[1] or s.get("formulario", {}).get("titulo"))}
    linhas = [("Emitente", forn.get("nome") or ""), ("Número", numero), ("Emissão", emissao.strftime("%d/%m/%Y")),
              ("Valor", f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")),
              ("Referência", f"Solicitação de {tipo_sol.lower()} nº {s['numero']}")]
    if venc:
        linhas.append(("Vencimento", venc.strftime("%d/%m/%Y")))
    if codigo:
        linhas.append(("Linha digitável", codigo))
    arquivo = pdf({"NOTA_FISCAL": "DANFE - NOTA FISCAL ELETRÔNICA", "BOLETO": "BOLETO BANCÁRIO", "RECIBO": "RECIBO",
                   "ORCAMENTO": "PROPOSTA COMERCIAL / ORÇAMENTO"}[tipo_doc], linhas)
    r = S.post(BASE + "/v1/financeiro/documentos", timeout=60,
               files={"arquivo": (nome, arquivo, "application/pdf"),
                      "dados": ("dados", json.dumps(dados), "application/json")})
    if r.status_code >= 300:
        print("  falhou envio", s["numero"], r.status_code, r.text[:200])
        return
    did = r.json()["id"]
    r = S.patch(BASE + f"/v1/financeiro/documentos/{did}/vincular", params={"tipo": tipo_sol, "solicitacaoId": s["id"]}, timeout=60)
    if r.status_code >= 300:
        print("  falhou vínculo", s["numero"], r.status_code, r.text[:200])


def emissao_de(s):
    d = s.get("dataSubmissao") or s.get("dataCriacao")
    return datetime.fromisoformat(d.replace("Z", "+00:00")).date() - timedelta(days=rnd.randint(0, 2))


# Dados bancários (cifrados) dos fornecedores dos pagamentos; o 30 copia o texto cifrado para as solicitações
fornecedores = {s["fornecedor"]["id"] for s in get("/v1/financeiro/solicitacoes-pagamento", page=0, size=100)["content"] if s.get("fornecedor", {}).get("id")}
for fid in sorted(fornecedores):
    f = get(f"/v1/financeiro/fornecedores/{fid}")
    if f.get("dadosBancarios"):
        continue
    doc = f.get("documento") or ""
    chave = f"{doc[:2]}.{doc[2:5]}.{doc[5:8]}/{doc[8:12]}-{doc[12:14]}" if len(doc) == 14 else doc
    banco = f"PIX (CNPJ) {chave} | Banco {rnd.choice(['001', '004', '104', '237', '341'])}, ag. {rnd.randint(100, 4999):04d}, c/c {rnd.randint(10000, 99999)}-{rnd.randint(0, 9)}"
    r = S.put(BASE + f"/v1/financeiro/fornecedores/{fid}", json={"nomeFantasia": f["nomeFantasia"], "razaoSocial": f.get("razaoSocial"),
                                                                "documento": f.get("documento"), "dadosBancarios": banco,
                                                                "observacoes": f.get("observacoes")}, timeout=60)
    if r.status_code >= 300:
        print("  falhou fornecedor", f["nomeFantasia"], r.status_code, r.text[:150])

n = 0
for tipo_sol, rota in (("COMPRA", "solicitacoes-compra"), ("PAGAMENTO", "solicitacoes-pagamento")):
    for s in get(f"/v1/financeiro/{rota}", page=0, size=100)["content"]:
        if s.get("documentos") or s["status"] in ("RASCUNHO",):
            continue
        valor = float(s.get("valor") or 0)
        em = emissao_de(s)
        if tipo_sol == "COMPRA":
            enviar(tipo_sol, s, "ORCAMENTO", f"orcamento-{s['numero']}.pdf", f"ORC-{2600 + s['numero']}", valor, em)
            if s["status"] == "APROVADO" and val(s, "temNf")[0]:
                enviar(tipo_sol, s, "NOTA_FISCAL", f"nf-{40100 + s['numero']}.pdf", str(40100 + s["numero"]), valor, em + timedelta(days=3))
        else:
            if val(s, "temNf")[0]:
                enviar(tipo_sol, s, "NOTA_FISCAL", f"nf-{val(s, 'numeroNf')[0] or 40000 + s['numero']}.pdf",
                       str(val(s, "numeroNf")[0] or 40000 + s["numero"]), valor, em)
            else:
                enviar(tipo_sol, s, "RECIBO", f"recibo-{s['numero']}.pdf", f"REC-{s['numero']:04d}", valor, em)
            if val(s, "formaPagamento")[0] == "BOLETO":
                venc = date.fromisoformat(val(s, "vencimento")[0]) if val(s, "vencimento")[0] else em + timedelta(days=10)
                linha = "23793." + f"{rnd.randint(10000, 99999)} {rnd.randint(10000, 99999)}.{rnd.randint(100000, 999999)} {rnd.randint(10000, 99999)}.{rnd.randint(100000, 999999)} 1 {rnd.randint(10**13, 10**14 - 1)}"
                enviar(tipo_sol, s, "BOLETO", f"boleto-{s['numero']}.pdf", f"BOL-{s['numero']:04d}", valor, em, venc, linha)
        n += 1
print("solicitações com documentos:", n)
