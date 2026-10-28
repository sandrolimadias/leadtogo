import {
  CAMPOS_COM_VALORES_DA_OPORTUNIDADE,
  campoDoTipo,
  rotuloDoResultado,
  type ResultadoDaLinha,
  type TipoDeImportacao,
} from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'
import { Ban, CircleCheck, TriangleAlert, Upload } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Select } from '@leadtogo/ui/campos'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { cn } from '@leadtogo/ui/cn'
import { useEnvio } from '@/telas/acesso/comum'

import { PASSO, TEXTOS_DO_TIPO, TOM_DO_RESULTADO, usePrevia } from './comum'
import { Pagina } from './pagina'
import { EscolhasDoLoteDeOportunidades, ValoresDaColuna } from './mapear-oportunidades'
import { cartao, type PropsDoPasso, Rodape } from './passos'
import { type EscolhasDeValores, valoresParaEnviar } from './valores-de-campo'

// Contatos, atividades e oportunidades: Enviar · Mapear colunas · Prévia · Importar · Relatório (sem Regras
// nem Carteira).

const IGNORAR = ''
const PULAR = 'pular'

const invertido = (campos: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(campos).map(([campo, coluna]) => [coluna, campo]))

// ---------------------------------------------------------------------------------------------------
// Passo 2: Mapear colunas (e apontar cada valor da coluna Tipo, nas atividades, e das colunas Fase,
// Motivo, Origem e Solução, nas oportunidades)

export function PassoMapearDoTipo({ lote, ir, aoAlterar }: PropsDoPasso) {
  const tipo = lote.tipo as Exclude<TipoDeImportacao, 'empresas'>
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const catalogo = campoDoTipo(tipo) as readonly {
    chave: string
    rotulo: string
    obrigatorio: boolean
  }[]
  const [mapa, setMapa] = useState<Record<string, string>>(() =>
    invertido(Object.keys(lote.campos).length > 0 ? lote.campos : lote.sugestao),
  )
  const [erro, setErro] = useState<string>()
  // Atividades: o que a pessoa escolheu para cada valor da coluna Tipo (chave → id do tipo | "pular" | "")
  const [escolhas, setEscolhas] = useState<Record<string, string>>({})
  // Oportunidades: o mesmo, por campo
  const [escolhasDeValores, setEscolhasDeValores] = useState<EscolhasDeValores>({})
  const colunaDo = (campo: string) => Object.entries(mapa).find(([, c]) => c === campo)?.[0]

  const usos = new Map<string, number>()
  for (const campo of Object.values(mapa)) if (campo) usos.set(campo, (usos.get(campo) ?? 0) + 1)
  const repetido = [...usos.values()].some((n) => n > 1)
  const faltam = catalogo.filter((c) => c.obrigatorio && !usos.has(c.chave))
  const mapeadas = lote.colunas.filter((c) => mapa[c]).length
  const colunaDoTipo = Object.entries(mapa).find(([, campo]) => campo === 'tipo')?.[0]

  const opcoes = [
    { value: IGNORAR, label: 'Ignorar coluna' },
    ...catalogo.map((c) => ({ value: c.chave, label: c.obrigatorio ? `${c.rotulo} *` : c.rotulo })),
  ]

  const tiposCadastrados = useQuery({
    queryKey: ['cadastros', 'tipos-atividade'],
    enabled: tipo === 'atividades',
    retry: false,
    queryFn: async () => {
      const r = await servicos.cadastros.tiposAtividade.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const valores = useQuery({
    queryKey: ['importacao', 'valores-do-tipo', lote.id, colunaDoTipo],
    enabled: tipo === 'atividades' && colunaDoTipo !== undefined,
    retry: false,
    queryFn: async () => {
      const r = await servicos.importacao.lotes.valoresDoTipo(lote.id, colunaDoTipo)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const ativos = (tiposCadastrados.data ?? []).filter((t) => t.ativo)
  const valorDe = (chave: string, padrao: string) => escolhas[chave] ?? padrao
  const padraoDe = (i: { tipoId: string | null; origem: string }) =>
    i.origem === 'pular' ? PULAR : (i.tipoId ?? '')

  const continuar = () =>
    executar(async () => {
      setErro(undefined)
      const campos: Record<string, string> = {}
      for (const [coluna, campo] of Object.entries(mapa)) if (campo) campos[campo] = coluna
      const tiposDeAtividade: Record<string, string | null> = {}
      for (const i of valores.data?.itens ?? []) {
        const v = valorDe(i.chave, padraoDe(i))
        if (v === PULAR) tiposDeAtividade[i.chave] = null
        else if (v !== '') tiposDeAtividade[i.chave] = v
      }
      const valoresDeCampo = valoresParaEnviar(escolhasDeValores)
      const r = await servicos.importacao.lotes.alterar(lote.id, {
        campos,
        ...(tipo === 'atividades' && Object.keys(tiposDeAtividade).length > 0
          ? { tiposDeAtividade }
          : {}),
        ...(tipo === 'oportunidades' && Object.keys(valoresDeCampo).length > 0
          ? { valoresDeCampo }
          : {}),
      })
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
      trilha={`${TEXTOS_DO_TIPO[tipo].trilha} › ${lote.nome}`}
      passo={PASSO.mapear}
      tipo={tipo}
      rodape={
        <Rodape
          avancar={() => void continuar()}
          rotulo="Ver a prévia"
          desabilitado={faltam.length > 0 || repetido}
          carregando={enviando}
        />
      }
    >
      <section
        aria-label="Colunas da planilha"
        className="flex flex-col rounded-lg border border-border bg-surface"
      >
        <div className="flex flex-col gap-0.5 border-b border-border px-4 py-3.5">
          <h2 className="m-0 text-[15px] leading-5 font-semibold">Mapear colunas</h2>
          <span className="text-[13px] text-ink-muted">
            {mapeadas} de {lote.colunas.length} colunas mapeadas. O que tem * é obrigatório.
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
        {faltam.length > 0 || repetido || erro ? (
          <div className="flex flex-col gap-2 p-4">
            {faltam.length > 0 ? (
              <Alert tone="danger" title="Falta um campo obrigatório">
                Mapeie: {faltam.map((c) => c.rotulo).join(', ')}.
              </Alert>
            ) : null}
            {repetido ? (
              <Alert tone="warning" title="Duas colunas para o mesmo campo">
                Cada campo recebe uma coluna só. Escolha &quot;Ignorar coluna&quot; em uma delas.
              </Alert>
            ) : null}
            {erro ? <Alert tone="danger">{erro}</Alert> : null}
          </div>
        ) : null}
      </section>

      {tipo === 'oportunidades' ? (
        <>
          <EscolhasDoLoteDeOportunidades lote={lote} aoAlterar={aoAlterar} />
          {CAMPOS_COM_VALORES_DA_OPORTUNIDADE.map((campo) => {
            const coluna = colunaDo(campo)
            return coluna ? (
              <ValoresDaColuna
                key={campo}
                lote={lote}
                campo={campo}
                coluna={coluna}
                escolhas={escolhasDeValores[campo] ?? {}}
                aoEscolher={(chave, valor) =>
                  setEscolhasDeValores({
                    ...escolhasDeValores,
                    [campo]: { ...escolhasDeValores[campo], [chave]: valor },
                  })
                }
              />
            ) : null
          })}
        </>
      ) : null}

      {tipo === 'atividades' && colunaDoTipo ? (
        <section aria-label="Tipos de atividade" className={cartao}>
          <div className="flex flex-col gap-0.5">
            <h2 className="m-0 text-[15px] leading-5 font-semibold">Tipos de atividade</h2>
            <span className="text-[13px] text-ink-muted">
              Aponte cada valor da coluna &quot;{colunaDoTipo}&quot; para um tipo cadastrado. O que
              não tiver tipo é pulado e listado no relatório.
            </span>
          </div>
          {valores.isPending || tiposCadastrados.isPending ? (
            <Skeleton lines={3} />
          ) : valores.isError ? (
            <Alert tone="danger" title="Não foi possível listar os tipos">
              {valores.error.message}
            </Alert>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {valores.data.itens.map((i) => {
                const atual = valorDe(i.chave, padraoDe(i))
                return (
                  <li
                    key={i.chave}
                    aria-label={`Tipo ${i.valor}`}
                    className="grid items-center gap-x-4 gap-y-2 border-b border-border py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="font-semibold [overflow-wrap:anywhere]">{i.valor}</span>
                      <span className="text-[13px] text-ink-muted">
                        {i.linhas.toLocaleString('pt-BR')} {i.linhas === 1 ? 'linha' : 'linhas'}
                      </span>
                    </div>
                    <Select
                      aria-label={`Tipo para ${i.valor}`}
                      value={atual}
                      placeholder="Escolher o tipo…"
                      options={[
                        { value: PULAR, label: 'Pular essas linhas' },
                        ...ativos.map((t) => ({ value: t.id, label: t.nome })),
                      ]}
                      onChange={(e) => setEscolhas({ ...escolhas, [i.chave]: e.target.value })}
                      {...(atual === ''
                        ? { hint: 'Sem tipo escolhido: essas linhas serão puladas.' }
                        : {})}
                    />
                  </li>
                )
              })}
              {valores.data.itens.length === 0 ? (
                <li className="py-2 text-[13px] text-ink-muted">A coluna não tem valores.</li>
              ) : null}
            </ul>
          )}
        </section>
      ) : null}
    </Pagina>
  )
}

// ---------------------------------------------------------------------------------------------------
// Passo 3: Prévia

/** O que a prévia conta, no singular e no plural. */
const NOME_NA_PREVIA: Record<Exclude<TipoDeImportacao, 'empresas'>, [string, string]> = {
  contatos: ['contato', 'contatos'],
  atividades: ['atividade', 'atividades'],
  oportunidades: ['oportunidade', 'oportunidades'],
}

const ORDEM_DA_PREVISAO: ResultadoDaLinha[] = [
  'criada',
  'vinculada',
  'ja_vinculada',
  'pulada_duplicada',
  'pulada_sem_cnpj',
  'pulada_empresa_inexistente',
  'pulada_tipo_inexistente',
  'pulada_no_futuro',
  'pulada_invalida',
]

export function PassoPreviaDoTipo({ lote, ir, aoAlterar }: PropsDoPasso) {
  const tipo = lote.tipo as Exclude<TipoDeImportacao, 'empresas'>
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const previa = usePrevia(lote.id)
  const [erro, setErro] = useState<string>()
  const p = previa.data
  const previsao = (p?.previsao ?? {}) as Record<string, number>
  const cartoes = ORDEM_DA_PREVISAO.filter((r) => (previsao[r] ?? 0) > 0)
  const textos = TEXTOS_DO_TIPO[tipo]

  const importar = () =>
    executar(async () => {
      setErro(undefined)
      const r = await servicos.importacao.lotes.iniciar(lote.id)
      if (!r.ok) {
        setErro(r.erro.mensagem)
        return
      }
      aoAlterar(r.dados)
      ir(PASSO.importar)
    })

  return (
    <Pagina
      titulo="Importar planilha"
      trilha={`${textos.trilha} › ${lote.nome}`}
      passo={PASSO.previa}
      tipo={tipo}
      rodape={
        <Rodape
          voltar={() => ir(PASSO.mapear)}
          avancar={() => void importar()}
          rotulo={
            p === undefined
              ? 'Importar'
              : `Importar ${p.aImportar.toLocaleString('pt-BR')} ${NOME_NA_PREVIA[tipo][p.aImportar === 1 ? 0 : 1]}`
          }
          icone={Upload}
          desabilitado={!p || p.aImportar === 0}
          carregando={enviando}
        />
      }
    >
      {previa.isPending ? (
        <div role="status" aria-label="Carregando a prévia">
          <Skeleton lines={4} />
        </div>
      ) : previa.isError ? (
        <Alert tone="danger" title="Não foi possível montar a prévia">
          {previa.error.message}
        </Alert>
      ) : p ? (
        <>
          <p className="m-0 text-[13px] text-ink-muted">
            {p.totalLinhas.toLocaleString('pt-BR')} linhas na planilha. A prévia lê cada linha como
            a importação vai ler; nada foi gravado ainda.
          </p>
          <div
            role="list"
            aria-label="Resumo da prévia"
            className="grid grid-cols-2 gap-3 md:grid-cols-4"
          >
            {cartoes.map((r) => (
              <div
                key={r}
                role="listitem"
                className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3.5"
              >
                <span className="text-[28px] leading-8 font-semibold tabular-nums">
                  {(previsao[r] ?? 0).toLocaleString('pt-BR')}
                </span>
                <Badge tone={TOM_DO_RESULTADO[r]}>{rotuloDoResultado(r, tipo)}</Badge>
              </div>
            ))}
          </div>
          {(p.comAviso ?? 0) > 0 ? (
            <Alert tone="info">
              {(p.comAviso ?? 0).toLocaleString('pt-BR')}{' '}
              {p.comAviso === 1 ? 'linha entra' : 'linhas entram'} com aviso (por exemplo, um campo
              que não valeu); os avisos aparecem no relatório.
            </Alert>
          ) : null}
          {tipo === 'oportunidades' && (previsao['fechadas'] ?? 0) > 0 ? (
            <Alert tone="info">
              {(previsao['fechadas'] ?? 0).toLocaleString('pt-BR')}{' '}
              {previsao['fechadas'] === 1 ? 'oportunidade entra' : 'oportunidades entram'} já
              {previsao['fechadas'] === 1 ? ' fechada' : ' fechadas'} (conquistada, perdida,
              cancelada ou suspensa), com o histórico e a fase em que parou.
            </Alert>
          ) : null}
          {tipo === 'atividades' && (previsao['ficam_com_voce'] ?? 0) > 0 ? (
            <Alert tone="info">
              {(previsao['ficam_com_voce'] ?? 0).toLocaleString('pt-BR')} atividades não têm o
              e-mail do responsável: ficam com quem está importando (você).
            </Alert>
          ) : null}
          {p.problemas.length > 0 ? (
            <section aria-label="Linhas com problema" className={cartao}>
              <h2 className="m-0 text-[15px] leading-5 font-semibold">Linhas com problema</h2>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
                {p.problemas.map((l) => (
                  <li key={`${l.numero}-${l.motivo}`} className="flex gap-2">
                    <span className="w-16 shrink-0 text-ink-muted tabular-nums">
                      Linha {l.numero}
                    </span>
                    <span>{l.motivo}</span>
                  </li>
                ))}
              </ul>
              <span className="text-[13px] text-ink-muted">
                Mostrando as primeiras. O relatório final lista todas.
              </span>
            </section>
          ) : null}
          {p.aImportar === 0 ? (
            <Alert tone="warning">Nenhuma linha vai entrar. Revise as colunas ou a planilha.</Alert>
          ) : null}
          {erro ? <Alert tone="danger">{erro}</Alert> : null}
        </>
      ) : null}
    </Pagina>
  )
}
