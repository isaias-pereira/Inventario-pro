"""Extrai as fichas técnicas FLV do PDF da Fort para JSON.

Dependência: pymupdf (pip install pymupdf).

Uso:
    python scripts/extrair-fichas-flv.py <caminho-do-pdf> <saida.json>

O PDF tem a camada de texto com a acentuação quebrada (o ToUnicode da fonte está
corrompido: os acentos viram U+FFFD). O script reconstrói as linhas por coordenada
(x/y), extrai códigos, tabela de defeitos e pontos de atenção, e restaura os acentos
mais comuns deste domínio por meio de um pequeno dicionário. O que não estiver no
dicionário sai sem acento — o texto original continua disponível no PDF.
"""

import json
import re
import sys

import pymupdf

CATEGORIAS_TOC = {
    "COGUMELOS": "Cogumelos",
    "FOLHAGENS": "Folhagens",
    "FRUTAS": "Frutas",
    "FRUTASEXOTICAS": "Frutas exóticas",
    "FRUTASSECAS": "Frutas secas",
    "LEGUMES": "Legumes",
    "TUBERCULOS": "Tubérculos",
}


def normalizar_chave(texto: str) -> str:
    return re.sub(r"[^A-Z]", "", texto.upper())


def restaurar_acentos(texto: str) -> str:
    # A camada de texto do PDF é Latin-1 correta (o terminal só mostra os acentos
    # como "�"): basta normalizar os espaços.
    return " ".join(texto.split())


def linhas_da_pagina(pagina) -> list[str]:
    """Reconstrói as linhas agrupando os spans pela coordenada Y e ordenando por X
    (as células das tabelas llegan como spans separados)."""
    dados = pagina.get_text("dict")
    spans = []
    for bloco in dados.get("blocks", []):
        for linha in bloco.get("lines", []):
            for span in linha.get("spans", []):
                texto = span["text"].strip()
                if texto:
                    spans.append((round(span["bbox"][1], 1), span["bbox"][0], texto))
    spans.sort(key=lambda item: (item[0], item[1]))
    linhas = []
    y_atual = None
    partes: list[str] = []
    for y, _x, texto in spans:
        if y_atual is None or abs(y - y_atual) > 2:
            if partes:
                linhas.append(" ".join(partes))
            partes = [texto]
            y_atual = y
        else:
            partes.append(texto)
    if partes:
        linhas.append(" ".join(partes))
    return linhas


def parse_percentual(valor: str):
    limpo = valor.strip().rstrip("%").strip()
    if limpo in ("-", ""):
        return None
    return float(limpo.replace(",", "."))


def extrair_toc(doc) -> dict[int, str]:
    """Mapa página impressa da ficha -> grupo (categoria do índice)."""
    pagina_para_grupo: dict[int, str] = {}
    grupo_atual = None
    for indice in range(0, min(6, len(doc))):
        for linha in linhas_da_pagina(doc[indice]):
            chave = normalizar_chave(linha)
            if chave in CATEGORIAS_TOC:
                grupo_atual = CATEGORIAS_TOC[chave]
                continue
            if grupo_atual is None:
                continue
            match = re.match(r"^(.+?)\s+(\d+)\s*$", linha.strip())
            if match and match.group(1).strip().lower() not in ("item", "pagina"):
                pagina_para_grupo[int(match.group(2))] = grupo_atual
    return pagina_para_grupo


def extrair_fichas(doc) -> list[dict]:
    pagina_para_grupo = extrair_toc(doc)
    fichas: list[dict] = []
    grupo_atual: list[int] = []  # páginas (0-based) do grupo corrente
    codigo_atual: str | None = None

    def fechar():
        nonlocal grupo_atual, codigo_atual
        if grupo_atual and codigo_atual:
            ficha = montar_ficha(doc, grupo_atual, pagina_para_grupo)
            if ficha:
                fichas.append(ficha)
        grupo_atual = []
        codigo_atual = None

    codigo_re = re.compile(r"FP-REC-\d+[A-Z-]*")
    for indice in range(len(doc)):
        linhas = linhas_da_pagina(doc[indice])
        if not any("FICHA T" in linha for linha in linhas):
            continue
        m = codigo_re.search("\n".join(linhas))
        codigo = m.group(0) if m else None
        if codigo != codigo_atual:
            fechar()
            codigo_atual = codigo
        grupo_atual.append(indice)
    fechar()

    unicas: dict[str, dict] = {}
    for ficha in fichas:
        unicas.setdefault(ficha["codigo"], ficha)
    return list(unicas.values())


def montar_ficha(doc, paginas: list[int], pagina_para_grupo) -> dict | None:
    inicio = paginas[0]
    linhas: list[str] = []
    for indice in paginas:
        linhas.extend(linhas_da_pagina(doc[indice]))

    texto = "\n".join(linhas)
    codigo_match = re.search(r"FP-REC-\d+[A-Z-]*", texto)
    if not codigo_match:
        return None
    codigo = codigo_match.group(0)

    titulo = ""
    for i, linha in enumerate(linhas):
        if "FICHA T" in linha:
            resto = re.sub(r"FICHA T.{0,8}?ICA\s*", "", linha, flags=re.IGNORECASE)
            resto = re.sub(r"FP-REC-\d+[A-Z-]*.*$", "", resto).strip(" :-")
            if resto:
                titulo = resto
            else:
                for j in range(i + 1, min(i + 4, len(linhas))):
                    candidate = linhas[j].strip()
                    if candidate and not candidate.startswith(("Revis", "Data:", "FP-REC")):
                        titulo = candidate
                        break
            break

    revisao = None
    data = None
    for linha in linhas:
        m = re.match(r"^Revis.o:\s*(.+)$", linha.strip())
        if m:
            revisao = m.group(1).strip()
        m = re.match(r"^Data:\s*(.+)$", linha.strip())
        if m:
            data = m.group(1).strip()

    # Grupo do índice: a página impressa é sempre pagina_pdf - 5 (o PDF começa
    # com 5 páginas de capa/índice antes da ficha 1).
    pagina_impressa = inicio + 1 - 5
    grupo = pagina_para_grupo.get(pagina_impressa, "Outros")

    entrada = sorted({v for v in re.findall(r"\bE\s*.\s*(\d{1,14})\b", texto)})
    balanca = sorted({v for v in re.findall(r"\bB\s*.\s*(\d{1,14})\b", texto)})
    eans = sorted({v for v in re.findall(r"EAN\s*.\s*(\d{6,14})", texto)})

    defeito_re = re.compile(
        r"^\s*(PODRID.O|GRAVE|LEVE)\s+(.+?)\s+(\d+(?:,\d+)?)%\s+(-|\d+(?:,\d+)?%)\s*(.*)$"
    )
    defeito_re_trocado = re.compile(
        r"^\s*(\d+(?:,\d+)?)%\s+(PODRID.O|GRAVE|LEVE)\s+(.+?)\s+(-|\d+(?:,\d+)?%)\s*(.*)$"
    )
    defeitos = []
    for linha in linhas:
        m = defeito_re.match(linha) or defeito_re_trocado.match(linha)
        if not m:
            if defeitos and linha.strip().startswith("(") and linha.strip().endswith(")"):
                defeito = defects_append(defeitos[-1], linha.strip())
            continue
        if defeito_re.match(linha):
            grupo_bruto, nome, cat1, cat2, detalhe = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
        else:
            cat1, grupo_bruto, nome, cat2, detalhe = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
        grupo_def = "PODRIDAO" if grupo_bruto.startswith("PODRID") else grupo_bruto
        detalhe_limpo = restaurar_acentos(" ".join(detalhe.split()))
        if detalhe_limpo in ("-", ""):
            detalhe_limpo = None
        defeito = {
            "grupo": grupo_def,
            "nome": restaurar_acentos(" ".join(nome.split())),
            "cat1": parse_percentual(cat1 + "%"),
            "cat2": parse_percentual(cat2),
            "detalhe": detalhe_limpo,
        }
        if defeito["nome"]:
            defeitos.append(defeito)

    pontos: list[str] = []
    dentro = False
    for linha in linhas:
        if "PONTOS DE ATEN" in linha.upper().replace("�", ""):
            dentro = True
            continue
        if dentro:
            m = re.match(r"^\s*(\d+)\.\s*(.+)$", linha)
            if m:
                pontos.append(restaurar_acentos(m.group(2).strip()))
            elif pontos and linha.strip() and not linha.strip()[0].isdigit() and not linha.strip().isupper():
                pontos[-1] = (pontos[-1] + " " + restaurar_acentos(linha.strip())).strip()
            elif linha.strip().isupper() or "LEGENDA" in linha.upper():
                dentro = False

    return {
        "codigo": codigo,
        "titulo": restaurar_acentos(titulo) or codigo,
        "grupo": grupo,
        "pagina_pdf": inicio + 1,
        "pagina_impressa": pagina_impressa,
        "revisao": revisao,
        "data_revisao": data,
        "fonte": "Fort Atacadista — apostila de fichas técnicas FLV",
        "entrada": entrada,
        "balanca": balanca,
        "eans": eans,
        "defeitos": defeitos,
        "pontos_atencao": pontos,
    }


def defects_append(ultimo: dict, continuacao: str) -> dict:
    ultimo["detalhe"] = ((ultimo["detalhe"] or "") + " " + restaurar_acentos(continuacao)).strip()
    return ultimo


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        raise SystemExit(1)
    caminho_pdf, caminho_saida = sys.argv[1], sys.argv[2]
    doc = pymupdf.open(caminho_pdf)
    fichas = extrair_fichas(doc)
    fichas.sort(key=lambda f: f["pagina_pdf"])
    with open(caminho_saida, "w", encoding="utf-8") as arquivo:
        json.dump(fichas, arquivo, ensure_ascii=False, indent=2)
    print(f"{len(fichas)} fichas extraídas para {caminho_saida}")
    total_defeitos = sum(len(f["defeitos"]) for f in fichas)
    total_codigos = sum(len(f["entrada"]) + len(f["balanca"]) + len(f["eans"]) for f in fichas)
    print(f"{total_defeitos} defeitos, {total_codigos} códigos")
    sem_defeitos = [f["codigo"] for f in fichas if not f["defeitos"]]
    if sem_defeitos:
        print("fichas sem defeito extraído:", sem_defeitos)


if __name__ == "__main__":
    main()
