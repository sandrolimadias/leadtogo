import type { Atividade } from '@leadtogo/api-client'

import { dataCurta, dataEHora } from '@/telas/empresas/formatos'

/** O instante como valor de `<input type="datetime-local">` (AAAA-MM-DDTHH:mm, no fuso do aparelho). */
export function paraCampoDeDataEHora(instante: Date | string): string {
  const d = new Date(instante)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** O dia como valor de `<input type="date">` (AAAA-MM-DD, no fuso do aparelho). */
export const paraCampoDeData = (instante: Date | string): string =>
  paraCampoDeDataEHora(instante).slice(0, 10)

/** Do campo de data e hora para o instante ISO que a API recebe. */
export const doCampoDeDataEHora = (valor: string): string => new Date(valor).toISOString()

/**
 * Do campo de data (dia inteiro) para o instante enviado: meio-dia do dia escolhido. A API usa o DIA desse
 * instante no fuso da empresa e grava a meia-noite dele; o meio-dia mantém o dia certo mesmo com o
 * aparelho em outro fuso.
 */
export const doCampoDeData = (valor: string): string => new Date(`${valor}T12:00:00`).toISOString()

/** "15/10/2026 14:30", ou "15/10/2026 · dia inteiro". */
export function quandoDaAtividade(a: Pick<Atividade, 'dataInicio' | 'diaInteiro'>): string {
  return a.diaInteiro ? `${dataCurta(a.dataInicio)} · dia inteiro` : dataEHora(a.dataInicio)
}

/** O que o Badge da situação diz: Atrasada (vermelho) tem prioridade sobre Pendente. */
export function situacaoEmPalavras(a: Pick<Atividade, 'situacao' | 'atrasada'>): {
  texto: string
  tom: 'danger' | 'warning' | 'success' | 'neutral' | 'info'
} {
  if (a.situacao === 'realizada') return { texto: 'Realizada', tom: 'success' }
  if (a.situacao === 'cancelada') return { texto: 'Cancelada', tom: 'neutral' }
  if (a.atrasada) return { texto: 'Atrasada', tom: 'danger' }
  return a.situacao === 'em_execucao'
    ? { texto: 'Em execução', tom: 'info' }
    : { texto: 'Pendente', tom: 'warning' }
}

/** A dica abaixo do Resultado: o que registrar esta atividade faz na carteira. */
export function efeitoNaCarteira(contaComo: 'visita' | 'contato' | 'nenhum' | undefined): string {
  if (contaComo === 'visita') {
    return 'Atualiza a última visita e o último contato da empresa e aplica a tag Visitada.'
  }
  if (contaComo === 'contato') {
    return 'Atualiza o último contato da empresa e aplica a tag Contactada.'
  }
  return 'Este tipo não altera a carteira (não conta como visita nem como contato).'
}
