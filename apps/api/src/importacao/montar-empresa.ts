import {
  type CriarEmpresaCarteiraEntrada,
  type DadosDaReceita,
  type FonteDosDados,
  MAX_TELEFONES_DA_EMPRESA,
  normalizarTelefone,
} from '@leadtogo/shared'

/** A linha da planilha já lida pelo mapeamento: campo do sistema → valor da célula (vazio = ''). */
export type LinhaMapeada = Partial<
  Record<
    | 'razaoSocial'
    | 'nomeFantasia'
    | 'telefone'
    | 'website'
    | 'cep'
    | 'logradouro'
    | 'numero'
    | 'complemento'
    | 'bairro'
    | 'municipio'
    | 'uf'
    | 'observacoes',
    string
  >
>

export interface EntradaDaMontagem {
  fonte: FonteDosDados
  documento: string
  planilha: LinhaMapeada
  /** Os dados da Receita, quando a importação consultou */
  receita: DadosDaReceita | null
  /** O município achado pelo nome e UF da planilha (o chamador consulta a tabela de municípios) */
  municipioDaPlanilha: number | null
  vendedorId: string
  verticalId: string | null
  statusTagId: string
}

export type EmpresaMontada =
  { ok: true; dados: CriarEmpresaCarteiraEntrada } | { ok: false; motivo: string }

const vazio = (v: string | null | undefined): boolean =>
  v === undefined || v === null || v.trim() === ''
const cortar = (v: string | null | undefined, max: number): string | null =>
  vazio(v) ? null : (v as string).trim().slice(0, max)

/** Telefones de uma célula: vários separados por `;`, `/`, `,` ou quebra de linha; o que não é número some. */
export function telefonesDaCelula(celula: string): string[] {
  return celula
    .split(/[;/,\n]+/)
    .map((t) => t.trim())
    .filter((t) => t !== '' && normalizarTelefone(t) !== null)
}

/**
 * Monta o cadastro da empresa pela linha e pela Receita, na ordem que a fonte dos dados manda:
 *  - `planilha`: o que está na planilha; a Receita só entra no que a planilha não tem como dar
 *    (porte, regime, MEI, data de início e CNAEs);
 *  - `receita`: a Receita primeiro; a planilha completa o que a Receita não trouxe;
 *  - `completar`: a planilha primeiro; a Receita preenche só os campos vazios.
 */
export function montarEmpresa(e: EntradaDaMontagem): EmpresaMontada {
  const r = e.receita
  /** Planilha e Receita, na ordem de preferência */
  const escolher = (daPlanilha: string | null, daReceita: string | null): string | null => {
    const [primeiro, segundo] =
      e.fonte === 'receita' ? [daReceita, daPlanilha] : [daPlanilha, daReceita]
    if (!vazio(primeiro)) return primeiro
    // "só a planilha": a Receita não completa os dados básicos
    return e.fonte === 'planilha' ? null : segundo
  }
  const p = e.planilha

  const razaoSocial = cortar(escolher(cortar(p.razaoSocial, 200), r?.razaoSocial ?? null), 200)
  if (!razaoSocial || razaoSocial.length < 2) {
    return { ok: false, motivo: 'Razão social em branco (ou com menos de 2 letras).' }
  }

  const numerosDaPlanilha = telefonesDaCelula(p.telefone ?? '')
  const numerosDaReceita = (r?.telefones ?? []).map((t) => t.numero)
  const numeros = (
    e.fonte === 'receita'
      ? numerosDaReceita.length > 0
        ? numerosDaReceita
        : numerosDaPlanilha
      : numerosDaPlanilha.length > 0
        ? numerosDaPlanilha
        : e.fonte === 'completar'
          ? numerosDaReceita
          : []
  ).slice(0, MAX_TELEFONES_DA_EMPRESA)

  const logradouroDaPlanilha = cortar(p.logradouro, 200)
  const logradouro = escolher(logradouroDaPlanilha, r?.endereco.logradouro ?? null)
  // O tipo ("RUA", "AVENIDA") é da Receita: só vale junto com o logradouro dela
  const logradouroDaReceita =
    !vazio(logradouro) &&
    (e.fonte === 'receita' ? !vazio(r?.endereco.logradouro) : vazio(logradouroDaPlanilha))
  const cepBruto = escolher(p.cep ?? null, r?.endereco.cep ?? null)
  const cep =
    cepBruto && /^\d{8}$/.test(cepBruto.replace(/\D/g, '')) ? cepBruto.replace(/\D/g, '') : null
  const municipioCodigo =
    e.fonte === 'receita'
      ? (r?.endereco.municipioCodigoIbge ?? e.municipioDaPlanilha)
      : (e.municipioDaPlanilha ??
        (e.fonte === 'completar' ? (r?.endereco.municipioCodigoIbge ?? null) : null))

  const dados: CriarEmpresaCarteiraEntrada = {
    tipoDocumento: 'cnpj',
    documento: e.documento,
    razaoSocial,
    nomeFantasia: cortar(escolher(cortar(p.nomeFantasia, 200), r?.nomeFantasia ?? null), 200),
    website: cortar(p.website, 200),
    observacoes: cortar(p.observacoes, 5000),
    telefones: numeros.map((numero) => ({ numero })),
    endereco: {
      cep,
      tipoLogradouro: logradouroDaReceita ? cortar(r?.endereco.tipoLogradouro, 50) : null,
      logradouro: cortar(logradouro, 200),
      numero: cortar(escolher(cortar(p.numero, 30), r?.endereco.numero ?? null), 30),
      complemento: cortar(
        escolher(cortar(p.complemento, 200), r?.endereco.complemento ?? null),
        200,
      ),
      bairro: cortar(escolher(cortar(p.bairro, 100), r?.endereco.bairro ?? null), 100),
      municipioCodigo,
      paisCodigo: r?.endereco.paisCodigo ?? null,
    },
    vendedorId: e.vendedorId,
    verticalId: e.verticalId,
    statusTagId: e.statusTagId,
  }
  if (r) {
    dados.mei = r.mei
    dados.regimeTributario = r.regimeTributario
    dados.porteCodigo = r.porteCodigo
    dados.dataInicioAtividades = r.dataInicioAtividades
    dados.cnaes = {
      principal: r.cnaes.principal?.codigo ?? null,
      secundarios: r.cnaes.secundarios.map((c) => c.codigo),
    }
  }
  return { ok: true, dados }
}
