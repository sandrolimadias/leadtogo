"""Como cada item do gabarito vira consulta, em quatro variantes (iguais para todos os geocodificadores)."""
import json
import os
import re

from comum import DADOS, RAIZ
from normalizar import chave_da_rua

SEM_NUMERO = re.compile(r"^\s*(|S\s*/?\s*N|SN|S\.N\.?|SEM\s*N.*|0+|-+)\s*$", re.I)


def formatar_cep(cep):
    d = re.sub(r"\D", "", cep or "")
    return f"{d[:5]}-{d[5:]}" if len(d) == 8 else d


def carregar():
    gab = json.load(open(os.path.join(RAIZ, "gabarito", "gabarito.json")))
    cep = json.load(open(os.path.join(DADOS, "cep.json")))
    return gab, {int(k): v for k, v in cep.items()}


def variantes(g, cep_info):
    """Devolve {nome: texto da consulta (ou None quando não se aplica)}."""
    num = (g["numero"] or "").strip()
    sem_num = bool(SEM_NUMERO.match(num))
    rua = g["logradouro"].strip()
    partes_cheio = [f"{rua}, {num}" if num else rua]
    if g["bairro"]:
        partes_cheio.append(g["bairro"])
    partes_cheio += [f"{g['municipio']} - ES", formatar_cep(g["cep"])]
    # como a pessoa colaria do cadastro: com "S/N" e tudo
    cheio = ", ".join(p for p in partes_cheio if p)
    # limpo: sem o "S/N" nem o número vazio
    limpo_partes = [rua if sem_num else f"{rua}, {num}"]
    if g["bairro"]:
        limpo_partes.append(g["bairro"])
    limpo_partes += [f"{g['municipio']} - ES"]
    limpo = ", ".join(limpo_partes)
    # só CEP e número: o endereço "incompleto"
    cep_numero = f"{formatar_cep(g['cep'])}{'' if sem_num else ', ' + num}, Brasil"
    # CEP completado: rua/bairro/cidade vêm do ViaCEP (ou BrasilAPI) e o número vem da pessoa
    v = (cep_info or {}).get("viacep") or {}
    b = (cep_info or {}).get("brasilapi") or {}
    rua_cep = (v.get("logradouro") or b.get("street") or "").strip()
    bairro_cep = (v.get("bairro") or b.get("neighborhood") or "").strip()
    cidade_cep = (v.get("localidade") or b.get("city") or "").strip()
    if cidade_cep:
        r = chave_da_rua(rua_cep) if rua_cep else ""
        p = [r if (not r or sem_num) else f"{r}, {num}", cidade_cep]
        completado = ", ".join(x for x in p if x)
    else:
        completado = None
    # sem o tipo do logradouro: o CNES diz "RUA" onde o OSM tem "Avenida" (e vice-versa), e o Nominatim exige o tipo certo
    rua_sem_tipo = chave_da_rua(rua)
    sem_tipo = ", ".join(x for x in [rua_sem_tipo if sem_num else f"{rua_sem_tipo}, {num}", g["municipio"]] if x)
    sem_tipo_sem_numero = f"{rua_sem_tipo}, {g['municipio']}"
    so_cidade = g["municipio"]
    return {"cheio": cheio, "limpo": limpo, "sem_tipo": sem_tipo, "sem_tipo_sem_numero": sem_tipo_sem_numero, "so_cidade": so_cidade, "cep_numero": cep_numero, "cep_completado": completado}


def estruturada(g, cep_info, base="limpo"):
    """Campos para a busca estruturada do Nominatim (street, city, postalcode...)."""
    num = (g["numero"] or "").strip()
    sem_num = bool(SEM_NUMERO.match(num))
    return {
        "street": chave_da_rua(g["logradouro"]) if sem_num else f"{num} {chave_da_rua(g['logradouro'])}",
        "city": g["municipio"],
        "country": "Brasil",
    }
