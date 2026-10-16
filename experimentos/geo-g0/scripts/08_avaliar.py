"""Métricas: nível de acerto (número / rua / bairro-cidade / não achou) e erro em metros (mediana, p90, pior),
Grande Vitória × interior, por geocodificador e por variante da consulta. Escreve dados/metricas.json e um resumo."""
import json
import os
import sys
from collections import Counter, defaultdict

from comum import DADOS, RAIZ, haversine, mediana, percentil
from consultas import SEM_NUMERO

gab = json.load(open(os.path.join(RAIZ, "gabarito", "gabarito.json")))
por_id = {g["id"]: g for g in gab}
GEOCODIFICADORES = {}


def nivel_nominatim(r):
    if not r or isinstance(r, dict) or not isinstance(r, list):
        return "nao", None, None
    if not r:
        return "nao", None, None
    x = r[0]
    a = x.get("address", {})
    lat, lon = float(x["lat"]), float(x["lon"])
    if a.get("house_number"):
        return "numero", lat, lon
    if a.get("road") or x.get("category") == "highway":
        return "rua", lat, lon
    return "bairro_cidade", lat, lon


def nivel_photon(r):
    if not r or not isinstance(r, dict) or not r.get("features"):
        return "nao", None, None
    f = r["features"][0]
    p = f["properties"]
    lon, lat = f["geometry"]["coordinates"]
    if p.get("housenumber"):
        return "numero", lat, lon
    if p.get("osm_key") == "highway" or (p.get("street") and p.get("osm_key") not in ("place", "boundary")):
        return "rua", lat, lon
    return "bairro_cidade", lat, lon


def nivel_cnefe(r):
    n = r["nivel"]
    if n == "numero":
        return "numero", r["lat"], r["lon"]
    if n == "numero_interpolado":
        return "numero_interp", r["lat"], r["lon"]
    if n == "rua":
        return "rua", r["lat"], r["lon"]
    if n in ("cep", "bairro"):
        return "bairro_cidade", r["lat"], r["lon"]
    return "nao", None, None


def carregar(nome, arq, fn_nivel, estrutura):
    caminho = os.path.join(DADOS, arq)
    if not os.path.exists(caminho):
        return
    dados = json.load(open(caminho))
    if estrutura == "publicos":
        dados = dados[nome]
    elif estrutura.startswith("publicos_chave_"):
        dados = dados[estrutura.removeprefix("publicos_chave_")]
    GEOCODIFICADORES[nome] = {int(i): {v: fn_nivel(r) for v, r in vs.items()} for i, vs in dados.items()}


# Serviços públicos limitados ao ES (como na produção) e, para comparar, sem limite
carregar("nominatim", "resultados_publicos_es.json", nivel_nominatim, "publicos")
carregar("photon", "resultados_publicos_es.json", nivel_photon, "publicos")
carregar("cnefe", "resultados_cnefe.json", nivel_cnefe, "cnefe")
carregar("nominatim_sem_limite", "resultados_publicos.json", nivel_nominatim, "publicos_chave_nominatim")
carregar("photon_sem_limite", "resultados_publicos.json", nivel_photon, "publicos_chave_photon")
for extra in sys.argv[1:]:  # ex.: nominatim_local=resultados_nominatim_local.json
    nome, arq = extra.split("=")
    carregar(nome, arq, nivel_nominatim if "nominatim" in nome else nivel_photon, "publicos_chave_" + ("nominatim" if "nominatim" in nome else "photon"))

# BrasilAPI v2 (centro do CEP) como referência de "só CEP"
cep = json.load(open(os.path.join(DADOS, "cep.json")))
GEOCODIFICADORES["brasilapi_cep"] = {}
for i, v in cep.items():
    b = v.get("brasilapi") or {}
    c = ((b.get("location") or {}).get("coordinates") or {})
    if c.get("latitude"):
        GEOCODIFICADORES["brasilapi_cep"][int(i)] = {"cep": ("bairro_cidade", float(c["latitude"]), float(c["longitude"]))}

VARIANTES = ["cheio", "limpo", "sem_tipo", "sem_tipo_sem_numero", "so_cidade", "cep_numero", "cep_completado", "estruturada"]
saida = {}
for nome, por_item in GEOCODIFICADORES.items():
    saida[nome] = {}
    for var in (["cep"] if nome == "brasilapi_cep" else [v for v in VARIANTES if any(v in x for x in por_item.values())]):
        for recorte in ("todos", "grande_vitoria", "interior"):
            niveis = Counter()
            erros = []
            for gid, g in por_id.items():
                if recorte != "todos" and g["grupo"] != recorte:
                    continue
                n, lat, lon = (por_item.get(gid, {}).get(var) or ("nao", None, None))
                if var == "so_cidade" and n != "nao":
                    n = "bairro_cidade"  # o resultado de "só a cidade" é, por definição, aproximado
                niveis[n] += 1
                if lat is not None:
                    erros.append(haversine(g["lat"], g["lon"], lat, lon))
            total = sum(niveis.values())
            saida[nome][f"{var}|{recorte}"] = {
                "total": total,
                "niveis": dict(niveis),
                "n_com_coord": len(erros),
                "mediana_m": round(mediana(erros)) if erros else None,
                "p90_m": round(percentil(erros, 90)) if erros else None,
                "pior_m": round(max(erros)) if erros else None,
                "ate_50m": sum(1 for e in erros if e <= 50),
                "ate_200m": sum(1 for e in erros if e <= 200),
                "acima_1km": sum(1 for e in erros if e > 1000),
                "acima_5km": sum(1 for e in erros if e > 5000),
            }
# Erro por nível (para o limiar exata × aproximada), na variante "limpo"
por_nivel = {}
for nome, por_item in GEOCODIFICADORES.items():
    if nome == "brasilapi_cep":
        continue
    d = defaultdict(list)
    for gid, g in por_id.items():
        n, lat, lon = (por_item.get(gid, {}).get("limpo") or ("nao", None, None))
        if lat is not None:
            d[n].append(haversine(g["lat"], g["lon"], lat, lon))
    por_nivel[nome] = {n: {"n": len(v), "mediana_m": round(mediana(v)), "p90_m": round(percentil(v, 90)), "pior_m": round(max(v)), "ate_100m": sum(1 for e in v if e <= 100)} for n, v in d.items()}
saida["_por_nivel_limpo"] = por_nivel
json.dump(saida, open(os.path.join(DADOS, "metricas.json"), "w"), ensure_ascii=False, indent=1)
json.dump({n: {str(i): v for i, v in d.items()} for n, d in GEOCODIFICADORES.items()}, open(os.path.join(DADOS, "por_item.json"), "w"))


def linha(m):
    return f"{m['niveis']}  med {m['mediana_m']} p90 {m['p90_m']} pior {m['pior_m']}"


for nome in GEOCODIFICADORES:
    for var in (["cep"] if nome == "brasilapi_cep" else [v for v in VARIANTES if any(v in x for x in GEOCODIFICADORES[nome].values())]):
        for rec in ("grande_vitoria", "interior"):
            print(f"{nome:14} {var:15} {rec:15}", linha(saida[nome][f'{var}|{rec}']))
