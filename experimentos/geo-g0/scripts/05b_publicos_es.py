"""Igual ao 05, mas como na produção: limitado ao ES (Nominatim viewbox+bounded; Photon bbox) e, no Nominatim,
com a busca ESTRUTURADA (rua, cidade, estado) como 5ª variante."""
import json
import os
import urllib.parse

from comum import DADOS, get
from consultas import carregar, estruturada, variantes

BBOX = (-41.9, -21.35, -39.6, -17.85)  # oeste, sul, leste, norte
gab, cep = carregar()
saida = {"nominatim": {}, "photon": {}}
for g in gab:
    vs = variantes(g, cep.get(g["id"]))
    for nome, q in vs.items():
        if not q or nome == "so_cidade":
            continue
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": q, "format": "jsonv2", "addressdetails": 1, "countrycodes": "br", "limit": 1, "accept-language": "pt-BR",
             "viewbox": f"{BBOX[0]},{BBOX[3]},{BBOX[2]},{BBOX[1]}", "bounded": 1}
        )
        try:
            saida["nominatim"].setdefault(g["id"], {})[nome] = json.loads(get(url, espera=1.1))
        except Exception as e:
            saida["nominatim"].setdefault(g["id"], {})[nome] = {"erro": str(e)[:100]}
        url = "https://photon.komoot.io/api/?" + urllib.parse.urlencode({"q": q, "limit": 1, "lang": "default", "bbox": ",".join(map(str, BBOX))})
        try:
            saida["photon"].setdefault(g["id"], {})[nome] = json.loads(get(url, espera=1.1))
        except Exception as e:
            saida["photon"].setdefault(g["id"], {})[nome] = {"erro": str(e)[:100]}
    # busca estruturada (só Nominatim): rua+número, cidade, estado
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {**estruturada(g, cep.get(g["id"])), "format": "jsonv2", "addressdetails": 1, "countrycodes": "br", "limit": 1, "accept-language": "pt-BR"}
    )
    try:
        saida["nominatim"][g["id"]]["estruturada"] = json.loads(get(url, espera=1.1))
    except Exception as e:
        saida["nominatim"][g["id"]]["estruturada"] = {"erro": str(e)[:100]}
    print(g["id"], end=" ", flush=True)
json.dump(saida, open(os.path.join(DADOS, "resultados_publicos_es.json"), "w"), ensure_ascii=False)
print("\nok")
