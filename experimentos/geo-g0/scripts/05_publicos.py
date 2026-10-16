"""Consulta Nominatim e Photon PÚBLICOS (1 req/s, User-Agent identificado, cache em disco) com as 4 variantes."""
import json
import os
import sys
import urllib.parse

from comum import DADOS, UA, get
from consultas import carregar, variantes

gab, cep = carregar()
saida = {"nominatim": {}, "photon": {}}
alvo = sys.argv[1:] or ["nominatim", "photon"]
for g in gab:
    vs = variantes(g, cep.get(g["id"]))
    for nome, q in vs.items():
        if not q:
            continue
        if "nominatim" in alvo:
            url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
                {"q": q, "format": "jsonv2", "addressdetails": 1, "countrycodes": "br", "limit": 1, "accept-language": "pt-BR"}
            )
            try:
                saida["nominatim"].setdefault(g["id"], {})[nome] = json.loads(get(url, espera=1.1))
            except Exception as e:
                saida["nominatim"].setdefault(g["id"], {})[nome] = {"erro": str(e)[:100]}
        if "photon" in alvo:
            url = "https://photon.komoot.io/api/?" + urllib.parse.urlencode({"q": q, "limit": 1, "lang": "default"})
            try:
                saida["photon"].setdefault(g["id"], {})[nome] = json.loads(get(url, espera=1.1))
            except Exception as e:
                saida["photon"].setdefault(g["id"], {})[nome] = {"erro": str(e)[:100]}
    print(g["id"], end=" ", flush=True)
json.dump(saida, open(os.path.join(DADOS, "resultados_publicos.json"), "w"), ensure_ascii=False)
print("\nok")
