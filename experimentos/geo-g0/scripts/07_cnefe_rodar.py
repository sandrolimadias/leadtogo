"""Roda o gabarito no CNEFE (busca local) nas 4 variantes."""
import json
import os
import re
import time

from comum import DADOS
from consultas import SEM_NUMERO, carregar
from cnefe_busca import Cnefe

gab, cep = carregar()
c = Cnefe()
saida = {}
t0 = time.time()
for g in gab:
    info = cep.get(g["id"]) or {}
    v, b = info.get("viacep") or {}, info.get("brasilapi") or {}
    mun = g["municipio_id"]
    num = g["numero"]
    r = {}
    r["cheio"] = c.buscar(mun, g["logradouro"], num, g["cep"], g["bairro"])
    r["limpo"] = c.buscar(mun, g["logradouro"], None if SEM_NUMERO.match(num or "") else num, None, g["bairro"])
    # só CEP e número: sem rua, sem bairro, sem município (o CEP precisa dizer tudo)
    r["cep_numero"] = c.buscar(mun, None, num, g["cep"], None)
    rua_cep = (v.get("logradouro") or b.get("street") or "").strip()
    r["cep_completado"] = c.buscar(mun, rua_cep or None, None if SEM_NUMERO.match(num or "") else num, g["cep"], (v.get("bairro") or b.get("neighborhood") or "") or None)
    saida[g["id"]] = r
json.dump(saida, open(os.path.join(DADOS, "resultados_cnefe.json"), "w"), ensure_ascii=False)
print(f"CNEFE: {len(gab)} endereços × 4 variantes em {time.time()-t0:.1f} s")
