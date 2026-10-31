import type { Oportunidade } from '@leadtogo/api-client'
import type { CorDeTag } from '@leadtogo/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Tag } from '@leadtogo/ui/exibicao'
import { toast } from '@leadtogo/ui/toast'
import { EditarTags } from '@/telas/empresas/ficha-tags'
import { temTagsParaEscolher } from '@/telas/contatos/tags'

import { useGruposDeTagsDeOportunidade } from './tags'

/**
 * As tags da oportunidade no cabeçalho da ficha e o botão "Editar tags" (para quem edita a oportunidade,
 * também depois de fechada, quando existe algum grupo de tags de oportunidade com tag ativa).
 */
export function TagsDaOportunidade({ oportunidade: o }: { oportunidade: Oportunidade }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const grupos = useGruposDeTagsDeOportunidade()
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string>()
  const podeEditar = o.editavel && temTagsParaEscolher(grupos.data)

  const salvar = async (tagIds: string[]) => {
    setSalvando(true)
    setErro(undefined)
    const r = await servicos.oportunidades.definirTags(o.id, tagIds)
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    setEditando(false)
    await queryClient.invalidateQueries({ queryKey: ['oportunidades'] })
    toast.success('Tags salvas')
  }

  if (o.tags.length === 0 && !podeEditar) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {o.tags.map((t) => (
        <Tag key={t.id} color={t.cor as CorDeTag}>
          {t.nome}
        </Tag>
      ))}
      {podeEditar ? (
        <Button
          variant="ghost"
          size="sm"
          icon={Pencil}
          onClick={() => {
            setErro(undefined)
            setEditando(true)
          }}
        >
          Editar tags
        </Button>
      ) : null}
      {editando ? (
        <EditarTags
          aberto
          aoFechar={() => setEditando(false)}
          nome={o.titulo}
          atuais={o.tags.map((t) => t.id)}
          grupos={grupos.data ?? []}
          salvando={salvando}
          erro={erro}
          aoSalvar={(tagIds) => void salvar(tagIds)}
        />
      ) : null}
    </div>
  )
}
