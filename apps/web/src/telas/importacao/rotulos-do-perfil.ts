import type { PerfilDeImportacao } from '@leadtogo/api-client'
import type { AcaoForaDoPerfil, EstabelecimentoDoPerfil } from '@leadtogo/shared'

export const ESTABELECIMENTOS: { value: EstabelecimentoDoPerfil; label: string }[] = [
  { value: 'ambas', label: 'Matriz e filiais' },
  { value: 'matriz', label: 'Só matriz' },
  { value: 'filial', label: 'Só filiais' },
]
export const ACOES: { value: AcaoForaDoPerfil; label: string }[] = [
  { value: 'pular', label: 'Pular e listar no relatório' },
  { value: 'importar_com_tag', label: 'Importar com a tag "Fora do perfil"' },
]
const rotuloDe = <T extends string>(lista: { value: T; label: string }[], valor: T) =>
  lista.find((o) => o.value === valor)?.label ?? valor

/** Um resumo em uma linha das regras do perfil. */
export function resumoDoPerfil(p: PerfilDeImportacao): string {
  const partes = [
    p.exigeSituacaoAtiva ? 'Situação ativa' : 'Qualquer situação',
    rotuloDe(ESTABELECIMENTOS, p.estabelecimento),
    p.excluirMei ? 'Sem MEI' : 'Com MEI',
    p.cnaes.length === 0
      ? 'Qualquer CNAE'
      : `${p.cnaes.length} ${p.cnaes.length === 1 ? 'CNAE' : 'CNAEs'}${p.aceitarCnaeSecundario ? ' (também nos secundários)' : ''}`,
    rotuloDe(ACOES, p.acaoForaDoPerfil),
  ]
  return partes.join(' · ')
}
