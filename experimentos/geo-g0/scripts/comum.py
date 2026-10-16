"""Utilitários do experimento G0: HTTP com cache em disco, geometria e distância. Só biblioteca padrão."""
import gzip
import hashlib
import json
import math
import os
import time
import urllib.parse
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DADOS = os.path.join(RAIZ, "dados")
UA = "leadtogo-geo-g0/1.0 (teste de qualidade de geocodificacao; contato: sandrolimadias@gmail.com)"
os.makedirs(DADOS, exist_ok=True)


def _ler(resposta):
    corpo = resposta.read()
    if corpo[:2] == b"\x1f\x8b":
        corpo = gzip.decompress(corpo)
    return corpo


def get(url, cache=True, espera=0.0, tentativas=3):
    """GET com cache em dados/cache (a chave é a URL). `espera` = segundos antes de uma chamada real (cortesia)."""
    pasta = os.path.join(DADOS, "cache")
    os.makedirs(pasta, exist_ok=True)
    arq = os.path.join(pasta, hashlib.sha1(url.encode()).hexdigest())
    if cache and os.path.exists(arq):
        with open(arq, "rb") as f:
            return f.read()
    for t in range(tentativas):
        try:
            if espera:
                time.sleep(espera)
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=60) as r:
                corpo = _ler(r)
            if cache:
                with open(arq, "wb") as f:
                    f.write(corpo)
            return corpo
        except Exception:
            if t == tentativas - 1:
                raise
            time.sleep(2 * (t + 1))


def get_json(url, **kw):
    return json.loads(get(url, **kw))


def haversine(lat1, lon1, lat2, lon2):
    """Distância em metros entre dois pontos."""
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def ponto_no_poligono(lon, lat, aneis):
    """Ray casting; `aneis` = lista de anéis [[lon,lat],...] (o primeiro é o externo)."""
    dentro = False
    for anel in aneis[:1]:
        n = len(anel)
        j = n - 1
        for i in range(n):
            xi, yi = anel[i]
            xj, yj = anel[j]
            if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                dentro = not dentro
            j = i
    return dentro


def mediana(v):
    v = sorted(v)
    if not v:
        return None
    m = len(v) // 2
    return v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2


def percentil(v, p):
    v = sorted(v)
    if not v:
        return None
    k = max(0, min(len(v) - 1, math.ceil(p / 100 * len(v)) - 1))
    return v[k]
