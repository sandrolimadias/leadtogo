"""Mapa HTML local (Leaflet via CDN, tiles do OSM) com o gabarito; destaca 10 pontos para o Ale conferir."""
import json
import os
import random

from comum import RAIZ

gab = json.load(open(os.path.join(RAIZ, "gabarito", "gabarito.json")))
random.seed(7)
amostra = []
for grupo, quotas in (("grande_vitoria", {"normal": 2, "sem_numero": 2, "rural": 1}), ("interior", {"normal": 2, "sem_numero": 1, "rural": 2})):
    for dif, n in quotas.items():
        pool = [g for g in gab if g["grupo"] == grupo and g["dificuldade"] == dif]
        amostra += random.sample(pool, n)
conferir = sorted(g["id"] for g in amostra)
json.dump(conferir, open(os.path.join(RAIZ, "gabarito", "conferir.json"), "w"))
pontos = [
    {
        "id": g["id"],
        "lat": g["lat"],
        "lon": g["lon"],
        "texto": f"#{g['id']} {g['nome']}<br>{g['logradouro']}, {g['numero'] or 's/n'} · {g['bairro']}<br>{g['municipio']} · {g['grupo']} · {g['dificuldade']}<br>CEP {g['cep']}",
        "conferir": g["id"] in conferir,
    }
    for g in gab
]
html = """<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Gabarito G0: geocodificação no ES</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body{height:100%;margin:0;font-family:system-ui,sans-serif}#m{height:100%}
.leg{position:absolute;z-index:1000;top:10px;right:10px;background:#fff;padding:8px 12px;border-radius:6px;box-shadow:0 1px 4px #0005;font-size:13px}
.n{background:#1d4ed8;color:#fff;border-radius:50%;width:22px;height:22px;line-height:22px;text-align:center;font-size:11px;border:2px solid #fff}
.c{background:#ea580c}</style></head><body>
<div class="leg"><b>Gabarito G0</b> (coordenada declarada no CNES)<br><span style="color:#1d4ed8">●</span> ponto do gabarito &nbsp; <span style="color:#ea580c">●</span> <b>conferir</b> (10)<br>Abra o ponto, olhe se cai no estabelecimento certo.</div>
<div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const pontos = __PONTOS__;
const mapa = L.map('m').setView([-20.1, -40.5], 8);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap'}).addTo(mapa);
const grupo = [];
for (const p of pontos) {
  const icone = L.divIcon({className: '', html: '<div class="n ' + (p.conferir ? 'c' : '') + '">' + p.id + '</div>', iconSize: [22, 22]});
  const mk = L.marker([p.lat, p.lon], {icon: icone}).addTo(mapa).bindPopup(p.texto);
  grupo.push(mk);
}
mapa.fitBounds(L.featureGroup(grupo).getBounds().pad(0.1));
</script></body></html>
""".replace("__PONTOS__", json.dumps(pontos, ensure_ascii=False))
open(os.path.join(RAIZ, "gabarito", "mapa.html"), "w").write(html)
print("conferir:", conferir)
for g in gab:
    if g["id"] in conferir:
        print(g["id"], g["municipio"], g["grupo"], g["dificuldade"], "|", g["nome"][:40], "|", g["logradouro"], g["numero"])
