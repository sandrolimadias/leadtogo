import type { EmpresaCarteira, TagGrupo } from '@leadtogo/api-client'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/feedback'
import { Janela } from '@/telas/cadastros/base'

/** Os grupos que a pessoa pode mexer: os manuais e ativos (a Visitação é do sistema). */
const gruposEditaveis = (grupos: TagGrupo[]) => grupos.filter((g) => !g.automatico && g.ativo)

/**
 * Editar tags da empresa: uma escolha por grupo de seleção única (o Status, obrigatório, sempre tem uma)
 * e quantas quiser nos de seleção múltipla. As tags automáticas ficam como estão.
 */
export function EditarTags({
  aberto,
  aoFechar,
  empresa,
  grupos,
  salvando,
  erro,
  aoSalvar,
}: {
  aberto: boolean
  aoFechar: () => void
  empresa: EmpresaCarteira
  grupos: TagGrupo[]
  salvando: boolean
  erro?: string | undefined
  aoSalvar: (tagIds: string[]) => void
}) {
  const [escolhidas, setEscolhidas] = useState<Set<string>>(
    () => new Set(empresa.tags.map((t) => t.id)),
  )
  const editaveis = gruposEditaveis(grupos)

  const escolher = (grupo: TagGrupo, tagId: string, ligada: boolean) =>
    setEscolhidas((atual) => {
      const novo = new Set(atual)
      if (grupo.selecao === 'unica') for (const t of grupo.tags) novo.delete(t.id)
      if (ligada) novo.add(tagId)
      else novo.delete(tagId)
      return novo
    })

  const tagIds = editaveis.flatMap((g) =>
    g.tags.filter((t) => escolhidas.has(t.id)).map((t) => t.id),
  )
  const faltaObrigatorio = editaveis.some(
    (g) => g.obrigatorio && !g.tags.some((t) => escolhidas.has(t.id)),
  )

  return (
    <Janela
      open={aberto}
      onOpenChange={(a) => (a ? undefined : aoFechar())}
      title="Editar tags"
      description={empresa.nome}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={salvando}
            disabled={faltaObrigatorio}
            onClick={() => aoSalvar(tagIds)}
          >
            Salvar tags
          </Button>
        </>
      }
    >
      {editaveis.map((g) => {
        // inativa só aparece se a empresa já a tem (tirar é possível; pôr de novo, não)
        const tags = g.tags.filter((t) => t.ativo || escolhidas.has(t.id))
        return (
          <fieldset key={g.id} className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 p-0 text-[13px] font-semibold">
              {g.nome}
              <span className="ml-2 font-normal text-ink-muted">
                {g.selecao === 'unica' ? 'escolha uma' : 'escolha quantas quiser'}
              </span>
            </legend>
            {g.selecao === 'unica' ? (
              <>
                {tags.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`grupo-${g.id}`}
                      checked={escolhidas.has(t.id)}
                      onChange={() => escolher(g, t.id, true)}
                    />
                    {t.nome}
                    {t.ativo ? '' : ' (inativa)'}
                  </label>
                ))}
                {g.obrigatorio ? null : (
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
                    <input
                      type="radio"
                      name={`grupo-${g.id}`}
                      checked={!tags.some((t) => escolhidas.has(t.id))}
                      onChange={() =>
                        setEscolhidas(
                          (a) => new Set([...a].filter((id) => !tags.some((t) => t.id === id))),
                        )
                      }
                    />
                    Nenhuma
                  </label>
                )}
              </>
            ) : (
              tags.map((t) => (
                <Checkbox
                  key={t.id}
                  label={t.ativo ? t.nome : `${t.nome} (inativa)`}
                  checked={escolhidas.has(t.id)}
                  onChange={(e) => escolher(g, t.id, e.target.checked)}
                />
              ))
            )}
          </fieldset>
        )
      })}
      {erro ? (
        <Alert tone="danger" title="Não foi possível salvar as tags">
          {erro}
        </Alert>
      ) : null}
    </Janela>
  )
}
