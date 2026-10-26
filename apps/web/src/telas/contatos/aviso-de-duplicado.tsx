import type { ContatoExistente } from '@leadtogo/shared'

import { Button } from '@leadtogo/ui/button'
import { Alert } from '@leadtogo/ui/feedback'

/**
 * Aviso de contato duplicado (mesmo e-mail ou telefone). Só avisa: a pessoa abre o existente ou salva
 * mesmo assim. O nome só vem quando ela pode ver aquele contato.
 */
export function AvisoDeDuplicado({
  existentes,
  rotuloDoBotao,
  enviando,
  aoAbrir,
  aoSalvarMesmoAssim,
}: {
  existentes: ContatoExistente[]
  /** "Criar mesmo assim" no cadastro; "Salvar mesmo assim" na edição */
  rotuloDoBotao: string
  enviando: boolean
  aoAbrir: (id: string) => void
  aoSalvarMesmoAssim: () => void
}) {
  const visiveis = existentes.filter((e) => e.visivel && e.id)
  const ocultos = existentes.length - visiveis.length
  const motivo = (e: ContatoExistente) =>
    e.motivo === 'email' ? 'o mesmo e-mail' : 'o mesmo telefone'
  return (
    <Alert
      tone="warning"
      title="Já existe um contato parecido"
      actions={
        <Button size="sm" loading={enviando} onClick={aoSalvarMesmoAssim}>
          {rotuloDoBotao}
        </Button>
      }
    >
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {visiveis.map((e) => (
          <li key={`${e.id}-${e.motivo}`} className="flex flex-wrap items-center gap-2">
            <span>
              <strong>{e.nome}</strong> tem {motivo(e)}.
            </span>
            <Button size="sm" onClick={() => aoAbrir(e.id as string)}>
              Abrir contato
            </Button>
          </li>
        ))}
        {ocultos > 0 ? (
          <li>
            {ocultos === 1
              ? 'Outro contato, de uma carteira que você não vê, tem o mesmo e-mail ou telefone.'
              : `${ocultos} contatos de carteiras que você não vê têm o mesmo e-mail ou telefone.`}
          </li>
        ) : null}
      </ul>
    </Alert>
  )
}
