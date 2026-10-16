"""Indexa o CNEFE 2022 do ES (CSV de 366 MB) num SQLite local: um registro por endereço com coordenada."""
import csv
import os
import sqlite3
import time

from comum import DADOS
from normalizar import chave_da_rua, sem_acento

caminho = os.path.join(DADOS, "cnefe_es.sqlite")
if os.path.exists(caminho):
    os.remove(caminho)
t0 = time.time()
db = sqlite3.connect(caminho)
db.execute(
    "CREATE TABLE e (mun INTEGER, cep TEXT, local TEXT, rua TEXT, rua_original TEXT, num INTEGER, mod TEXT, lat REAL, lon REAL, esp INTEGER, nv INTEGER, estab TEXT)"
)
lote = []
total = sem_coord = 0
with open(os.path.join(DADOS, "32_ES.csv"), newline="", encoding="utf-8", errors="replace") as f:
    for r in csv.DictReader(f, delimiter=";"):
        total += 1
        try:
            lat, lon = float(r["LATITUDE"]), float(r["LONGITUDE"])
        except ValueError:
            sem_coord += 1
            continue
        tipo, titulo, nome = r["NOM_TIPO_SEGLOGR"], r["NOM_TITULO_SEGLOGR"], r["NOM_SEGLOGR"]
        original = " ".join(x for x in (tipo, titulo, nome) if x)
        lote.append(
            (
                int(r["COD_MUNICIPIO"]),
                r["CEP"],
                sem_acento(r["DSC_LOCALIDADE"]).upper(),
                chave_da_rua(original),
                original,
                int(r["NUM_ENDERECO"] or 0),
                r["DSC_MODIFICADOR"],
                lat,
                lon,
                int(r["COD_ESPECIE"] or 0),
                int(r["NV_GEO_COORD"] or 0),
                r["DSC_ESTABELECIMENTO"],
            )
        )
        if len(lote) >= 50_000:
            db.executemany("INSERT INTO e VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", lote)
            lote.clear()
db.executemany("INSERT INTO e VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", lote)
db.execute("CREATE INDEX i_rua ON e (mun, rua, num)")
db.execute("CREATE INDEX i_cep ON e (cep)")
db.execute("CREATE INDEX i_local ON e (mun, local)")
db.commit()
print(f"{total} endereços lidos ({sem_coord} sem coordenada) em {time.time()-t0:.0f} s; SQLite de {os.path.getsize(caminho)/1e6:.0f} MB")
for nv, n in db.execute("SELECT nv, count(*) FROM e GROUP BY nv ORDER BY nv"):
    print("  NV_GEO_COORD", nv, n)
for esp, n in db.execute("SELECT esp, count(*) FROM e GROUP BY esp ORDER BY esp"):
    print("  COD_ESPECIE", esp, n)
