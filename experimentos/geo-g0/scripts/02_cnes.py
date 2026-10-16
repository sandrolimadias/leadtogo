"""Baixa estabelecimentos do CNES (OpenDataSUS) de municípios escolhidos e a malha/centroide de cada um (IBGE)."""
import json
import os
import random

from comum import DADOS, get, get_json

random.seed(32)
municipios = json.load(open(os.path.join(DADOS, "municipios.json")))

gv = [m for m in municipios if m["grupo"] == "grande_vitoria"]
# interior pequeno: até 2 municípios por microrregião, os de população mais variada (sorteio fixo)
por_micro = {}
for m in municipios:
    if m["grupo"] == "interior_pequeno":
        por_micro.setdefault(m["microrregiao"], []).append(m)
interior = []
for micro, lista in sorted(por_micro.items()):
    lista.sort(key=lambda m: m["id"])
    interior += random.sample(lista, min(2, len(lista)))
escolhidos = gv + interior
print(len(gv), "GV +", len(interior), "interior")

def cnes(mun_id, paginas):
    itens = []
    for p in range(paginas):
        url = f"https://apidadosabertos.saude.gov.br/cnes/estabelecimentos?limit=20&offset={p*20}&codigo_uf=32&codigo_municipio={mun_id // 10}"
        try:
            d = json.loads(get(url, espera=0.15))["estabelecimentos"]
        except Exception as e:  # município com poucas páginas
            print("  fim", mun_id, p, e)
            break
        itens += d
        if len(d) < 20:
            break
    return itens

saida = {}
for m in escolhidos:
    paginas = 12 if m["grupo"] == "grande_vitoria" else 6
    itens = cnes(m["id"], paginas)
    geo = get_json(f"https://servicodados.ibge.gov.br/api/v3/malhas/municipios/{m['id']}?formato=application/vnd.geo+json&qualidade=minima")
    meta = get_json(f"https://servicodados.ibge.gov.br/api/v3/malhas/municipios/{m['id']}/metadados")
    saida[str(m["id"])] = {"municipio": m, "estabelecimentos": itens, "geo": geo, "centroide": meta[0]["centroide"] if isinstance(meta, list) else meta["centroide"]}
    print(m["nome"], m["grupo"], len(itens))
json.dump(saida, open(os.path.join(DADOS, "cnes_bruto.json"), "w"))
