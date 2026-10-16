"""Completa o endereço pelo CEP (ViaCEP e BrasilAPI) para cada item do gabarito e mede a cobertura."""
import json
import os
import re

from comum import DADOS, RAIZ, get

gab = json.load(open(os.path.join(RAIZ, "gabarito", "gabarito.json")))
saida = {}
for g in gab:
    cep = re.sub(r"\D", "", g["cep"])
    r = {"cep": cep, "viacep": None, "brasilapi": None}
    if len(cep) == 8:
        try:
            v = json.loads(get(f"https://viacep.com.br/ws/{cep}/json/", espera=0.2))
            r["viacep"] = None if v.get("erro") else v
        except Exception as e:
            r["viacep_erro"] = str(e)
        try:
            r["brasilapi"] = json.loads(get(f"https://brasilapi.com.br/api/cep/v2/{cep}", espera=0.2))
        except Exception as e:
            r["brasilapi_erro"] = str(e)[:80]
    saida[g["id"]] = r
json.dump(saida, open(os.path.join(DADOS, "cep.json"), "w"), ensure_ascii=False, indent=1)
tot = len(gab)
via = sum(1 for r in saida.values() if r["viacep"])
bra = sum(1 for r in saida.values() if r["brasilapi"])
via_rua = sum(1 for r in saida.values() if r["viacep"] and r["viacep"].get("logradouro"))
bra_rua = sum(1 for r in saida.values() if r["brasilapi"] and r["brasilapi"].get("street"))
bra_coord = sum(1 for r in saida.values() if r["brasilapi"] and (r["brasilapi"].get("location") or {}).get("coordinates"))
print(f"{tot} CEPs: ViaCEP achou {via} (com rua {via_rua}); BrasilAPI achou {bra} (com rua {bra_rua}, com coordenada {bra_coord})")
