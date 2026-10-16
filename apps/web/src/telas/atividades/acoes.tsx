import type { Atividade } from '@leadtogo/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { Ban, Check, Ellipsis, Pencil, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { IconButton } from '@/components/ui/button'
import { Menu, type ItemDeMenu } from '@/components/ui/menu'
import { toast } from '@/components/ui/toast'
import { DialogoDeConfirmacao } from '@/telas/cadastros/base'

import { doCampoDeDataEHora } from './formatos'
import { JanelaDeConclusao } from './janela-de-conclusao'
import { useRegistrarAtividade } from './registro-contexto'

/**
 * As ações de uma atividade (Concluir, Editar, Cancelar, Excluir) com as janelas que elas abrem. Quem
 * usa chama `menu(atividade)` para o menu de cada linha e desenha `janelas` uma vez, no fim da tela.
 */
export function useAcoesDaAtividade(): {
  menu: (a: Atividade) => ReactNode
  janelas: ReactNode
} {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { abrir } = useRegistrarAtividade()
  const [concluindo, setConcluindo] = useState<Atividade | null>(null)
  const [cancelando, setCancelando] = useState<Atividade | null>(null)
  const [excluindo, setExcluindo] = useState<Atividade | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string>()

  const atualizar = () =>
    Promise.all(
      ['atividades', 'carteira', 'contatos'].map((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      ),
    )

  const fechar = () => {
    setConcluindo(null)
    setCancelando(null)
    setExcluindo(null)
    setErro(undefined)
  }

  const cancelar = async () => {
    if (!cancelando) return
    setEnviando(true)
    const r = await servicos.atividades.cancelar(cancelando.id)
    setEnviando(false)
    if (!r.ok) return setErro(r.erro.mensagem)
    await atualizar()
    toast.success('Atividade cancelada')
    fechar()
  }
  const excluir = async () => {
    if (!excluindo) return
    setEnviando(true)
    const r = await servicos.atividades.excluir(excluindo.id)
    setEnviando(false)
    if (!r.ok) return setErro(r.erro.mensagem)
    await atualizar()
    toast.success('Atividade excluída')
    fechar()
  }

  const itens = (a: Atividade): ItemDeMenu[] => {
    const aberta = a.situacao === 'pendente' || a.situacao === 'em_execucao'
    return [
      ...(aberta
        ? [{ icon: Check, label: 'Concluir', onSelect: () => setConcluindo(a) } as ItemDeMenu]
        : []),
      ...(a.situacao !== 'cancelada'
        ? [
            { icon: Pencil, label: 'Editar', onSelect: () => abrir({ atividade: a }) },
            { icon: Ban, label: 'Cancelar atividade', onSelect: () => setCancelando(a) },
            { separator: true as const },
          ]
        : []),
      { icon: Trash2, label: 'Excluir', danger: true, onSelect: () => setExcluindo(a) },
    ]
  }

  const menu = (a: Atividade) =>
    a.editavel ? (
      <Menu
        align="end"
        items={itens(a)}
        trigger={
          <IconButton icon={Ellipsis} label={`Ações de ${a.titulo}`} variant="ghost" size="sm" />
        }
      />
    ) : null

  const janelas = (
    <>
      {concluindo ? (
        <JanelaDeConclusao
          atividade={concluindo}
          aoFechar={fechar}
          aoConcluir={async (resultado, quando, agendarProxima) => {
            const r = await servicos.atividades.concluir(concluindo.id, {
              resultado,
              realizadaEm: doCampoDeDataEHora(quando),
            })
            if (!r.ok) return r.erro.mensagem
            await atualizar()
            toast.success('Atividade concluída', { description: concluindo.titulo })
            const a = concluindo
            fechar()
            if (agendarProxima) {
              abrir({
                ...(a.empresa ? { empresa: a.empresa } : {}),
                ...(a.contato ? { contatoId: a.contato.id } : {}),
                tipoId: a.tipo.id,
                situacao: 'pendente',
              })
            }
            return undefined
          }}
        />
      ) : null}
      <DialogoDeConfirmacao
        aberto={cancelando !== null}
        titulo="Cancelar a atividade?"
        descricao={
          cancelando?.situacao === 'realizada'
            ? 'A atividade já foi realizada: ao cancelar, ela deixa de contar como visita ou contato da empresa (o resultado fica guardado).'
            : 'A atividade deixa de aparecer como agendada. O histórico guarda o cancelamento.'
        }
        rotuloDoBotao="Cancelar atividade"
        erro={erro}
        enviando={enviando}
        aoConfirmar={() => void cancelar()}
        aoFechar={fechar}
      />
      <DialogoDeConfirmacao
        aberto={excluindo !== null}
        titulo="Excluir a atividade?"
        descricao={
          excluindo?.situacao === 'realizada'
            ? 'A atividade realizada sai da agenda e do histórico, e a última visita e o último contato da empresa voltam ao que as outras atividades dizem.'
            : 'A atividade sai da agenda e do histórico.'
        }
        rotuloDoBotao="Excluir"
        erro={erro}
        enviando={enviando}
        aoConfirmar={() => void excluir()}
        aoFechar={fechar}
      />
    </>
  )
  return { menu, janelas }
}
