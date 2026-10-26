import type { LoteDeImportacao } from '@leadtogo/api-client'
import { CAMPOS_DA_EMPRESA_NA_IMPORTACAO, type FonteDosDados } from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Ban, ChevronLeft, CircleCheck, TriangleAlert, Upload } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Select } from '@leadtogo/ui/campos'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { cn } from '@leadtogo/ui/cn'
import { useEnvio } from '@/telas/acesso/comum'

import { formatarDuracao, PASSO, usePrevia } from './comum'
import { Pagina } from './pagina'
import { resumoDoPerfil } from './rotulos-do-perfil'

/** O que cada passo do assistente recebe: o lote, como mudar de passo e como guardar o lote novo. */
export interface PropsDoPasso {
  lote: LoteDeImportacao
  ir: (passo: number) => void
  aoAlterar: (lote: LoteDeImportacao) => void
}

const CAMPOS = CAMPOS_DA_EMPRESA_NA_IMPORTACAO
const IGNORAR = ''

const FONTES: { value: FonteDosDados; titulo: string; descricao: string }[] = [
  {
    value: 'planilha',
    titulo: 'Usar os dados da planilha',
    descricao:
      'Cadastra o que está nas colunas mapeadas. Não consulta a Receita, a menos que uma regra precise.',
  },
  {
    value: 'receita',
    titulo: 'Buscar tudo na Receita',
    descricao: 'Basta a coluna do CNPJ. Os dados da empresa vêm da Receita. Mais lento.',
  },
  {
    value: 'completar',
    titulo: 'Completar com a Receita só os campos vazios',
    descricao: 'Usa a planilha e preenche com a Receita o que estiver em branco. Mais lento.',
  },
]

const invertido = (campos: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(campos).map(([campo, coluna]) => [coluna, campo]))

export function Rodape({
  voltar,
  avancar,
  rotulo,
  desabilitado,
  carregando,
  icone = ArrowRight,
}: {
  voltar?: () => void
  avancar: () => void
  rotulo: string
  desabilitado?: boolean
  carregando?: boolean
  icone?: typeof ArrowRight
}) {
  return (
    <>
      {voltar ? (
        <Button variant="ghost" icon={ChevronLeft} onClick={voltar}>
          Voltar
        </Button>
      ) : null}
      <span className="flex-1" />
      <Button
        variant="primary"
        iconRight={icone}
        disabled={desabilitado}
        loading={carregando}
        onClick={avancar}
      >
        {rotulo}
      </Button>
    </>
  )
}

export const cartao = 'flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-4'

// ---------------------------------------------------------------------------------------------------
// Passo 2: Mapear colunas

export function PassoMapear({ lote, ir, aoAlterar }: PropsDoPasso) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const [fonte, setFonte] = useState<FonteDosDados>(lote.fonteDados)
  // coluna da planilha → campo da empresa ('' = ignorar). Começa pelo que já foi escolhido ou, na
  // primeira vez, pelo que os títulos das colunas sugerem.
  const [mapa, setMapa] = useState<Record<string, string>>(() =>
    invertido(Object.keys(lote.campos).length > 0 ? lote.campos : lote.sugestao),
  )
  const [erro, setErro] = useState<string>()

  const usos = new Map<string, number>()
  for (const campo of Object.values(mapa)) if (campo) usos.set(campo, (usos.get(campo) ?? 0) + 1)
  const repetido = [...usos.values()].some((n) => n > 1)
  const semCnpj = !usos.has('documento')
  const mapeadas = lote.colunas.filter((c) => mapa[c]).length

  const opcoes = [
    { value: IGNORAR, label: 'Ignorar coluna' },
    ...CAMPOS.map((c) => ({ value: c.chave, label: c.rotulo })),
  ]

  const continuar = () =>
    executar(async () => {
      setErro(undefined)
      const campos: Record<string, string> = {}
      for (const [coluna, campo] of Object.entries(mapa)) if (campo) campos[campo] = coluna
      const r = await servicos.importacao.lotes.alterar(lote.id, { fonteDados: fonte, campos })
      if (!r.ok) {
        setErro(r.erro.mensagem)
        return
      }
      aoAlterar(r.dados)
      ir(PASSO.regras)
    })

  return (
    <Pagina
      titulo="Importar planilha"
      trilha={`Empresas › ${lote.nome}`}
      passo={PASSO.mapear}
      rodape={
        <Rodape
          avancar={() => void continuar()}
          rotulo="Ver as regras"
          desabilitado={semCnpj || repetido}
          carregando={enviando}
        />
      }
    >
      <section aria-label="Fonte dos dados" className={cartao}>
        <h2 className="m-0 text-[15px] leading-5 font-semibold">De onde vêm os dados?</h2>
        <div role="radiogroup" aria-label="Fonte dos dados" className="grid gap-2 md:grid-cols-3">
          {FONTES.map((f) => (
            <label
              key={f.value}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-md border p-3',
                fonte === f.value ? 'border-brand bg-brand-soft' : 'border-border bg-surface',
              )}
            >
              <span className="flex items-center gap-2 font-semibold">
                <input
                  type="radio"
                  name="fonte"
                  value={f.value}
                  checked={fonte === f.value}
                  onChange={() => setFonte(f.value)}
                />
                {f.titulo}
              </span>
              <span className="text-[13px] text-ink-muted">{f.descricao}</span>
            </label>
          ))}
        </div>
      </section>

      <section
        aria-label="Colunas da planilha"
        className="flex flex-col rounded-lg border border-border bg-surface"
      >
        <div className="flex flex-col gap-0.5 border-b border-border px-4 py-3.5">
          <h2 className="m-0 text-[15px] leading-5 font-semibold">Mapear colunas</h2>
          <span className="text-[13px] text-ink-muted">
            {mapeadas} de {lote.colunas.length} colunas mapeadas. Revise antes de seguir.
          </span>
        </div>
        <ul className="m-0 flex list-none flex-col p-0">
          {lote.colunas.map((coluna) => {
            const campo = mapa[coluna] ?? IGNORAR
            const repetida = campo !== IGNORAR && (usos.get(campo) ?? 0) > 1
            const exemplo = lote.amostra.map((l) => l[coluna]).find((v) => v) ?? ''
            return (
              <li
                key={coluna}
                aria-label={coluna}
                className="grid items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px]"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="font-semibold">{coluna}</span>
                  {exemplo ? (
                    <span className="text-[13px] [overflow-wrap:anywhere] text-ink-muted">
                      Ex.: {exemplo}
                    </span>
                  ) : null}
                </div>
                <Select
                  aria-label={`Campo para a coluna ${coluna}`}
                  options={opcoes}
                  value={campo}
                  onChange={(e) => setMapa({ ...mapa, [coluna]: e.target.value })}
                />
                <span
                  className={cn(
                    'flex items-center gap-1.5 text-[13px] font-semibold',
                    campo === IGNORAR
                      ? 'text-ink-muted'
                      : repetida
                        ? 'text-warning'
                        : 'text-success',
                  )}
                >
                  {campo === IGNORAR ? (
                    <Ban size={14} strokeWidth={1.75} aria-hidden="true" />
                  ) : repetida ? (
                    <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <CircleCheck size={14} strokeWidth={1.75} aria-hidden="true" />
                  )}
                  {campo === IGNORAR ? 'Ignorada' : repetida ? 'Repetida' : 'Mapeada'}
                </span>
              </li>
            )
          })}
        </ul>
        {semCnpj || repetido || erro ? (
          <div className="flex flex-col gap-2 p-4">
            {semCnpj ? (
              <Alert tone="danger" title="Falta um campo obrigatório">
                Mapeie a coluna do CNPJ para identificar cada empresa.
              </Alert>
            ) : null}
            {repetido ? (
              <Alert tone="warning" title="Duas colunas para o mesmo campo">
                Cada campo da empresa recebe uma coluna só. Escolha &quot;Ignorar coluna&quot; em
                uma delas.
              </Alert>
            ) : null}
            {erro ? <Alert tone="danger">{erro}</Alert> : null}
          </div>
        ) : null}
      </section>
    </Pagina>
  )
}

// ---------------------------------------------------------------------------------------------------
// Passo 3: Regras

export function PassoRegras({ lote, ir, aoAlterar }: PropsDoPasso) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const perfis = useQuery({
    queryKey: ['importacao', 'perfis'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.importacao.perfis.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const [perfilId, setPerfilId] = useState(lote.perfilId ?? '')
  const [erro, setErro] = useState<string>()

  const ativos = (perfis.data ?? []).filter((p) => p.ativo || p.id === lote.perfilId)
  const escolhido = ativos.find((p) => p.id === perfilId)

  const continuar = () =>
    executar(async () => {
      setErro(undefined)
      const r = await servicos.importacao.lotes.alterar(lote.id, { perfilId: perfilId || null })
      if (!r.ok) {
        setErro(r.erro.mensagem)
        return
      }
      aoAlterar(r.dados)
      ir(PASSO.previa)
    })

  return (
    <Pagina
      titulo="Importar planilha"
      trilha={`Empresas › ${lote.nome}`}
      passo={PASSO.regras}
      rodape={
        <Rodape
          voltar={() => ir(PASSO.mapear)}
          avancar={() => void continuar()}
          rotulo="Ver a prévia"
          desabilitado={perfis.isPending}
          carregando={enviando}
        />
      }
    >
      <section aria-label="Regras de importação" className={cartao}>
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-[15px] leading-5 font-semibold">Quais empresas entram?</h2>
          <span className="text-[13px] text-ink-muted">
            As regras valem depois da consulta à Receita. Quem não passa é pulada e listada no
            relatório, ou entra com a tag &quot;Fora do perfil&quot;, conforme o perfil.
          </span>
        </div>
        {perfis.isError ? (
          <Alert tone="danger" title="Não foi possível carregar os perfis">
            {perfis.error.message}
          </Alert>
        ) : (
          <Select
            label="Perfil de regras"
            value={perfilId}
            onChange={(e) => setPerfilId(e.target.value)}
            options={[
              { value: '', label: 'Sem regras' },
              ...ativos.map((p) => ({ value: p.id, label: p.nome })),
            ]}
            hint={
              escolhido
                ? resumoDoPerfil(escolhido)
                : 'Sem regras: entram todas as empresas com CNPJ válido que ainda não estão na carteira.'
            }
          />
        )}
        <Alert tone="info">
          Empresa que a Receita mostra como não ativa não entra se o bloqueio estiver ligado em
          Configurações → Carteira, mesmo sem regras ou com a ação &quot;importar com a tag&quot;.
        </Alert>
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
      </section>
    </Pagina>
  )
}

// ---------------------------------------------------------------------------------------------------
// Passo 4: Prévia

export function PassoPrevia({ lote, ir }: PropsDoPasso) {
  const previa = usePrevia(lote.id)
  const p = previa.data
  const cartoes = p
    ? [
        { n: p.aImportar, rotulo: 'A importar', tom: 'success' as const },
        { n: p.jaNaCarteira, rotulo: 'Já na carteira', tom: 'warning' as const },
        { n: p.repetidasNaPlanilha, rotulo: 'Repetidas na planilha', tom: 'warning' as const },
        { n: p.semCnpjValido, rotulo: 'Sem CNPJ válido', tom: 'danger' as const },
      ]
    : []
  return (
    <Pagina
      titulo="Importar planilha"
      trilha={`Empresas › ${lote.nome}`}
      passo={PASSO.previa}
      rodape={
        <Rodape
          voltar={() => ir(PASSO.regras)}
          avancar={() => ir(PASSO.carteira)}
          rotulo="Definir a carteira"
          desabilitado={!p}
        />
      }
    >
      {previa.isPending ? (
        <div role="status" aria-label="Carregando a prévia">
          <Skeleton lines={4} />
        </div>
      ) : previa.isError ? (
        <Alert
          tone="danger"
          title="Não foi possível montar a prévia"
          actions={
            <Button size="sm" onClick={() => void previa.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          {previa.error.message}
        </Alert>
      ) : p ? (
        <>
          <p className="m-0 text-[13px] text-ink-muted">
            {p.totalLinhas.toLocaleString('pt-BR')} linhas na planilha. CNPJ que já está na carteira
            é pulado e a empresa não é alterada.
          </p>
          <div
            role="list"
            aria-label="Resumo da prévia"
            className="grid grid-cols-2 gap-3 md:grid-cols-4"
          >
            {cartoes.map((c) => (
              <div
                key={c.rotulo}
                role="listitem"
                className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3.5"
              >
                <span className="text-[28px] leading-8 font-semibold tabular-nums">
                  {c.n.toLocaleString('pt-BR')}
                </span>
                <Badge tone={c.tom}>{c.rotulo}</Badge>
              </div>
            ))}
          </div>
          <section aria-label="Tempo estimado" className={cartao}>
            <h2 className="m-0 text-[15px] leading-5 font-semibold">Tempo estimado</h2>
            {p.consultaAReceita ? (
              <p className="m-0 text-[13px] text-ink-muted">
                {p.consultasNecessarias.toLocaleString('pt-BR')} consultas à Receita (as que já
                estão no cache de 30 dias não esperam), uma a cada 3 segundos · cerca de{' '}
                <strong className="text-ink">{formatarDuracao(p.estimativaSegundos)}</strong>. Você
                pode sair da tela: a importação continua em segundo plano.
              </p>
            ) : (
              <p className="m-0 text-[13px] text-ink-muted">
                Esta importação não consulta a Receita, então termina em instantes.
              </p>
            )}
          </section>
          {p.problemas.length > 0 ? (
            <section aria-label="Linhas com problema" className={cartao}>
              <h2 className="m-0 text-[15px] leading-5 font-semibold">Linhas com problema</h2>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
                {p.problemas.map((l) => (
                  <li key={l.numero} className="flex gap-2">
                    <span className="w-16 shrink-0 text-ink-muted tabular-nums">
                      Linha {l.numero}
                    </span>
                    <span>{l.motivo}</span>
                  </li>
                ))}
              </ul>
              {p.semCnpjValido + p.repetidasNaPlanilha > p.problemas.length ? (
                <span className="text-[13px] text-ink-muted">
                  Mostrando as primeiras. O relatório final lista todas.
                </span>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </Pagina>
  )
}

// ---------------------------------------------------------------------------------------------------
// Passo 5: Carteira

export function PassoCarteira({ lote, ir, aoAlterar }: PropsDoPasso) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const consulta = <T,>(
    chave: string[],
    fn: () => Promise<{ ok: boolean; dados?: T; erro?: { mensagem: string } }>,
  ) => ({
    queryKey: chave,
    retry: false,
    queryFn: async () => {
      const r = await fn()
      if (!r.ok) throw new Error(r.erro?.mensagem ?? 'Falha ao carregar')
      return r.dados as T
    },
  })
  const opcoes = useQuery(
    consulta(['carteira', 'opcoes'], async () => servicos.carteira.opcoes()),
  ).data
  const grupos = useQuery(consulta(['cadastros', 'tags'], async () => servicos.tags.listar())).data
  const origens = useQuery(
    consulta(['cadastros', 'origens'], async () => servicos.cadastros.origens.listar()),
  ).data
  const verticais = useQuery(
    consulta(['cadastros', 'verticais'], async () => servicos.cadastros.verticais.listar()),
  ).data
  const previa = usePrevia(lote.id).data

  const grupoStatus = grupos?.find((g) => g.tags.some((t) => t.chaveSistema === 'lead'))
  const status = (grupoStatus?.tags ?? []).filter((t) => t.ativo)
  const vendedores = opcoes?.vendedores ?? []

  const [vendedorId, setVendedorId] = useState(lote.vendedorId ?? '')
  const [statusTagId, setStatusTagId] = useState(lote.statusTagId ?? '')
  const [origemId, setOrigemId] = useState(lote.origemId ?? '')
  const [verticalId, setVerticalId] = useState(lote.verticalId ?? '')
  const [erro, setErro] = useState<string>()
  const [pendencias, setPendencias] = useState<string[]>([])

  // Padrões, só enquanto a pessoa não escolheu: o único membro é o vendedor, o Status começa em Lead e a
  // origem em "Importação"
  const vendedorEfetivo = vendedorId || (vendedores.length === 1 ? (vendedores[0]?.id ?? '') : '')
  const statusEfetivo = statusTagId || (status.find((t) => t.chaveSistema === 'lead')?.id ?? '')
  const origemEfetiva =
    origemId || ((origens ?? []).find((o) => o.chaveSistema === 'importacao' && o.ativo)?.id ?? '')

  const faltaAlgo = !vendedorEfetivo || !statusEfetivo
  const quantas = previa?.aImportar

  const importar = () =>
    executar(async () => {
      setErro(undefined)
      setPendencias([])
      const salvo = await servicos.importacao.lotes.alterar(lote.id, {
        vendedorId: vendedorEfetivo,
        statusTagId: statusEfetivo,
        origemId: origemEfetiva || null,
        verticalId: verticalId || null,
      })
      if (!salvo.ok) {
        setErro(salvo.erro.mensagem)
        return
      }
      aoAlterar(salvo.dados)
      if (salvo.dados.situacao !== 'pronta') {
        setPendencias(salvo.dados.pendencias)
        return
      }
      const iniciado = await servicos.importacao.lotes.iniciar(lote.id)
      if (!iniciado.ok) {
        setErro(iniciado.erro.mensagem)
        return
      }
      aoAlterar(iniciado.dados)
      ir(PASSO.importar)
    })

  return (
    <Pagina
      titulo="Importar planilha"
      trilha={`Empresas › ${lote.nome}`}
      passo={PASSO.carteira}
      rodape={
        <Rodape
          voltar={() => ir(PASSO.previa)}
          avancar={() => void importar()}
          rotulo={
            quantas === undefined
              ? 'Importar'
              : `Importar ${quantas.toLocaleString('pt-BR')} ${quantas === 1 ? 'empresa' : 'empresas'}`
          }
          icone={Upload}
          desabilitado={faltaAlgo}
          carregando={enviando}
        />
      }
    >
      <section aria-label="Carteira das empresas novas" className={cartao}>
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-[15px] leading-5 font-semibold">Carteira das empresas novas</h2>
          <span className="text-[13px] text-ink-muted">
            Vale para todas as empresas que entrarem neste lote.
          </span>
        </div>
        <div className="grid gap-x-4 gap-y-3.5 md:grid-cols-3">
          <Select
            label="Vendedor"
            required
            value={vendedorEfetivo}
            placeholder="Escolher…"
            options={vendedores.map((v) => ({ value: v.id, label: v.nome }))}
            onChange={(e) => setVendedorId(e.target.value)}
          />
          <Select
            label="Status"
            required
            value={statusEfetivo}
            placeholder="Escolher…"
            options={status.map((t) => ({ value: t.id, label: t.nome }))}
            onChange={(e) => setStatusTagId(e.target.value)}
          />
          <Select
            label="Vertical"
            value={verticalId}
            placeholder="Sem vertical"
            options={(verticais ?? [])
              .filter((v) => v.ativo)
              .map((v) => ({ value: v.id, label: v.nome }))}
            onChange={(e) => setVerticalId(e.target.value)}
          />
          <Select
            label="Origem"
            value={origemEfetiva}
            placeholder="Sem origem"
            options={(origens ?? [])
              .filter((o) => o.ativo)
              .map((o) => ({ value: o.id, label: o.nome }))}
            onChange={(e) => setOrigemId(e.target.value)}
          />
        </div>
        {pendencias.length > 0 ? (
          <Alert tone="warning" title="Falta algo para importar">
            {pendencias.join(' ')}
          </Alert>
        ) : null}
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
      </section>
    </Pagina>
  )
}
