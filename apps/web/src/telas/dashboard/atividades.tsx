import type { Atividade } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button, IconButton } from '@leadtogo/ui/button'
import { TextArea } from '@leadtogo/ui/campos'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { Tabs } from '@leadtogo/ui/tabs'
import { toast } from '@leadtogo/ui/toast'
import { cn } from '@leadtogo/ui/cn'
import { quandoDaAtividade } from '@/telas/atividades/formatos'
import { MarcasDePrioridade, SituacaoDaAtividade } from '@/telas/atividades/item'
import { useRegistrarAtividade } from '@/telas/atividades/registro-contexto'
import { BolhaDoTipo } from '@/telas/cadastros/tipos-de-atividade'

const JANELAS = [
  { value: 'hoje', label: 'Hoje', curto: 'Hoje' },
  { value: 'atrasadas', label: 'Atrasadas', curto: 'Atrasadas' },
  { value: 'proximos7', label: 'Próximos 7 dias', curto: '7 dias' },
] as const
type Janela = (typeof JANELAS)[number]['value']

const VAZIO: Record<Janela, string> = {
  hoje: 'Nada para hoje. Que tal agendar a próxima visita?',
  atrasadas: 'Nenhuma atividade atrasada. Tudo em dia.',
  proximos7: 'Nada agendado para os próximos 7 dias.',
}

const POR_JANELA = 8

/**
 * "Minhas atividades" do Dashboard: abas Hoje, Atrasadas e Próximos 7 dias (as mesmas janelas da tela
 * Atividades, no fuso da empresa) e a **conclusão rápida** na própria linha: Resultado, "Concluir" ou
 * "Concluir e agendar próxima".
 */
export function MinhasAtividades({ celular }: { celular: boolean }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { abrir } = useRegistrarAtividade()
  const [janela, setJanela] = useState<Janela>('hoje')
  const [concluindo, setConcluindo] = useState<string | null>(null)
  const [resultado, setResultado] = useState('')
  const [erroDoResultado, setErroDoResultado] = useState<string>()
  const [erro, setErro] = useState<string>()
  const [enviando, setEnviando] = useState(false)

  const lista = useQuery({
    queryKey: ['atividades', 'dashboard', janela],
    retry: false,
    queryFn: async () => {
      const r = await servicos.atividades.listar({
        aba: janela === 'atrasadas' ? 'atrasadas' : janela,
        minhas: 'true',
        porPagina: POR_JANELA,
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const contagens = lista.data?.contagens

  const fechar = () => {
    setConcluindo(null)
    setResultado('')
    setErroDoResultado(undefined)
    setErro(undefined)
  }
  const concluir = async (a: Atividade, agendarProxima: boolean) => {
    if (resultado.trim() === '') return setErroDoResultado('Informe o resultado.')
    setErroDoResultado(undefined)
    setEnviando(true)
    const r = await servicos.atividades.concluir(a.id, { resultado: resultado.trim() })
    setEnviando(false)
    if (!r.ok) return setErro(r.erro.mensagem)
    await Promise.all(
      ['atividades', 'carteira', 'dashboard', 'oportunidades'].map((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      ),
    )
    toast.success('Atividade concluída', { description: a.titulo })
    fechar()
    if (agendarProxima) {
      abrir({
        ...(a.empresa ? { empresa: a.empresa } : {}),
        ...(a.contato ? { contatoId: a.contato.id } : {}),
        ...(a.oportunidade ? { oportunidade: a.oportunidade } : {}),
        tipoId: a.tipo.id,
        situacao: 'pendente',
      })
    }
  }

  return (
    <section
      aria-label="Minhas atividades"
      className="flex min-w-0 flex-col rounded-lg border border-border bg-surface"
    >
      <header className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="m-0 text-base leading-6 font-semibold">Minhas atividades</h2>
        <Link to="/atividades" className="text-[13px] font-semibold">
          Ver agenda
        </Link>
      </header>
      <Tabs
        label="Janela das atividades"
        items={JANELAS.map((j) => ({
          value: j.value,
          label: celular ? j.curto : j.label,
          ...(contagens
            ? { count: j.value === 'atrasadas' ? contagens.atrasadas : contagens[j.value] }
            : {}),
        }))}
        value={janela}
        onChange={(v) => {
          fechar()
          setJanela(v as Janela)
        }}
        className="flex flex-col [&>[role=tablist]]:px-4"
      >
        <div className="px-4 pb-3">
          {lista.isError ? (
            <Alert
              tone="danger"
              actions={
                <Button size="sm" onClick={() => void lista.refetch()}>
                  Tentar de novo
                </Button>
              }
            >
              {lista.error.message}
            </Alert>
          ) : null}
          {lista.isPending ? (
            <div
              className="flex flex-col gap-2 py-3"
              role="status"
              aria-label="Carregando atividades"
            >
              <Skeleton height={44} />
              <Skeleton height={44} />
            </div>
          ) : null}
          {lista.data && lista.data.itens.length === 0 ? (
            <EmptyState title={VAZIO[janela]} className="py-8" />
          ) : null}
          <ul aria-label={`Atividades: ${janela}`} className="m-0 flex list-none flex-col p-0">
            {lista.data?.itens.map((a) => (
              <li key={a.id} className="border-b border-border py-3 last:border-b-0">
                <div className="flex items-start gap-3">
                  <BolhaDoTipo icone={a.tipo.icone} cor={a.tipo.cor} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold [overflow-wrap:anywhere]">
                        {a.titulo}
                      </span>
                      <MarcasDePrioridade a={a} />
                      <SituacaoDaAtividade a={a} />
                    </div>
                    <span
                      className={cn(
                        'text-[13px] tabular-nums',
                        a.atrasada ? 'font-semibold text-danger' : 'text-ink-muted',
                      )}
                    >
                      {quandoDaAtividade(a)}
                    </span>
                    {a.empresa || a.contato ? (
                      <span className="flex flex-wrap gap-x-2 text-[13px] text-ink-muted">
                        {a.empresa ? (
                          <Link
                            to="/empresas/$empresaId"
                            params={{ empresaId: a.empresa.id }}
                            className="text-ink underline"
                          >
                            {a.empresa.nome}
                          </Link>
                        ) : null}
                        {a.contato ? <span>{a.contato.nome}</span> : null}
                      </span>
                    ) : null}
                  </div>
                  {a.editavel && concluindo !== a.id ? (
                    <IconButton
                      icon={Check}
                      label={`Concluir ${a.titulo}`}
                      variant="secondary"
                      onClick={() => {
                        fechar()
                        setConcluindo(a.id)
                      }}
                    />
                  ) : null}
                </div>
                {concluindo === a.id ? (
                  <div className="mt-2 flex flex-col gap-2 rounded-md bg-surface-sunken p-3">
                    {erro ? <Alert tone="danger">{erro}</Alert> : null}
                    <TextArea
                      label="Resultado"
                      required
                      rows={2}
                      placeholder="O que aconteceu?"
                      value={resultado}
                      onChange={(e) => setResultado(e.target.value)}
                      {...(erroDoResultado ? { error: erroDoResultado } : {})}
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="ghost" onClick={fechar} disabled={enviando}>
                        Cancelar
                      </Button>
                      <Button disabled={enviando} onClick={() => void concluir(a, true)}>
                        Concluir e agendar próxima
                      </Button>
                      <Button
                        variant="primary"
                        loading={enviando}
                        onClick={() => void concluir(a, false)}
                      >
                        Concluir atividade
                      </Button>
                    </div>
                  </div>
                ) : null}
                {a.resultado && concluindo !== a.id ? (
                  <p className="m-0 mt-1 pl-10 text-[13px] text-ink-muted">{a.resultado}</p>
                ) : null}
              </li>
            ))}
          </ul>
          {lista.data && lista.data.total > POR_JANELA ? (
            <p className="m-0 pt-2 text-[13px] text-ink-muted">
              Mostrando {POR_JANELA} de {lista.data.total}.{' '}
              <Link
                to="/atividades"
                search={{ aba: janela === 'atrasadas' ? 'atrasadas' : undefined }}
              >
                Ver todas as atividades
              </Link>
            </p>
          ) : null}
        </div>
      </Tabs>
      <footer className="rounded-b-lg border-t border-border bg-surface-sunken px-4 py-2 text-[13px]">
        <Link to="/atividades" className="font-semibold">
          Ver todas as atividades
        </Link>
      </footer>
    </section>
  )
}
