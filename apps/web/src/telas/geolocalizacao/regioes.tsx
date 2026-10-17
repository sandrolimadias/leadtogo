import type { RegiaoGeo } from '@leadtogo/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button, IconButton } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { TextField } from '@/components/ui/campos'
import { Alert } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { DialogoDeConfirmacao } from '@/telas/cadastros/base'

/** Cadastro de região: nome e municípios (lista filtrável, com a opção de marcar uma microrregião inteira). */
function FormularioDeRegiao({
  regiao,
  todas,
  aoFechar,
}: {
  regiao: RegiaoGeo | null
  todas: RegiaoGeo[]
  aoFechar: () => void
}) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [nome, setNome] = useState(regiao?.nome ?? '')
  const [marcados, setMarcados] = useState<Set<number>>(
    new Set(regiao?.municipios.map((m) => m.codigoIbge) ?? []),
  )
  const [filtro, setFiltro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string>()

  const cidades = useMemo(() => {
    const porCodigo = new Map<number, string>()
    for (const r of todas) for (const m of r.municipios) porCodigo.set(m.codigoIbge, m.nome)
    return [...porCodigo].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [todas])
  const visiveis = cidades.filter(([, n]) =>
    n.toLocaleLowerCase('pt-BR').includes(filtro.trim().toLocaleLowerCase('pt-BR')),
  )
  const micros = todas.filter((r) => r.tipo === 'microrregiao')

  const alternar = (codigo: number) =>
    setMarcados((atual) => {
      const novo = new Set(atual)
      if (novo.has(codigo)) novo.delete(codigo)
      else novo.add(codigo)
      return novo
    })

  async function salvar() {
    setSalvando(true)
    setErro(undefined)
    const dados = { nome: nome.trim(), municipios: [...marcados] }
    const r = regiao
      ? await servicos.geolocalizacao.regioes.alterar(regiao.id, dados)
      : await servicos.geolocalizacao.regioes.criar(dados)
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success(regiao ? 'Região alterada.' : 'Região criada.')
    await queryClient.invalidateQueries({ queryKey: ['geolocalizacao', 'regioes'] })
    aoFechar()
  }

  return (
    <Dialog
      open
      onOpenChange={(a) => {
        if (!a) aoFechar()
      }}
      title={regiao ? 'Alterar região' : 'Nova região'}
      description="Junte cidades numa região para geocodificar e (depois) filtrar o mapa de uma vez."
      width={560}
      footer={
        <>
          <Button onClick={aoFechar}>Cancelar</Button>
          <Button
            variant="primary"
            loading={salvando}
            disabled={nome.trim() === '' || marcados.size === 0}
            onClick={() => void salvar()}
          >
            Salvar
          </Button>
        </>
      }
    >
      <TextField
        label="Nome"
        value={nome}
        maxLength={80}
        onChange={(e) => setNome(e.target.value)}
      />
      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold" htmlFor="micro-inteira">
          Marcar uma microrregião inteira
        </label>
        <select
          id="micro-inteira"
          className="h-(--ctl) rounded-sm border border-border-strong bg-surface px-3 text-[length:var(--ctl-font)]"
          value=""
          onChange={(e) => {
            const r = micros.find((m) => m.id === e.target.value)
            if (r) setMarcados((a) => new Set([...a, ...r.municipios.map((m) => m.codigoIbge)]))
          }}
        >
          <option value="">Escolha para marcar todas as cidades dela…</option>
          {micros.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </select>
      </div>
      <TextField
        label={`Cidades (${marcados.size} marcadas)`}
        placeholder="Filtrar pelo nome"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
      />
      <ul
        aria-label="Cidades"
        className="m-0 flex max-h-[220px] list-none flex-col gap-1 overflow-y-auto rounded-sm border border-border p-2"
      >
        {visiveis.map(([codigo, n]) => (
          <li key={codigo}>
            <Checkbox label={n} checked={marcados.has(codigo)} onChange={() => alternar(codigo)} />
          </li>
        ))}
      </ul>
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
    </Dialog>
  )
}

/** As regiões: as microrregiões oficiais (só leitura) e as do administrador (criar, alterar, excluir). */
export function Regioes({ regioes, podeEditar }: { regioes: RegiaoGeo[]; podeEditar: boolean }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState<RegiaoGeo | 'nova' | null>(null)
  const [excluindo, setExcluindo] = useState<RegiaoGeo | null>(null)
  const [erro, setErro] = useState<string>()
  const proprias = regioes.filter((r) => r.tipo === 'personalizada')
  const oficiais = regioes.filter((r) => r.tipo === 'microrregiao')

  async function excluir(r: RegiaoGeo) {
    const res = await servicos.geolocalizacao.regioes.excluir(r.id)
    if (!res.ok) {
      setErro(res.erro.mensagem)
      return
    }
    setExcluindo(null)
    toast.success('Região excluída.')
    await queryClient.invalidateQueries({ queryKey: ['geolocalizacao', 'regioes'] })
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Regiões da empresa" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="m-0 flex-1 text-[15px] leading-5 font-semibold">Regiões da empresa</h2>
          {podeEditar ? (
            <Button icon={Plus} size="sm" onClick={() => setEditando('nova')}>
              Nova região
            </Button>
          ) : null}
        </div>
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
        {proprias.length === 0 ? (
          <p className="m-0 text-sm text-ink-muted">
            Nenhuma região criada. As microrregiões oficiais abaixo já servem para geocodificar.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {proprias.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{r.nome}</span>
                  <span className="truncate text-[13px] text-ink-muted">
                    {r.municipios.length} {r.municipios.length === 1 ? 'cidade' : 'cidades'}:{' '}
                    {r.municipios.map((m) => m.nome).join(', ')}
                  </span>
                </div>
                {podeEditar ? (
                  <>
                    <IconButton
                      icon={Pencil}
                      label={`Alterar ${r.nome}`}
                      onClick={() => setEditando(r)}
                    />
                    <IconButton
                      icon={Trash2}
                      label={`Excluir ${r.nome}`}
                      onClick={() => setExcluindo(r)}
                    />
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Microrregiões oficiais" className="flex flex-col gap-3">
        <h2 className="m-0 text-[15px] leading-5 font-semibold">Microrregiões oficiais (IBGE)</h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 max-md:grid-cols-1">
          {oficiais.map((r) => (
            <li key={r.id} className="rounded-md border border-border bg-surface px-3 py-2">
              <span className="text-sm font-semibold">{r.nome}</span>{' '}
              <span className="text-[13px] text-ink-muted">
                ({r.municipios.length} {r.municipios.length === 1 ? 'cidade' : 'cidades'})
              </span>
            </li>
          ))}
        </ul>
      </section>

      {editando ? (
        <FormularioDeRegiao
          regiao={editando === 'nova' ? null : editando}
          todas={regioes}
          aoFechar={() => setEditando(null)}
        />
      ) : null}
      {excluindo ? (
        <DialogoDeConfirmacao
          aberto
          titulo={`Excluir a região ${excluindo.nome}?`}
          descricao="Os lotes já feitos não mudam. Você pode criar a região de novo quando quiser."
          rotuloDoBotao="Excluir"
          enviando={false}
          aoConfirmar={() => void excluir(excluindo)}
          aoFechar={() => setExcluindo(null)}
        />
      ) : null}
    </div>
  )
}
