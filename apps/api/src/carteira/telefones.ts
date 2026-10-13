import { type DetalheErro, ErroApi } from '../http/erro-api.js'
import { normalizarTelefone, type TelefoneEntrada } from '@leadtogo/shared'

export interface TelefoneParaGravar {
  numero: string
  numeroE164: string
  tipo: 'fixo' | 'celular' | 'whatsapp' | 'outro'
  descricao: string | null
  principal: boolean
}

/**
 * Normaliza os telefones digitados para E.164 (400 com o campo de cada número inválido), tira os
 * repetidos (vale o primeiro) e garante exatamente um principal: o marcado, ou o primeiro.
 */
export function normalizarTelefonesDaEmpresa(entrada: TelefoneEntrada[]): TelefoneParaGravar[] {
  const erros: DetalheErro[] = []
  const saida: TelefoneParaGravar[] = []
  entrada.forEach((t, i) => {
    const n = normalizarTelefone(t.numero)
    if (!n) {
      erros.push({ campo: `telefones.${i}.numero`, mensagem: 'telefone inválido' })
      return
    }
    const repetido = saida.find((x) => x.numeroE164 === n.e164)
    if (repetido) {
      if (t.principal) repetido.principal = true
      return
    }
    saida.push({
      numero: n.numero,
      numeroE164: n.e164,
      tipo: t.tipo ?? n.tipo,
      descricao: t.descricao ?? null,
      principal: t.principal === true,
    })
  })
  if (erros.length > 0) throw new ErroApi('validacao_invalida', 'Dados inválidos.', 400, erros)
  // Um só principal: o primeiro marcado; sem nenhum marcado, o primeiro da lista
  const indicePrincipal = Math.max(
    0,
    saida.findIndex((t) => t.principal),
  )
  saida.forEach((t, i) => {
    t.principal = i === indicePrincipal
  })
  return saida
}
