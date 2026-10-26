import type { PontoDePartida } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Plus, Star } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { MapaBase } from '@/components/mapa/mapa-base'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Checkbox } from '@leadtogo/ui/checkbox'
import { Dialog } from '@leadtogo/ui/dialog'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { PaginaDeTabela } from '@leadtogo/ui/pagina'
import { toast } from '@leadtogo/ui/toast'

// Centro inicial do mapa do ponto novo: Vitória (ES). O admin arrasta o pin ou toca no lugar certo.
const CENTRO_PADRAO = { latitude: -20.3155, longitude: -40.3128 }

interface Formulario {
  id: string | null
  nome: string
  endereco: string
  latitude: number
  longitude: number
  padrao: boolean
  ativo: boolean
}

const formularioDe = (p?: PontoDePartida): Formulario =>
  p
    ? {
        id: p.id,
        nome: p.nome,
        endereco: p.endereco ?? '',
        latitude: p.latitude,
        longitude: p.longitude,
        padrao: p.padrao,
        ativo: p.ativo,
      }
    : { id: null, nome: '', endereco: '', ...CENTRO_PADRAO, padrao: false, ativo: true }

/**
 * Configurações → Rotas (G4; `cadastros.gerir`): os minutos por visita sugeridos nas rotas novas e os pontos
 * de partida (ex.: a sede), com a posição marcada no mapa. Um é o padrão; usado em rota, só se inativa.
 */
export function TelaDeConfiguracoesDeRotas() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const config = useQuery({
    queryKey: ['rotas', 'configuracao'],
    queryFn: async () => {
      const r = await servicos.rotas.configuracao()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const pontos = useQuery({
    queryKey: ['rotas', 'pontos'],
    queryFn: async () => {
      const r = await servicos.rotas.pontos.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  // vazio até a pessoa mexer: vale o da empresa
  const [minutosDigitados, setMinutos] = useState<string | null>(null)
  const minutos = minutosDigitados ?? (config.data ? String(config.data.minutosPorVisita) : '')
  const [salvandoMinutos, setSalvandoMinutos] = useState(false)
  const [form, setForm] = useState<Formulario | null>(null)
  const [erro, setErro] = useState<string>()
  const [salvando, setSalvando] = useState(false)

  async function salvarMinutos() {
    setSalvandoMinutos(true)
    const r = await servicos.rotas.alterarConfiguracao(Number(minutos))
    setSalvandoMinutos(false)
    if (!r.ok) return void toast.error(r.erro.mensagem)
    queryClient.setQueryData(['rotas', 'configuracao'], r.dados)
    toast.success('Minutos por visita salvos')
  }

  async function salvarPonto() {
    if (!form) return
    setSalvando(true)
    setErro(undefined)
    const dados = {
      nome: form.nome,
      endereco: form.endereco.trim() || null,
      latitude: form.latitude,
      longitude: form.longitude,
      padrao: form.padrao,
    }
    const r = form.id
      ? await servicos.rotas.pontos.alterar(form.id, { ...dados, ativo: form.ativo })
      : await servicos.rotas.pontos.criar(dados)
    setSalvando(false)
    if (!r.ok) return setErro(r.erro.mensagem)
    await queryClient.invalidateQueries({ queryKey: ['rotas', 'pontos'] })
    setForm(null)
    toast.success(form.id ? 'Ponto de partida salvo' : 'Ponto de partida criado')
  }

  async function excluir(p: PontoDePartida) {
    const r = await servicos.rotas.pontos.excluir(p.id)
    if (!r.ok) return void toast.error(r.erro.mensagem)
    await queryClient.invalidateQueries({ queryKey: ['rotas', 'pontos'] })
    toast.success('Ponto de partida excluído')
  }

  return (
    <PaginaDeTabela>
      <h1 className="m-0 text-[26px] leading-8 font-semibold max-md:text-[22px]">Rotas</h1>
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="m-0 text-base font-semibold">Minutos por visita</h2>
        <p className="m-0 text-sm text-ink-muted">
          Sugerido nas rotas novas para estimar o tempo total (deslocamento + visitas). Cada rota
          pode ajustar o seu.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label="Minutos"
            type="number"
            min={0}
            max={480}
            className="w-[140px]"
            value={minutos}
            onChange={(e) => setMinutos(e.target.value)}
          />
          <Button
            loading={salvandoMinutos}
            disabled={minutos === '' || Number(minutos) < 0 || Number(minutos) > 480}
            onClick={() => void salvarMinutos()}
          >
            Salvar
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 flex-1 text-base font-semibold">Pontos de partida</h2>
          <Button icon={Plus} onClick={() => setForm(formularioDe())}>
            Novo ponto
          </Button>
        </div>
        <p className="m-0 text-sm text-ink-muted">
          De onde as rotas podem sair (a sede, uma filial). Sem ponto, a rota sai da posição atual
          do aparelho, que não é gravada.
        </p>
        {pontos.isPending ? (
          <Skeleton lines={3} />
        ) : pontos.isError ? (
          <Alert tone="danger">{pontos.error.message}</Alert>
        ) : pontos.data.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Nenhum ponto de partida"
            description="Cadastre a sede para usá-la como saída das rotas."
          />
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {pontos.data.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-2 border-b border-border py-2 last:border-b-0"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{p.nome}</span>
                  <span className="truncate text-xs text-ink-muted">
                    {p.endereco ?? 'Sem endereço'}
                  </span>
                </span>
                {p.padrao ? (
                  <Badge tone="accent" icon={Star}>
                    Padrão
                  </Badge>
                ) : null}
                {!p.ativo ? <Badge tone="outline">Inativo</Badge> : null}
                <Button size="sm" onClick={() => setForm(formularioDe(p))}>
                  Alterar
                </Button>
                <Button size="sm" variant="danger-ghost" onClick={() => void excluir(p)}>
                  Excluir
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={form !== null}
        onOpenChange={(v) => (v ? undefined : setForm(null))}
        title={form?.id ? 'Alterar ponto de partida' : 'Novo ponto de partida'}
        description="Arraste o pin ou toque no mapa no lugar exato da saída."
        footer={
          <>
            <Button onClick={() => setForm(null)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={salvando}
              disabled={!form || form.nome.trim() === ''}
              onClick={() => void salvarPonto()}
            >
              Salvar
            </Button>
          </>
        }
      >
        {form ? (
          <div className="flex flex-col gap-3">
            <TextField
              label="Nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              required
            />
            <TextField
              label="Endereço (para exibir)"
              value={form.endereco}
              onChange={(e) => setForm({ ...form, endereco: e.target.value })}
            />
            <MapaBase
              rotulo="Posição do ponto de partida"
              className="h-[300px] w-full rounded-md"
              centro={[form.longitude, form.latitude]}
              zoom={14}
              arrastavel={{
                latitude: form.latitude,
                longitude: form.longitude,
                aoSoltar: (latitude, longitude) => setForm({ ...form, latitude, longitude }),
              }}
              aoClicarNoMapa={(latitude, longitude) => setForm({ ...form, latitude, longitude })}
            />
            <Checkbox
              label="Ponto padrão das rotas novas"
              checked={form.padrao}
              onChange={(e) => setForm({ ...form, padrao: e.target.checked })}
            />
            {form.id ? (
              <Checkbox
                label="Ativo"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              />
            ) : null}
            {erro ? <Alert tone="danger">{erro}</Alert> : null}
          </div>
        ) : null}
      </Dialog>
    </PaginaDeTabela>
  )
}
