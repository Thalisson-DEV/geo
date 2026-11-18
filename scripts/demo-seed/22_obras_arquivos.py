"""Arquivos das obras pela API (vão para o armazenamento configurado no backend):
- projeto mestre em PDF desenhado a partir dos pontos e vãos do planejamento (mesmas posições da folha);
- memorial descritivo e planilha de orçamento em PDF para parte das obras;
- fotos de evidência por ponto (modelo "Ficha As Built de ponto") nas obras concluídas e em algumas em execução;
- geração do As Built (PDF) das obras concluídas.
Idempotente: pula o que já existe. Requer PyMuPDF (fitz), Pillow, numpy e requests.
Uso: python 22_obras_arquivos.py <token> [base_url]"""
import io
import math
import random
import sys
import time
from datetime import date, datetime, timedelta

import fitz  # PyMuPDF
import numpy as np
import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont

TOKEN = sys.argv[1]
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8080/api"
S = requests.Session()
S.headers["Authorization"] = "Bearer " + TOKEN


def get(caminho, **params):
    r = S.get(BASE + caminho, params=params, timeout=60)
    r.raise_for_status()
    return r.json() if r.content else None


def post_arquivo(caminho, nome, conteudo, tipo, **campos):
    r = S.post(BASE + caminho, data=campos, files={"arquivo": (nome, conteudo, tipo)}, timeout=120)
    if r.status_code >= 300:
        print("  falhou", caminho, r.status_code, r.text[:200])
        return None
    return r.json() if r.content else True


# ---------------------------------------------------------------- projeto mestre (PDF)
W, H = 1190.55, 841.89  # A3 paisagem


def fonte(page, pos, texto, tam=7, cor=(0.15, 0.15, 0.15), negrito=False):
    page.insert_text(pos, texto, fontsize=tam, color=cor, fontname="hebo" if negrito else "helv")


def projeto_pdf(obra, plan):
    doc = fitz.open()
    pg = doc.new_page(width=W, height=H)
    pontos = {p["id"]: p for p in plan.get("pontos", [])}
    kits = {}
    for k in plan.get("kits", []):
        if k.get("idPonto"):
            kits.setdefault(k["idPonto"], []).append(k["codigo"])
    mt = (plan.get("classeTensao") or "BT") != "BT"
    rnd = random.Random(obra["numero"])

    # moldura
    pg.draw_rect(fitz.Rect(14, 14, W - 14, H - 14), color=(0.2, 0.2, 0.2), width=1.2)
    pg.draw_rect(fitz.Rect(20, 20, W - 20, H - 20), color=(0.2, 0.2, 0.2), width=0.4)

    # vias / estradas acompanhando a rede principal
    ordenados = sorted(pontos.values(), key=lambda p: int(p["numero"]))
    ligados = {frozenset((v["idPontoA"], v["idPontoB"])) for v in plan.get("vaos", [])}
    cadeias, atual = [], []
    for p in ordenados:
        if atual and frozenset((atual[-1]["id"], p["id"])) not in ligados:
            cadeias.append(atual)
            atual = []
        atual.append(p)
    if atual:
        cadeias.append(atual)
    cadeias = [c for c in cadeias if len(c) >= 2]
    if cadeias:
        for cadeia in cadeias:
            for desloc in (-22, 22):
                pts = [fitz.Point(p["x"] * W, p["y"] * H + desloc) for p in cadeia]
                pg.draw_polyline(pts, color=(0.72, 0.72, 0.72), width=0.8, dashes=None if not mt else "[6 3] 0")
        linha = [(p["x"] * W, p["y"] * H) for p in cadeias[0]]
        nome_via = rnd.choice(["RUA DAS FLORES", "AV. SÃO FRANCISCO", "RUA PROJETADA A", "TRAVESSA DO SOL", "RUA BOA ESPERANÇA"]) if not mt \
            else rnd.choice(["ESTRADA VICINAL", "ESTRADA DO POVOADO", "ACESSO À FAZENDA", "ESTRADA MUNICIPAL"])
        x0, y0 = linha[len(linha) // 3]
        fonte(pg, (x0, y0 - 28), nome_via, 7, (0.45, 0.45, 0.45))
        # lotes / propriedades
        for _ in range(14 if not mt else 6):
            x = rnd.uniform(0.08, 0.9) * W
            y = rnd.choice([rnd.uniform(0.17, 0.24), rnd.uniform(0.52, 0.6)]) * H
            w, h = (rnd.uniform(30, 55), rnd.uniform(18, 30)) if not mt else (rnd.uniform(70, 120), rnd.uniform(40, 60))
            pg.draw_rect(fitz.Rect(x, y, x + w, y + h), color=(0.82, 0.82, 0.82), width=0.4)

    # vãos
    cor_rede = (0.75, 0.12, 0.12) if mt else (0.1, 0.3, 0.75)
    for v in plan.get("vaos", []):
        a, b = pontos.get(v["idPontoA"]), pontos.get(v["idPontoB"])
        if not a or not b:
            continue
        pa, pb = fitz.Point(a["x"] * W, a["y"] * H), fitz.Point(b["x"] * W, b["y"] * H)
        pg.draw_line(pa, pb, color=cor_rede, width=1.3 if mt else 1.0, dashes=None if mt else "[4 2] 0")
        if v.get("metragem"):
            fonte(pg, ((pa.x + pb.x) / 2 - 8, (pa.y + pb.y) / 2 - 4), f"{v['metragem']:.0f} m", 6, (0.35, 0.35, 0.35))

    # pontos
    for p in pontos.values():
        c = fitz.Point(p["x"] * W, p["y"] * H)
        cods = kits.get(p["id"], [])
        existente = bool(p.get("barramento")) or "RT-PT" in cods or not cods
        pg.draw_circle(c, 4.2, color=(0, 0, 0), fill=None if existente else (0, 0, 0), width=0.9)
        fonte(pg, (c.x + 6, c.y - 6), "P" + p["numero"], 7.5, (0, 0, 0), True)
        if p.get("barramento"):
            fonte(pg, (c.x + 6, c.y + 3), p["barramento"], 5.5, (0.4, 0.4, 0.4))
        if any(k.startswith("TR-") for k in cods):
            tri = [fitz.Point(c.x - 7, c.y + 18), fitz.Point(c.x + 7, c.y + 18), fitz.Point(c.x, c.y + 8), fitz.Point(c.x - 7, c.y + 18)]
            pg.draw_polyline(tri, color=(0.8, 0.4, 0), width=1)
            kva = next(k for k in cods if k.startswith("TR-"))
            fonte(pg, (c.x + 9, c.y + 18), {"TR-10M": "10 kVA 1F", "TR-45T": "45 kVA 3F", "TR-75T": "75 kVA 3F"}.get(kva, kva), 5.5, (0.8, 0.4, 0))
        if "CF-15" in cods:
            pg.draw_rect(fitz.Rect(c.x - 12, c.y - 4, c.x - 6, c.y + 2), color=(0, 0.5, 0.2), width=0.8)
        if "AT-01" in cods:
            pg.draw_line(fitz.Point(c.x - 3, c.y + 7), fitz.Point(c.x + 3, c.y + 7), color=(0.2, 0.5, 0.2), width=0.8)
        txt = ", ".join(k for k in cods if k not in ("AT-01",))[:34]
        if txt:
            fonte(pg, (c.x - 14, c.y + 13 if not any(k.startswith("TR-") for k in cods) else c.y + 27), txt, 4.8, (0.45, 0.45, 0.45))

    # anotações do planejador como notas
    # legenda
    lx, ly = 32, 36
    pg.draw_rect(fitz.Rect(lx - 6, ly - 12, lx + 190, ly + 70), color=(0.3, 0.3, 0.3), width=0.5)
    fonte(pg, (lx, ly), "LEGENDA", 7, (0, 0, 0), True)
    pg.draw_circle(fitz.Point(lx + 4, ly + 12), 3.5, color=(0, 0, 0), fill=(0, 0, 0))
    fonte(pg, (lx + 14, ly + 14), "Poste a implantar", 6)
    pg.draw_circle(fitz.Point(lx + 4, ly + 25), 3.5, color=(0, 0, 0))
    fonte(pg, (lx + 14, ly + 27), "Poste existente / a substituir", 6)
    pg.draw_line(fitz.Point(lx, ly + 38), fitz.Point(lx + 10, ly + 38), color=cor_rede, width=1.2, dashes=None if mt else "[4 2] 0")
    fonte(pg, (lx + 14, ly + 40), "Rede primária 13,8 kV" if mt else "Rede secundária multiplexada", 6)
    tri = [fitz.Point(lx, ly + 56), fitz.Point(lx + 9, ly + 56), fitz.Point(lx + 4.5, ly + 48), fitz.Point(lx, ly + 56)]
    pg.draw_polyline(tri, color=(0.8, 0.4, 0), width=1)
    fonte(pg, (lx + 14, ly + 55), "Transformador de distribuição", 6)

    # norte
    nx, ny = W - 60, 60
    pg.draw_polyline([fitz.Point(nx, ny - 22), fitz.Point(nx - 7, ny), fitz.Point(nx, ny - 6), fitz.Point(nx + 7, ny), fitz.Point(nx, ny - 22)],
                     color=(0, 0, 0), fill=(0, 0, 0), width=0.6)
    fonte(pg, (nx - 3, ny + 12), "N", 9, (0, 0, 0), True)

    # carimbo
    cx0, cy0, cx1, cy1 = 26, H - 132, 470, H - 26
    pg.draw_rect(fitz.Rect(cx0, cy0, cx1, cy1), color=(0, 0, 0), width=0.8)
    for y in (cy0 + 24, cy0 + 48, cy0 + 72):
        pg.draw_line(fitz.Point(cx0, y), fitz.Point(cx1, y), color=(0, 0, 0), width=0.4)
    pg.draw_line(fitz.Point(cx0 + 300, cy0 + 48), fitz.Point(cx0 + 300, cy1), color=(0, 0, 0), width=0.4)
    fonte(pg, (cx0 + 6, cy0 + 16), "PROJETO DE REDE DE DISTRIBUIÇÃO" + (" - MT 13,8 kV" if mt else " - BT 380/220 V"), 9, (0, 0, 0), True)
    fonte(pg, (cx0 + 6, cy0 + 40), f"OBRA {obra['numero']} - {obra['titulo']}"[:78], 7.5, (0, 0, 0), True)
    fonte(pg, (cx0 + 6, cy0 + 64), f"MUNICÍPIO: {obra.get('municipioNome') or ''} - BA     NOTA: {obra.get('notaObra') or ''}", 6.5)
    fonte(pg, (cx0 + 306, cy0 + 64), "ESCALA: S/E", 6.5)
    fonte(pg, (cx0 + 6, cy0 + 88), "DESENHO: C. MENEZES     VERIFICAÇÃO: M. A. LIMA", 6.5)
    fonte(pg, (cx0 + 306, cy0 + 88), "FOLHA: 01/01", 6.5)
    fonte(pg, (cx0 + 6, cy0 + 100), f"PONTOS: {len(pontos)}     VÃOS: {len(plan.get('vaos', []))}", 6.5)
    fonte(pg, (cx0 + 306, cy0 + 100), "DATA: " + (obra.get("dataInicio") or ""), 6.5)
    buf = doc.tobytes(deflate=True)
    doc.close()
    return buf


def texto_pdf(titulo, paragrafos):
    doc = fitz.open()
    pg = doc.new_page(width=595, height=842)
    pg.insert_text((50, 70), titulo, fontsize=14, fontname="hebo")
    y = 100
    for par in paragrafos:
        if y > 760:
            pg = doc.new_page(width=595, height=842)
            y = 60
        rect = fitz.Rect(50, y, 545, y + 160)
        sobra = pg.insert_textbox(rect, par, fontsize=10, fontname="helv", align=0)
        y += 160 - max(sobra, 0) + 12
    buf = doc.tobytes(deflate=True)
    doc.close()
    return buf


def memorial(obra, plan):
    kits = sorted({k["codigo"] for k in plan.get("kits", [])})
    return texto_pdf(f"MEMORIAL DESCRITIVO - OBRA {obra['numero']}", [
        f"1. OBJETO\n{obra['titulo']}, no município de {obra.get('municipioNome') or ''} - BA. O serviço compreende a execução da rede conforme o "
        f"projeto aprovado, com {len(plan.get('pontos', []))} pontos e {len(plan.get('vaos', []))} vãos.",
        "2. NORMAS\nA execução segue as normas técnicas da distribuidora para redes aéreas de distribuição urbanas e rurais, a NR-10 e a NR-35.",
        "3. MATERIAIS E ESTRUTURAS\nKits construtivos previstos: " + ", ".join(kits) + ". Os materiais serão retirados no almoxarifado da base "
        "mediante solicitação técnica vinculada à obra.",
        "4. EXECUÇÃO\nA obra será executada por frentes programadas. Os pontos com desligamento dependem de autorização do centro de operação "
        "com antecedência mínima de 72 horas. Ao final de cada frente a equipe registra as fichas As Built e as fotos de cada ponto.",
        "5. ENTREGA\nA obra será entregue com o As Built aprovado pelo fiscal, a medição final e a devolução dos materiais retirados.",
    ])


def orcamento_pdf(obra, plan):
    linhas = {}
    for k in plan.get("kits", []):
        for it in k.get("itens", []):
            if it.get("tipo") != "SERVICO":
                continue
            l = linhas.setdefault(it["codigo"], [it["descricao"], it.get("unidade") or "UN", 0.0, it.get("valorUnitario") or 0])
            l[2] += it.get("quantidadePrevista") or 0
    doc = fitz.open()
    pg = doc.new_page(width=842, height=595)
    pg.insert_text((40, 50), f"PLANILHA DE ORÇAMENTO - OBRA {obra['numero']}", fontsize=13, fontname="hebo")
    pg.insert_text((40, 68), obra["titulo"][:90], fontsize=9, fontname="helv")
    y = 100
    for cab, x in (("CÓDIGO", 40), ("SERVIÇO", 110), ("UN", 470), ("QTD", 520), ("V. UNIT.", 600), ("TOTAL", 700)):
        pg.insert_text((x, y), cab, fontsize=8, fontname="hebo")
    total = 0
    for cod, (desc, un, q, vu) in sorted(linhas.items()):
        y += 16
        if y > 560:
            break
        t = q * vu
        total += t
        for txt, x in ((cod, 40), (desc[:55], 110), (un, 470), (f"{q:,.2f}", 520), (f"{vu:,.2f}", 600), (f"{t:,.2f}", 700)):
            pg.insert_text((x, y), txt, fontsize=8, fontname="helv")
    y += 22
    pg.insert_text((600, y), "TOTAL", fontsize=9, fontname="hebo")
    pg.insert_text((700, y), f"R$ {total:,.2f}", fontsize=9, fontname="hebo")
    buf = doc.tobytes(deflate=True)
    doc.close()
    return buf


# ---------------------------------------------------------------- fotos de campo (JPEG)
def foto(tipo, semente, rodape):
    rnd = random.Random(semente)
    w, h = 1280, 960
    img = Image.new("RGB", (w, h))
    px = np.zeros((h, w, 3), dtype=np.float32)
    horizonte = int(h * rnd.uniform(0.52, 0.62)) if tipo != "foto-aterramento" else int(h * 0.18)
    ceu_top = np.array([88, 145, 205]) + rnd.uniform(-10, 10)
    ceu_bas = np.array([196, 220, 238])
    for y in range(horizonte):
        t = y / max(horizonte, 1)
        px[y, :, :] = ceu_top * (1 - t) + ceu_bas * t
    chao = np.array([168, 140, 98]) + rnd.uniform(-15, 15)
    for y in range(horizonte, h):
        t = (y - horizonte) / max(h - horizonte, 1)
        px[y, :, :] = chao * (0.92 + 0.12 * t)
    px += np.random.default_rng(semente).normal(0, 7, px.shape)
    img = Image.fromarray(np.clip(px, 0, 255).astype("uint8"))
    d = ImageDraw.Draw(img)
    # nuvens
    for _ in range(rnd.randint(2, 5)):
        cx, cy = rnd.randint(0, w), rnd.randint(30, max(40, horizonte // 2))
        for _ in range(6):
            r = rnd.randint(25, 60)
            ox, oy = rnd.randint(-70, 70), rnd.randint(-15, 15)
            d.ellipse((cx + ox - r, cy + oy - r * 0.6, cx + ox + r, cy + oy + r * 0.6), fill=(238, 242, 246))
    # vegetação de caatinga no horizonte
    if tipo != "foto-aterramento":
        for _ in range(60):
            x = rnd.randint(-20, w)
            r = rnd.randint(12, 38)
            g = rnd.randint(85, 120)
            d.ellipse((x - r, horizonte - r * 1.2, x + r, horizonte + r * 0.4), fill=(g - 30, g, g - 45))
        # estrada
        d.polygon([(w * 0.38, h), (w * 0.62, h), (w * 0.52, horizonte + 4), (w * 0.48, horizonte + 4)], fill=(150, 126, 92))
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    d = ImageDraw.Draw(img)
    cinza = (172, 170, 165)
    if tipo == "foto-geral":
        base_x = rnd.randint(int(w * 0.35), int(w * 0.6))
        topo = int(h * 0.12)
        base_y = int(h * 0.9)
        d.polygon([(base_x - 16, base_y), (base_x + 16, base_y), (base_x + 8, topo), (base_x - 8, topo)], fill=cinza, outline=(120, 120, 118))
        d.rectangle((base_x - 120, topo + 30, base_x + 120, topo + 44), fill=(160, 158, 150), outline=(110, 110, 110))
        for dx in (-100, 0, 100):
            d.rectangle((base_x + dx - 6, topo + 12, base_x + dx + 6, topo + 30), fill=(225, 225, 220))
            for lado in (-1, 1):
                pts = [(base_x + dx + lado * t, topo + 14 + 0.00012 * t * t) for t in range(0, w, 20)]
                d.line(pts, fill=(55, 55, 55), width=2)
        d.rectangle((base_x - 60, topo + 140, base_x + 60, topo + 150), fill=(150, 148, 140))
        for t in range(0, w, 20):
            d.point((t, topo + 150 + 0.0001 * (t - base_x) ** 2), fill=(40, 40, 40))
        d.line([(t, topo + 150 + 0.00009 * (t - base_x) ** 2) for t in range(0, w, 10)], fill=(30, 30, 30), width=3)
    elif tipo == "foto-estrutura":
        cx = w // 2 + rnd.randint(-80, 80)
        d.polygon([(cx - 40, h), (cx + 40, h), (cx + 30, int(h * 0.15)), (cx - 30, int(h * 0.15))], fill=cinza, outline=(120, 120, 118))
        y0 = int(h * 0.3)
        d.rectangle((cx - 420, y0, cx + 420, y0 + 46), fill=(165, 163, 155), outline=(105, 105, 100))
        for dx in (-360, 0, 360):
            d.rectangle((cx + dx - 18, y0 - 90, cx + dx + 18, y0), fill=(232, 232, 228), outline=(150, 150, 150))
            for k in range(5):
                d.ellipse((cx + dx - 30, y0 - 85 + k * 17, cx + dx + 30, y0 - 75 + k * 17), fill=(215, 215, 210))
            d.line([(0, y0 - 95 + rnd.randint(-6, 6)), (w, y0 - 95 + rnd.randint(-6, 6))], fill=(45, 45, 45), width=4)
        d.rectangle((cx - 55, y0 + 46, cx - 45, y0 + 160), fill=(120, 120, 115))
        d.rectangle((cx + 45, y0 + 46, cx + 55, y0 + 160), fill=(120, 120, 115))
    else:  # aterramento
        cx = rnd.randint(int(w * 0.3), int(w * 0.6))
        d.polygon([(cx - 70, 0), (cx + 70, 0), (cx + 80, int(h * 0.55)), (cx - 80, int(h * 0.55))], fill=cinza, outline=(120, 120, 118))
        d.ellipse((cx - 200, int(h * 0.5), cx + 260, int(h * 0.75)), fill=(120, 96, 66))
        for k in range(3):
            hx = cx + 160 + k * 120
            d.rectangle((hx - 6, int(h * 0.62), hx + 6, int(h * 0.78)), fill=(184, 115, 51))
            d.line([(cx + 40, int(h * 0.45)), (hx, int(h * 0.64))], fill=(196, 120, 60), width=5)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    d = ImageDraw.Draw(img)
    try:
        f = ImageFont.truetype("arial.ttf", 26)
    except OSError:
        f = ImageFont.load_default()
    y = h - 30 * len(rodape) - 20
    for linha in rodape:
        d.text((24 + 2, y + 2), linha, font=f, fill=(0, 0, 0))
        d.text((24, y), linha, font=f, fill=(255, 255, 255))
        y += 30
    out = io.BytesIO()
    img.save(out, "JPEG", quality=82)
    return out.getvalue()


LEGENDAS = {
    "foto-geral": ["Vista geral do ponto após a implantação", "Ponto concluído, área limpa e sinalização retirada", "Vista do trecho a partir da via"],
    "foto-estrutura": ["Estrutura montada e condutores regulados", "Cruzeta e isoladores instalados conforme o projeto", "Detalhe da estrutura no topo do poste"],
    "foto-aterramento": ["Hastes de aterramento cravadas e conectadas", "Descida de aterramento conectada às hastes"],
}


def main():
    tipos = {t["nome"]: t["id"] for t in get("/v1/obras/tipos-anexos/todos-ativos")}
    obras = get("/v1/obras", page=0, size=300)["content"]
    print("obras:", len(obras))
    concluidas = []
    for i, o in enumerate(sorted(obras, key=lambda x: x["numero"])):
        plan = get(f"/v1/obras/{o['id']}/planejamento")
        if not plan.get("pontos"):
            continue
        doc = get(f"/v1/obras/{o['id']}/documentacao")
        anexos = {a.get("nomeArquivo") for a in (get(f"/v1/obras/{o['id']}/anexos") or [])}
        if not doc.get("temProjetoMestre"):
            pdf = projeto_pdf(o, plan)
            ok = post_arquivo(f"/v1/obras/{o['id']}/planejamento/projeto-mestre", f"projeto-{o['numero']}.pdf", pdf, "application/pdf",
                              idTipoAnexo=tipos["PROJETO CAD"])
            print("mestre", o["numero"], "ok" if ok else "erro")
        if i % 3 == 0 and f"memorial-descritivo-{o['numero']}.pdf" not in anexos:
            post_arquivo(f"/v1/obras/{o['id']}/anexos", f"memorial-descritivo-{o['numero']}.pdf", memorial(o, plan), "application/pdf",
                         idTipoAnexo=tipos["MEMORIAL DESCRITIVO"], observacoes="Memorial aprovado junto com o projeto.")
        if i % 4 == 1 and f"orcamento-{o['numero']}.pdf" not in anexos:
            post_arquivo(f"/v1/obras/{o['id']}/anexos", f"orcamento-{o['numero']}.pdf", orcamento_pdf(o, plan), "application/pdf",
                         idTipoAnexo=tipos["ORÇAMENTO"], observacoes="Planilha orçamentária do lote.")

        status = (o.get("statusNome") or o.get("status") or "").upper()
        com_fotos = "CONCLU" in status or ("EXECU" in status and i % 3 == 0)
        if not com_fotos:
            continue
        sem_evid = set(doc.get("asBuilt", {}).get("pontosSemEvidencia") or [])
        n = 0
        for p in doc.get("pontos", []):
            ficha = p.get("ficha")
            if not p.get("executado") or not ficha or p["numero"] not in sem_evid:
                continue
            itens = ["foto-geral", "foto-estrutura"]
            if any(r.get("idPergunta") == "ab-aterramento" and r.get("selecionadas") == ["Sim"] for r in ficha["respostas"]["itens"]):
                itens.append("foto-aterramento")
            for it in itens:
                quando = datetime.now() - timedelta(days=random.randint(3, 40), minutes=random.randint(0, 600))
                rod = [quando.strftime("%d/%m/%Y %H:%M"), f"Obra {o['numero']} - P{p['numero']}", o.get("municipioNome") or ""]
                img = foto(it, hash((o["numero"], p["numero"], it)) & 0xFFFFFFFF, [r for r in rod if r])
                post_arquivo(f"/v1/obras/{o['id']}/documentacao/pontos/{p['id']}/evidencias", f"IMG_{quando:%Y%m%d_%H%M%S}.jpg", img, "image/jpeg",
                             idModelo=ficha["idModelo"], idItem=it, legenda=random.choice(LEGENDAS[it]))
                n += 1
        print("evidências", o["numero"], n)
        if "CONCLU" in status:
            concluidas.append(o)

    for o in concluidas:
        doc = get(f"/v1/obras/{o['id']}/documentacao")
        if doc.get("documentos"):
            continue
        r = S.post(BASE + f"/v1/obras/{o['id']}/documentacao/as-built", timeout=60)
        print("as built", o["numero"], r.status_code, r.text[:120] if r.status_code >= 300 else "")
        time.sleep(1.5)


if __name__ == "__main__":
    main()
