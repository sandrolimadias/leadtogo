"""Consulta o Nominatim e o Photon LOCAIS (só ES) com as mesmas variantes e mede o tempo de resposta.
Uso: python3 10_locais.py nominatim http://localhost:8088 | photon http://localhost:2322"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

from comum import DADOS, UA
from consultas import carregar, estruturada, variantes

nome, base = sys.argv[1], sys.argv[2]
BBOX = (-41.9, -21.35, -39.6, -17.85)
gab, cep = carregar()


def chamar(url):
    t0 = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r), time.time() - t0
    except Exception as e:
        return {"erro": str(e)[:100]}, time.time() - t0


saida, tempos = {}, []
for g in gab:
    for var, q in variantes(g, cep.get(g["id"])).items():
        if not q:
            continue
        if nome == "nominatim":
            url = f"{base}/search?" + urllib.parse.urlencode({"q": q, "format": "jsonv2", "addressdetails": 1, "countrycodes": "br", "limit": 1, "accept-language": "pt-BR"})
        else:
            url = f"{base}/api?" + urllib.parse.urlencode({"q": q, "limit": 1, "lang": "default", "bbox": ",".join(map(str, BBOX))})
        r, dt = chamar(url)
        saida.setdefault(g["id"], {})[var] = r
        tempos.append(dt)
    if nome == "nominatim":
        url = f"{base}/search?" + urllib.parse.urlencode({**estruturada(g, cep.get(g["id"])), "format": "jsonv2", "addressdetails": 1, "countrycodes": "br", "limit": 1, "accept-language": "pt-BR"})
        r, dt = chamar(url)
        saida[g["id"]]["estruturada"] = r
        tempos.append(dt)
arq = os.path.join(DADOS, f"resultados_{nome}_local.json")
json.dump({nome: saida}, open(arq, "w"), ensure_ascii=False)
tempos.sort()
print(f"{nome} local: {len(tempos)} consultas; mediana {tempos[len(tempos)//2]*1000:.0f} ms, p90 {tempos[int(len(tempos)*.9)]*1000:.0f} ms, máx {tempos[-1]*1000:.0f} ms")
