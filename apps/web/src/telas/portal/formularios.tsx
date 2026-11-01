import {
  definicaoInicial,
  type Formulario,
  type ItemDeFormulario,
  ROTULO_DA_FINALIDADE,
} from '@leadtogo/shared'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ClipboardList, Copy, Download, Pencil, Plus, RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { Button } from '@leadtogo/ui/button'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

import { dataHora } from '../chamados/rotulos'
import { ConstrutorDeFormulario } from './construtor-de-formulario'

const SITUACAO = {
  rascunho: { rotulo: 'Rascunho', tom: 'neutral' },
  publicado: { rotulo: 'Publicado', tom: 'success' },
  arquivado: { rotulo: 'Arquivado', tom: 'warning' },
} as const

const textoDoValor = (v: unknown): string =>
  v === null || v === undefined
    ? ''
    : Array.isArray(v)
      ? v.join(', ')
      : typeof v === 'boolean'
        ? v
          ? 'Sim'
          : 'Não'
        : typeof v === 'string' || typeof v === 'number'
          ? String(v)
          : ''

/** As respostas do formulário, em tabela, com a exportação em CSV. */
function Respostas({ f, aoFechar }: { f: ItemDeFormulario; aoFechar: () => void }) {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const [pagina, setPagina] = useState(1)
  const respostas = useQuery({
    queryKey: ['portal', 'formularios', f.id, 'respostas', pagina],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.portal.formularios.respostas(f.id, { pagina, porPagina: 25 })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const exportar = async () => {
    const r = await servicos.portal.formularios.exportar(f.id)
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      return
    }
    const url = URL.createObjectURL(r.dados.conteudo)
    const a = document.createElement('a')
    a.href = url
    a.download = r.dados.nome
    a.click()
    URL.revokeObjectURL(url)
  }
  const d = respostas.data
  return (
    <section aria-label={`Respostas de ${f.nome}`} className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 mr-auto text-lg font-semibold">Respostas: {f.nome}</h2>
        {pode('portal.formularios') ? (
          <Button icon={Download} onClick={() => void exportar()}>
            Exportar CSV
          </Button>
        ) : null}
        <Button variant="ghost" onClick={aoFechar}>
          Fechar
        </Button>
      </header>
      {respostas.isError ? <Alert tone="danger">{respostas.error.message}</Alert> : null}
      {!d ? (
        <Skeleton lines={4} />
      ) : d.total === 0 ? (
        <EmptyState icon={ClipboardList} title="Nenhuma resposta ainda" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-surface-sunken text-left">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Quem</th>
                {d.campos.map((c) => (
                  <th key={c.id} className="px-3 py-2">
                    {c.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.itens.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{dataHora(r.criadoEm)}</td>
                  <td className="px-3 py-2">
                    {r.pessoa ?? (r.origem === 'publico' ? 'Público' : '—')}
                    {r.empresa ? <span className="block text-ink-muted">{r.empresa}</span> : null}
                  </td>
                  {d.campos.map((c) => (
                    <td key={c.id} className="px-3 py-2">
                      {textoDoValor(r.valores[c.id])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-border px-3 py-2">
            <span className="text-ink-muted">
              {d.total} {d.total === 1 ? 'resposta' : 'respostas'}
            </span>
            <span className="flex gap-2">
              <Button size="sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </Button>
              <Button
                size="sm"
                disabled={pagina * 25 >= d.total}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </Button>
            </span>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * Aba Formulários do hub (Fase 4E): a lista, o construtor e as respostas. Os formulários servem às inscrições e
 * avaliações de eventos, à pesquisa de satisfação dos chamados, ao "Seja um associado" e a usos livres.
 */
export function FormulariosDoPortal() {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const queryClient = useQueryClient()
  const podeEditar = pode('portal.formularios')
  const [editando, setEditando] = useState<Formulario | null>(null)
  const [vendo, setVendo] = useState<ItemDeFormulario | null>(null)
  const lista = useQuery({
    queryKey: ['portal', 'formularios'],
    queryFn: async () => {
      const r = await servicos.portal.formularios.listar({ porPagina: 100 })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const recarregar = () =>
    void queryClient.invalidateQueries({ queryKey: ['portal', 'formularios'] })

  const abrir = async (id: string) => {
    const r = await servicos.portal.formularios.obter(id)
    if (r.ok) setEditando(r.dados)
    else toast.error(r.erro.mensagem)
  }
  const criar = async () => {
    const r = await servicos.portal.formularios.criar({
      nome: 'Novo formulário',
      finalidade: 'livre',
      acesso: 'logado',
      captcha: true,
      definicao: definicaoInicial(),
    })
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      return
    }
    recarregar()
    setEditando(r.dados)
  }
  const agir = async (p: Promise<{ ok: boolean; erro?: { mensagem: string } }>, msg: string) => {
    const r = await p
    if (!r.ok) toast.error(r.erro?.mensagem ?? 'Não deu certo.')
    else {
      toast.success(msg)
      recarregar()
    }
  }

  if (editando) {
    return (
      <ConstrutorDeFormulario
        key={editando.id}
        formulario={editando}
        aoMudar={(f) => {
          setEditando(f)
          recarregar()
        }}
        aoFechar={() => setEditando(null)}
      />
    )
  }
  if (vendo) return <Respostas f={vendo} aoFechar={() => setVendo(null)} />

  const itens = lista.data?.itens ?? []
  return (
    <div className="flex flex-col gap-4">
      {podeEditar ? (
        <div>
          <Button variant="primary" icon={Plus} onClick={() => void criar()}>
            Novo formulário
          </Button>
        </div>
      ) : null}
      {lista.isError ? <Alert tone="danger">{lista.error.message}</Alert> : null}
      {!lista.data ? (
        <Skeleton lines={4} />
      ) : itens.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum formulário"
          description="Monte inscrições, pesquisas e cadastros com condicionais e ações."
        />
      ) : (
        <ul aria-label="Formulários" className="m-0 flex list-none flex-col gap-2 p-0">
          {itens.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 basis-64 flex-col">
                <span className="truncate font-semibold">{f.nome}</span>
                <span className="text-xs text-ink-muted">
                  {ROTULO_DA_FINALIDADE[f.finalidade]} ·{' '}
                  {f.acesso === 'publico' ? 'Público' : 'Clientes logados'} · {f.respostas}{' '}
                  {f.respostas === 1 ? 'resposta' : 'respostas'}
                  {f.ultimaRespostaEm ? ` · última ${dataHora(f.ultimaRespostaEm)}` : ''}
                </span>
              </div>
              <Badge tone={SITUACAO[f.situacao].tom}>
                {SITUACAO[f.situacao].rotulo}
                {f.versaoPublicada ? ` · v${f.versaoPublicada}` : ''}
              </Badge>
              {f.temMudancas && f.versaoPublicada ? (
                <Badge tone="warning">Mudanças não publicadas</Badge>
              ) : null}
              <span className="flex flex-wrap gap-1">
                <Button size="sm" icon={ClipboardList} onClick={() => setVendo(f)}>
                  Respostas
                </Button>
                {podeEditar ? (
                  <>
                    <Button size="sm" icon={Pencil} onClick={() => void abrir(f.id)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Copy}
                      aria-label={`Duplicar ${f.nome}`}
                      onClick={() =>
                        void agir(servicos.portal.formularios.duplicar(f.id), 'Cópia criada')
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={f.situacao === 'arquivado' ? RotateCcw : Archive}
                      aria-label={`${f.situacao === 'arquivado' ? 'Reativar' : 'Arquivar'} ${f.nome}`}
                      onClick={() =>
                        void agir(
                          servicos.portal.formularios.arquivar(f.id, f.situacao !== 'arquivado'),
                          f.situacao === 'arquivado' ? 'Reativado' : 'Arquivado',
                        )
                      }
                    />
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
