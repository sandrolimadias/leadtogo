import { CORES_DE_TAG, type CorDeTag } from '@leadtogo/ui/cores'
import { Tag } from '@leadtogo/ui/exibicao'

import { ICONE_DO_TIPO } from './abrir'
import type { ItemAchado } from './consultas'

const corDeTag = (cor: string): CorDeTag =>
  (CORES_DE_TAG as readonly string[]).includes(cor) ? (cor as CorDeTag) : 'gray'

/** O conteúdo de uma linha de resultado: ícone do tipo, título, subtítulo e o Status da empresa. */
export function ConteudoDoItem({ item }: { item: ItemAchado }) {
  const Icone = ICONE_DO_TIPO[item.tipo]
  return (
    <>
      <Icone
        size={16}
        strokeWidth={1.75}
        aria-hidden="true"
        className="mt-0.5 flex-none text-ink-subtle"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm leading-5 font-semibold">{item.titulo}</span>
        {item.subtitulo ? (
          <span className="truncate text-xs leading-4 text-ink-muted">{item.subtitulo}</span>
        ) : null}
      </span>
      {item.status ? (
        <Tag color={corDeTag(item.status.cor)} className="flex-none">
          {item.status.nome}
        </Tag>
      ) : null}
    </>
  )
}
