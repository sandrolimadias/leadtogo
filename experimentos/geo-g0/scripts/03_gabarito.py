"""Monta o gabarito (~50 endereços do CNES, com coordenada declarada) filtrando coordenadas suspeitas."""
import csv
import json
import os
import random
import re
from collections import Counter, defaultdict

from comum import DADOS, RAIZ, haversine, ponto_no_poligono

random.seed(3201)
bruto = json.load(open(os.path.join(DADOS, "cnes_bruto.json")))

SEM_NUMERO = re.compile(r"^\s*(|S\s*/?\s*N|SN|S\.N\.?|SEM\s*N.*|0+|-+)\s*$", re.I)
RURAL = re.compile(r"\b(RURAL|ZONA\s*RURAL|FAZENDA|SITIO|S[ÍI]TIO|COMUNIDADE|ESTRADA|ROD(OVIA)?|KM|LINHA|C[ÓO]RREGO|ASSENTAMENTO|DISTRITO|LOCALIDADE|POVOADO)\b", re.I)


def aneis(geo):
    g = geo["features"][0]["geometry"] if "features" in geo else geo["geometry"] if "geometry" in geo else geo
    if g["type"] == "Polygon":
        return [g["coordinates"]]
    return g["coordinates"]


def dentro(lon, lat, polis):
    return any(ponto_no_poligono(lon, lat, p) for p in polis)


candidatos = []
descartes = Counter()
for mid, bloco in bruto.items():
    mun = bloco["municipio"]
    polis = aneis(bloco["geo"])
    c = bloco["centroide"]
    coords = Counter(
        (round(e["latitude_estabelecimento_decimo_grau"] or 0, 5), round(e["longitude_estabelecimento_decimo_grau"] or 0, 5))
        for e in bloco["estabelecimentos"]
    )
    for e in bloco["estabelecimentos"]:
        lat, lon = e["latitude_estabelecimento_decimo_grau"], e["longitude_estabelecimento_decimo_grau"]
        rua = (e["endereco_estabelecimento"] or "").strip()
        if not lat or not lon:
            descartes["sem_ou_zero"] += 1
            continue
        if not rua:
            descartes["sem_logradouro"] += 1
            continue
        if not dentro(lon, lat, polis):
            descartes["fora_do_municipio"] += 1
            continue
        if coords[(round(lat, 5), round(lon, 5))] > 1:
            descartes["coordenada_repetida"] += 1
            continue
        if haversine(lat, lon, c["latitude"], c["longitude"]) < 150:
            descartes["no_centroide"] += 1
            continue
        if len(str(lat).split(".")[-1]) < 4 or len(str(lon).split(".")[-1]) < 4:
            descartes["coordenada_arredondada"] += 1
            continue
        numero = (e["numero_estabelecimento"] or "").strip()
        bairro = (e["bairro_estabelecimento"] or "").strip()
        cep = (e["codigo_cep_estabelecimento"] or "").strip()
        if RURAL.search(rua) or RURAL.search(bairro):
            dif = "rural"
        elif SEM_NUMERO.match(numero):
            dif = "sem_numero"
        elif not bairro or not cep:
            dif = "incompleto"
        else:
            dif = "normal"
        candidatos.append(
            {
                "cnes": e["codigo_cnes"],
                "nome": (e["nome_fantasia"] or e["nome_razao_social"] or "").strip(),
                "logradouro": rua,
                "numero": numero,
                "bairro": bairro,
                "cep": cep,
                "municipio": mun["nome"],
                "municipio_id": mun["id"],
                "microrregiao": mun["microrregiao"],
                "grupo": "grande_vitoria" if mun["grupo"] == "grande_vitoria" else "interior",
                "dificuldade": dif,
                "lat": lat,
                "lon": lon,
            }
        )
print("descartes:", dict(descartes))
print("candidatos:", Counter((c["grupo"], c["dificuldade"]) for c in candidatos))

# Seleção: metade Grande Vitória, metade interior (espalhado pelas microrregiões), com casos difíceis de propósito
meta = {
    "grande_vitoria": {"normal": 16, "sem_numero": 7, "incompleto": 0, "rural": 3},
    "interior": {"normal": 14, "sem_numero": 6, "incompleto": 0, "rural": 5},
}
escolhidos = []
for grupo, quotas in meta.items():
    for dif, n in quotas.items():
        pool = [c for c in candidatos if c["grupo"] == grupo and c["dificuldade"] == dif]
        random.shuffle(pool)
        usados_mun = Counter(c["municipio_id"] for c in escolhidos if c["grupo"] == grupo)
        # espalha: prefere o município menos usado
        pool.sort(key=lambda c: usados_mun[c["municipio_id"]])
        pegos = []
        for c in pool:
            if len(pegos) >= n:
                break
            if usados_mun[c["municipio_id"]] + sum(1 for p in pegos if p["municipio_id"] == c["municipio_id"]) >= (5 if grupo == "grande_vitoria" else 3):
                continue
            pegos.append(c)
        escolhidos += pegos
for i, c in enumerate(escolhidos, 1):
    c["id"] = i
print("gabarito:", len(escolhidos), Counter((c["grupo"], c["dificuldade"]) for c in escolhidos))
print("microrregiões no interior:", len({c["microrregiao"] for c in escolhidos if c["grupo"] == "interior"}))

os.makedirs(os.path.join(RAIZ, "gabarito"), exist_ok=True)
json.dump(escolhidos, open(os.path.join(RAIZ, "gabarito", "gabarito.json"), "w"), ensure_ascii=False, indent=1)
with open(os.path.join(RAIZ, "gabarito", "gabarito.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(escolhidos[0].keys()), delimiter=";")
    w.writeheader()
    w.writerows(escolhidos)
