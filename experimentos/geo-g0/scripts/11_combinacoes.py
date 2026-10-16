"""Simula a ordem das camadas do G1: para cada item, a primeira camada que acha vale; mede o nível e o erro final."""
import json
import os
from collections import Counter, defaultdict

from comum import DADOS, RAIZ, haversine, mediana, percentil

gab = {g["id"]: g for g in json.load(open(os.path.join(RAIZ, "gabarito", "gabarito.json")))}
d = json.load(open(os.path.join(DADOS, "por_item.json")))


def camada(geo, var, niveis, rotulo):
    def f(gid):
        r = d.get(geo, {}).get(str(gid), {}).get(var)
        if r and r[0] in niveis:
            return rotulo, r[1], r[2]
        return None
    return f


# rótulo = o que a camada devolve: "exata" (número no endereço), "aprox_numero" (interpolado), "rua", "cep_cidade"
C = {
    "cnefe_numero": camada("cnefe", "cheio", {"numero"}, "exata"),
    "osm_numero_nominatim": camada("nominatim_local", "sem_tipo", {"numero"}, "exata"),
    "osm_numero_photon": camada("photon_local", "sem_tipo", {"numero"}, "exata"),
    "cnefe_interpolado": camada("cnefe", "cheio", {"numero_interp"}, "aprox_numero"),
    "nominatim_rua": camada("nominatim_local", "sem_tipo", {"rua"}, "rua"),
    "photon_rua": camada("photon_local", "sem_tipo", {"rua"}, "rua"),
    "cnefe_rua": camada("cnefe", "cheio", {"rua"}, "rua"),
    "cnefe_cep_bairro": camada("cnefe", "cheio", {"bairro_cidade"}, "cep_cidade"),
    "nominatim_cidade": camada("nominatim_local", "so_cidade", {"bairro_cidade"}, "cep_cidade"),
}
ORDENS = {
    "A: CNEFE número → OSM número → CNEFE interpolado → rua OSM → rua CNEFE → CEP/cidade": ["cnefe_numero", "osm_numero_nominatim", "osm_numero_photon", "cnefe_interpolado", "nominatim_rua", "photon_rua", "cnefe_rua", "cnefe_cep_bairro", "nominatim_cidade"],
    "B: OSM número → CNEFE número → CNEFE interpolado → rua OSM → rua CNEFE → CEP/cidade": ["osm_numero_nominatim", "osm_numero_photon", "cnefe_numero", "cnefe_interpolado", "nominatim_rua", "photon_rua", "cnefe_rua", "cnefe_cep_bairro", "nominatim_cidade"],
    "C: só CNEFE (número → interpolado → rua → CEP)": ["cnefe_numero", "cnefe_interpolado", "cnefe_rua", "cnefe_cep_bairro", "nominatim_cidade"],
    "D: só OSM (Nominatim → Photon; número → rua → cidade)": ["osm_numero_nominatim", "osm_numero_photon", "nominatim_rua", "photon_rua", "nominatim_cidade"],
    "E: Nominatim local sozinho (número → rua → cidade)": ["osm_numero_nominatim", "nominatim_rua", "nominatim_cidade"],
    "G: CNEFE número → Photon número → CNEFE interpolado → Photon rua → CNEFE rua → CEP/cidade": ["cnefe_numero", "osm_numero_photon", "cnefe_interpolado", "photon_rua", "cnefe_rua", "cnefe_cep_bairro", "nominatim_cidade"],
    "H: CNEFE número → Nominatim número → Photon número → CNEFE interpolado → Nominatim rua → Photon rua → CNEFE rua → CEP/cidade": ["cnefe_numero", "osm_numero_nominatim", "osm_numero_photon", "cnefe_interpolado", "nominatim_rua", "photon_rua", "cnefe_rua", "cnefe_cep_bairro", "nominatim_cidade"],
    "F: CNEFE número → Nominatim rua → CNEFE interpolado/rua → CEP/cidade": ["cnefe_numero", "osm_numero_nominatim", "cnefe_interpolado", "nominatim_rua", "cnefe_rua", "cnefe_cep_bairro", "nominatim_cidade"],
}
saida = {}
for nome, ordem in ORDENS.items():
    por = defaultdict(list)
    cont = Counter()
    por_grupo = defaultdict(lambda: defaultdict(list))
    for gid, g in gab.items():
        achou = None
        for c in ordem:
            r = C[c](gid)
            if r:
                achou = (c, *r)
                break
        if not achou:
            cont[("nao", g["grupo"])] += 1
            continue
        c, rot, lat, lon = achou
        e = haversine(g["lat"], g["lon"], lat, lon)
        por[rot].append(e)
        por_grupo[g["grupo"]][rot].append(e)
        cont[(rot, g["grupo"])] += 1
    saida[nome] = {
        rot: {"n": len(v), "mediana_m": round(mediana(v)), "p90_m": round(percentil(v, 90)), "pior_m": round(max(v)), "ate_100m": sum(1 for x in v if x <= 100), "ate_300m": sum(1 for x in v if x <= 300)}
        for rot, v in por.items()
    }
    saida[nome]["_contagem_por_grupo"] = {f"{k[0]}|{k[1]}": n for k, n in cont.items()}
    erros_todos = [e for v in por.values() for e in v]
    saida[nome]["_todos"] = {"n": len(erros_todos), "mediana_m": round(mediana(erros_todos)), "p90_m": round(percentil(erros_todos, 90)), "pior_m": round(max(erros_todos)), "nao_achou": sum(n for (r, gr), n in cont.items() if r == "nao")}
json.dump(saida, open(os.path.join(DADOS, "combinacoes.json"), "w"), ensure_ascii=False, indent=1)
for nome, r in saida.items():
    print(nome)
    for rot in ("exata", "aprox_numero", "rua", "cep_cidade"):
        if rot in r:
            print("   ", rot, r[rot])
    print("    todos", r["_todos"], r["_contagem_por_grupo"])
