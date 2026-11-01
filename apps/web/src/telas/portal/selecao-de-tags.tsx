import { MAXIMO_DE_TAGS_NO_ALCANCE } from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'

import { useServicos } from '@/auth/contexto'
import { Checkbox } from '@leadtogo/ui/checkbox'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'

export type TagDoAlcance = { id: string; nome: string }

/**
 * As tags de CONTATO do alcance (Fase 4C): o item chega a quem tem alguma delas. Lista os grupos de tags de
 * contato com as tags ativas, em caixas de marcar.
 */
export function SelecaoDeTags({
  tags,
  aoMudar,
}: {
  tags: TagDoAlcance[]
  aoMudar: (tags: TagDoAlcance[]) => void
}) {
  const servicos = useServicos()
  const grupos = useQuery({
    queryKey: ['tags', 'contato'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await servicos.tags.listar('contato')
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (grupos.isError) return <Alert tone="danger">{grupos.error.message}</Alert>
  if (!grupos.data) return <Skeleton lines={2} />
  const comTags = grupos.data
    .filter((g) => g.ativo)
    .map((g) => ({ ...g, tags: g.tags.filter((t) => t.ativo) }))
    .filter((g) => g.tags.length > 0)
  if (comTags.length === 0) {
    return (
      <Alert tone="info">
        Não há tags de contato. Crie em Configurações → Tags (grupo de contato) e marque os
        contatos.
      </Alert>
    )
  }
  const marcadas = new Set(tags.map((t) => t.id))
  return (
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="mb-1 text-[13px] text-ink-muted">
        Chega a quem tem <strong>alguma</strong> das tags marcadas.
      </legend>
      {comTags.map((g) => (
        <div key={g.id} role="group" aria-label={g.nome} className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-muted">{g.nome}</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {g.tags.map((t) => (
              <Checkbox
                key={t.id}
                label={t.nome}
                checked={marcadas.has(t.id)}
                disabled={!marcadas.has(t.id) && tags.length >= MAXIMO_DE_TAGS_NO_ALCANCE}
                onChange={(e) =>
                  aoMudar(
                    e.target.checked
                      ? [...tags, { id: t.id, nome: t.nome }]
                      : tags.filter((x) => x.id !== t.id),
                  )
                }
              />
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  )
}
