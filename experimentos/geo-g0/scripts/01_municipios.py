"""Municípios do ES (IBGE): nome, microrregião e população do Censo 2022; separa Grande Vitória e interior pequeno."""
import json
import os

from comum import DADOS, get_json

GRANDE_VITORIA = {"Vitória", "Vila Velha", "Serra", "Cariacica", "Viana", "Guarapari", "Fundão"}

municipios = get_json("https://servicodados.ibge.gov.br/api/v1/localidades/estados/32/municipios")
pop = get_json("https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis/93?localidades=N6[N3[32]]")
populacao = {int(s["localidade"]["id"]): int(s["serie"]["2022"]) for s in pop[0]["resultados"][0]["series"]}
saida = []
for m in municipios:
    saida.append(
        {
            "id": m["id"],
            "nome": m["nome"],
            "microrregiao": m["microrregiao"]["nome"],
            "mesorregiao": m["microrregiao"]["mesorregiao"]["nome"],
            "populacao": populacao.get(m["id"]),
            "grupo": "grande_vitoria" if m["nome"] in GRANDE_VITORIA else ("interior_pequeno" if (populacao.get(m["id"]) or 0) < 30000 else "interior_maior"),
        }
    )
with open(os.path.join(DADOS, "municipios.json"), "w") as f:
    json.dump(saida, f, ensure_ascii=False, indent=1)
from collections import Counter
print(Counter(m["grupo"] for m in saida), len(saida))
print(Counter(m["microrregiao"] for m in saida if m["grupo"] == "interior_pequeno"))
