"""Normalização de logradouro (CNES/CNEFE): sem acento, maiúsculas, tipo abreviado expandido, títulos expandidos."""
import re
import unicodedata

TIPOS = {
    "R": "RUA", "AV": "AVENIDA", "AVE": "AVENIDA", "AVEN": "AVENIDA", "ROD": "RODOVIA", "RDV": "RODOVIA", "EST": "ESTRADA", "ETR": "ESTRADA",
    "TRAV": "TRAVESSA", "TV": "TRAVESSA", "TRV": "TRAVESSA", "PC": "PRACA", "PCA": "PRACA", "PRC": "PRACA", "AL": "ALAMEDA", "ALA": "ALAMEDA",
    "LGO": "LARGO", "LRG": "LARGO", "BC": "BECO", "VL": "VILA", "VLA": "VILA", "LOT": "LOTEAMENTO", "LOTEAM": "LOTEAMENTO", "CAM": "CAMINHO",
    "PRQ": "PARQUE", "CJ": "CONJUNTO", "COND": "CONDOMINIO", "FAZ": "FAZENDA", "SIT": "SITIO", "ACS": "ACESSO", "VIA": "VIA", "VD": "VIADUTO",
}
TITULOS = {
    "DR": "DOUTOR", "DRA": "DOUTORA", "PROF": "PROFESSOR", "PROFA": "PROFESSORA", "CEL": "CORONEL", "CAP": "CAPITAO", "TEN": "TENENTE",
    "GEN": "GENERAL", "MAL": "MARECHAL", "PE": "PADRE", "PDE": "PADRE", "DEP": "DEPUTADO", "SEN": "SENADOR", "ENG": "ENGENHEIRO", "ENGO": "ENGENHEIRO",
    "PRES": "PRESIDENTE", "GOV": "GOVERNADOR", "PREF": "PREFEITO", "VER": "VEREADOR", "COM": "COMENDADOR", "CONS": "CONSELHEIRO", "MONS": "MONSENHOR",
    "SGT": "SARGENTO", "ALM": "ALMIRANTE", "BARAO": "BARAO", "STA": "SANTA", "STO": "SANTO", "SRA": "SENHORA", "SR": "SENHOR", "S": "SAO",
}
TIPOS_COMPLETOS = set(TIPOS.values()) | {"RUA", "AVENIDA", "RODOVIA", "ESTRADA", "TRAVESSA", "PRACA", "ALAMEDA", "LARGO", "BECO", "VILA", "CAMINHO", "PARQUE", "VIA", "LADEIRA", "SERVIDAO", "RAMAL", "LINHA", "CORREGO", "PASSAGEM", "TUNEL", "ESCADARIA", "ACESSO", "LOTEAMENTO", "CONJUNTO", "CONDOMINIO", "FAZENDA", "SITIO", "VIADUTO", "ESTACAO", "BOULEVARD", "TREVO", "RETORNO", "MARGINAL", "RODOANEL", "AREA", "QUADRA", "NUCLEO", "COMUNIDADE", "DISTRITO", "LOCALIDADE", "POVOADO"}


def sem_acento(t):
    return "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn")


def tokens(t):
    t = sem_acento(t).upper()
    t = re.sub(r"[^A-Z0-9 ]+", " ", t.replace("'", ""))
    return [x for x in t.split() if x]


def chave_da_rua(texto, remover_tipo=True):
    """'AV. DR. FULANO' → 'DOUTOR FULANO'. Remove o tipo (RUA, AVENIDA...) e expande títulos abreviados."""
    ts = tokens(texto)
    if remover_tipo and ts:
        primeiro = TIPOS.get(ts[0], ts[0])
        if primeiro in TIPOS_COMPLETOS:
            ts = ts[1:]
    ts = [TITULOS.get(x, x) if len(ts) > 1 else x for x in ts]
    # "SAO"/"SANTO"... não mudam; só tira preposições soltas no início
    return " ".join(ts)


def numero_da_rua(texto):
    m = re.search(r"\d+", texto or "")
    return int(m.group()) if m else None
