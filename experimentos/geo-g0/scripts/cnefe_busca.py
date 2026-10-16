"""Busca de endereço no CNEFE 2022 (SQLite local): rua normalizada + número, depois só rua, depois CEP, depois bairro."""
import difflib
import os
import re
import sqlite3
import statistics

from comum import DADOS
from normalizar import chave_da_rua, sem_acento

SEM_NUM = re.compile(r"^\s*(|S\s*/?\s*N|SN|S\.N\.?|SEM\s*N.*|0+|-+)\s*$", re.I)


class Cnefe:
    def __init__(self):
        self.db = sqlite3.connect(os.path.join(DADOS, "cnefe_es.sqlite"))
        self._ruas = {}

    def ruas_do_municipio(self, mun):
        if mun not in self._ruas:
            self._ruas[mun] = [r[0] for r in self.db.execute("SELECT DISTINCT rua FROM e WHERE mun=?", (mun,))]
        return self._ruas[mun]

    @staticmethod
    def _centro(linhas):
        return statistics.median(l[0] for l in linhas), statistics.median(l[1] for l in linhas)

    def buscar(self, mun, rua=None, numero=None, cep=None, bairro=None):
        """Devolve {nivel, lat, lon, detalhe}. nivel: numero | rua | cep | bairro | nao."""
        mun = int(mun)
        num = None if (numero is None or SEM_NUM.match(str(numero))) else int(re.sub(r"\D", "", str(numero)) or 0) or None
        chave = chave_da_rua(rua) if rua else None
        if chave:
            alvo = chave
            if (chave,) not in {(x,) for x in ()}:
                existe = self.db.execute("SELECT 1 FROM e WHERE mun=? AND rua=? LIMIT 1", (mun, chave)).fetchone()
                if not existe:
                    perto = difflib.get_close_matches(chave, self.ruas_do_municipio(mun), n=1, cutoff=0.86)
                    alvo = perto[0] if perto else None
            if alvo:
                linhas = self.db.execute("SELECT lat, lon, num, nv, cep FROM e WHERE mun=? AND rua=?", (mun, alvo)).fetchall()
                # o mesmo nome de rua existe em vários bairros do município: com CEP, fica só o trecho daquele CEP
                cep_rua = re.sub(r"\D", "", cep or "")
                mesmo_cep = [l for l in linhas if l[4] == cep_rua] if len(cep_rua) == 8 else []
                if mesmo_cep:
                    linhas = mesmo_cep
                if num is not None:
                    exatas = [l for l in linhas if l[2] == num]
                    if cep:
                        mesmas = [l for l in exatas if l[4] == re.sub(r"\D", "", cep)]
                        exatas = mesmas or exatas
                    if exatas:
                        lat, lon = self._centro(exatas)
                        return {"nivel": "numero", "lat": lat, "lon": lon, "detalhe": f"{alvo} {num} ({len(exatas)} pts, nv {min(l[3] for l in exatas)})"}
                    com_num = [l for l in linhas if l[2] and l[3] in (1, 2)]
                    if com_num:
                        # interpola entre o vizinho de baixo e o de cima do mesmo lado (mesma paridade), se ambos existem
                        mesmos = [l for l in com_num if l[2] % 2 == num % 2] or com_num
                        abaixo = [l for l in mesmos if l[2] < num]
                        acima = [l for l in mesmos if l[2] > num]
                        if abaixo and acima:
                            n1 = max(l[2] for l in abaixo)
                            n2 = min(l[2] for l in acima)
                            if n2 - n1 <= 200:
                                p1 = self._centro([l for l in abaixo if l[2] == n1])
                                p2 = self._centro([l for l in acima if l[2] == n2])
                                f = (num - n1) / (n2 - n1)
                                return {"nivel": "numero_interpolado", "lat": p1[0] + (p2[0] - p1[0]) * f, "lon": p1[1] + (p2[1] - p1[1]) * f,
                                        "detalhe": f"{alvo}: {num} entre {n1} e {n2}"}
                        prox = min(abs(l[2] - num) for l in com_num)
                        vizinhas = [l for l in com_num if abs(l[2] - num) == prox]
                        lat, lon = self._centro(vizinhas)
                        return {"nivel": "rua", "lat": lat, "lon": lon, "detalhe": f"{alvo}: número {num} não existe, o mais próximo está a {prox} números"}
                lat, lon = self._centro(linhas)
                return {"nivel": "rua", "lat": lat, "lon": lon, "detalhe": f"{alvo}: centro de {len(linhas)} endereços"}
        cep_d = re.sub(r"\D", "", cep or "")
        if len(cep_d) == 8:
            linhas = self.db.execute("SELECT lat, lon FROM e WHERE cep=?", (cep_d,)).fetchall()
            if linhas:
                lat, lon = self._centro(linhas)
                return {"nivel": "cep", "lat": lat, "lon": lon, "detalhe": f"CEP {cep_d}: centro de {len(linhas)} endereços"}
        if bairro:
            b = sem_acento(bairro).upper()
            linhas = self.db.execute("SELECT lat, lon FROM e WHERE mun=? AND local=?", (mun, b)).fetchall()
            if linhas:
                lat, lon = self._centro(linhas)
                return {"nivel": "bairro", "lat": lat, "lon": lon, "detalhe": f"{b}: centro de {len(linhas)} endereços"}
        return {"nivel": "nao", "lat": None, "lon": None, "detalhe": ""}
