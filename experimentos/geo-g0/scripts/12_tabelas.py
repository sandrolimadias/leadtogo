"""Gera as tabelas em Markdown do relatório a partir de dados/metricas.json e dados/combinacoes.json."""
import json
import os

from comum import DADOS

m = json.load(open(os.path.join(DADOS, "metricas.json")))
c = json.load(open(os.path.join(DADOS, "combinacoes.json")))
NOMES = {"cnefe": "IBGE CNEFE 2022 (local)", "nominatim_local": "Nominatim (local, só ES)", "photon_local": "Photon (local, só ES)", "nominatim": "Nominatim público", "photon": "Photon público"}


def n(d, k):
    return d["niveis"].get(k, 0)


def linha(nome, var, rec):
    x = m[nome][f"{var}|{rec}"]
    achou = x["n_com_coord"]
    com_num = n(x, "numero") + n(x, "numero_interp")
    return (
        f"| {NOMES.get(nome, nome)} | {var} | {com_num} ({n(x, 'numero')} exato + {n(x, 'numero_interp')} interp.) | {n(x, 'rua')} | {n(x, 'bairro_cidade')} | {n(x, 'nao')} | "
        f"{x['mediana_m'] if x['mediana_m'] is not None else '–'} | {x['p90_m'] if x['p90_m'] is not None else '–'} | {x['pior_m'] if x['pior_m'] is not None else '–'} | {x['ate_200m']}/{achou} |"
    ).replace("(0 exato + 0 interp.)", "").replace(" exato + 0 interp.)", " exato)")


cab = "| Geocodificador | Consulta | Com número | Só rua | Só bairro/cidade | Não achou | Erro mediano (m) | p90 (m) | Pior (m) | ≤ 200 m |\n|---|---|---|---|---|---|---|---|---|---|"
saida = []
for rec, titulo in (("grande_vitoria", "Grande Vitória (26 endereços)"), ("interior", "Interior < 30 mil hab. (25 endereços)")):
    saida.append(f"\n**{titulo}** (melhor consulta de cada um; erro só entre os que acharam)\n\n{cab}")
    melhores = {"cnefe": "cheio", "nominatim_local": "sem_tipo", "photon_local": "sem_tipo", "nominatim": "sem_tipo", "photon": "sem_tipo"}
    for nome, var in melhores.items():
        saida.append(linha(nome, var, rec))
saida.append("\n**Efeito do formato da consulta (51 endereços; Grande Vitória + interior)**\n\n" + cab)
for nome in ("nominatim_local", "photon_local", "cnefe"):
    for var in ("cheio", "limpo", "sem_tipo", "sem_tipo_sem_numero", "cep_numero", "cep_completado", "estruturada"):
        if f"{var}|todos" in m[nome]:
            saida.append(linha(nome, var, "todos"))
saida.append("\n**Ordem das camadas (primeira que acha vale; 51 endereços)**\n\n| Ordem | Exata (n; mediana; ≤100 m) | Número aprox. | Só rua | CEP/cidade | Todos: mediana / p90 / pior |\n|---|---|---|---|---|---|")
for nome, r in c.items():
    def f(k):
        x = r.get(k)
        return f"{x['n']}; {x['mediana_m']} m; {x['ate_100m']}" if x else "0"
    t = r["_todos"]
    saida.append(f"| {nome} | {f('exata')} | {f('aprox_numero')} | {f('rua')} | {f('cep_cidade')} | {t['mediana_m']} / {t['p90_m']} / {t['pior_m']} m (não achou: {t['nao_achou']}) |")
open(os.path.join(DADOS, "tabelas.md"), "w").write("\n".join(saida))
print("\n".join(saida))
