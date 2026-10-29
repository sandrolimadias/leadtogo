import type { LoteDeImportacao } from '@leadtogo/api-client'
import { type CampoComValores, ROTULO_DO_STATUS } from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Select } from '@leadtogo/ui/campos'
import { Switch } from '@leadtogo/ui/checkbox'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { useEnvio } from '@/telas/acesso/comum'

import { cartao } from './passos'
import { PULAR } from './valores-de-campo'

// Importação de oportunidades, passo Mapear colunas: o funil do lote, a chave "vira Cliente" e o
// mapeamento dos valores das colunas Fase, Motivo, Origem e Solução para os cadastros
// (docs/plano_importacao_oportunidades.md, seção 7).

/** Funil do lote e a chave "Conquistadas mudam a empresa para Cliente": cada mudança vale na hora. */
export function EscolhasDoLoteDeOportunidades({
  lote,
  aoAlterar,
}: {
  lote: LoteDeImportacao
  aoAlterar: (lote: LoteDeImportacao) => void
}) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const [erro, setErro] = useState<string>()
  const funis = useQuery({
    queryKey: ['funis'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.funis.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const ativos = (funis.data ?? []).filter((f) => f.ativo)
  const padrao = ativos.find((f) => f.padrao)

  const alterar = (dados: { funilId?: string | null; clienteAoConquistar?: boolean }) =>
    executar(async () => {
      setErro(undefined)
      const r = await servicos.importacao.lotes.alterar(lote.id, dados)
      if (!r.ok) {
        setErro(r.erro.mensagem)
        return
      }
      aoAlterar(r.dados)
    })

  return (
    <section aria-label="Funil e fechamento" className={cartao}>
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-[15px] leading-5 font-semibold">Funil e fechamento</h2>
        <span className="text-[13px] text-ink-muted">
          Todas as oportunidades desta planilha entram no mesmo funil.
        </span>
      </div>
      {funis.isPending ? (
        <Skeleton lines={2} />
      ) : funis.isError ? (
        <Alert tone="danger" title="Não foi possível listar os funis">
          {funis.error.message}
        </Alert>
      ) : (
        <>
          <Select
            label="Funil"
            value={lote.funilId ?? padrao?.id ?? ''}
            disabled={enviando}
            options={ativos.map((f) => ({
              value: f.id,
              label: f.padrao ? `${f.nome} (padrão)` : f.nome,
            }))}
            onChange={(e) =>
              void alterar({ funilId: e.target.value === padrao?.id ? null : e.target.value })
            }
            hint="Trocar o funil desfaz as fases que você apontou abaixo."
          />
          <Switch
            label="Conquistadas mudam o Status da empresa para Cliente"
            checked={lote.clienteAoConquistar}
            disabled={enviando}
            onChange={(e) => void alterar({ clienteAoConquistar: e.target.checked })}
          />
          <span className="text-[13px] text-ink-muted">
            Desligado, as oportunidades conquistadas entram no histórico sem mexer no Status das
            empresas.
          </span>
        </>
      )}
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
    </section>
  )
}

const TEXTOS_DO_CAMPO: Record<
  CampoComValores,
  { titulo: string; descricao: (coluna: string) => string; semCadastro: string; vazio: string }
> = {
  fase: {
    titulo: 'Fases',
    descricao: (coluna) =>
      `Aponte cada valor da coluna "${coluna}" para uma fase do funil. O que não tiver fase é pulado e listado no relatório; linha com a coluna em branco entra na primeira fase.`,
    semCadastro: 'Pular essas linhas',
    vazio: 'Sem fase escolhida: essas linhas serão puladas.',
  },
  motivo: {
    titulo: 'Motivos',
    descricao: (coluna) =>
      `Aponte cada valor da coluna "${coluna}" para um motivo cadastrado. Perdida, Cancelada e Suspensa sem motivo válido para o status são puladas.`,
    semCadastro: 'Pular essas linhas',
    vazio: 'Sem motivo escolhido: as perdidas, canceladas e suspensas serão puladas.',
  },
  origem: {
    titulo: 'Origens',
    descricao: (coluna) =>
      `Aponte cada valor da coluna "${coluna}" para uma origem cadastrada. Sem origem, a oportunidade entra sem ela.`,
    semCadastro: 'Deixar sem origem',
    vazio: 'Sem origem escolhida: entra sem origem, com aviso.',
  },
  solucao: {
    titulo: 'Soluções',
    descricao: (coluna) =>
      `Aponte cada valor da coluna "${coluna}" para uma solução cadastrada. Sem solução, a oportunidade entra sem ela.`,
    semCadastro: 'Deixar sem solução',
    vazio: 'Sem solução escolhida: entra sem solução, com aviso.',
  },
}

/** Os cadastros ativos que o campo aceita (as fases, do funil do lote). */
function useOpcoesDoCampo(campo: CampoComValores, funilId: string | null) {
  const servicos = useServicos()
  return useQuery({
    queryKey: ['importacao', 'opcoes', campo, campo === 'fase' ? funilId : null],
    retry: false,
    queryFn: async (): Promise<{ value: string; label: string }[]> => {
      if (campo === 'fase') {
        const r = await servicos.funis.listar()
        if (!r.ok) throw new Error(r.erro.mensagem)
        const funil = r.dados.find((f) => (funilId ? f.id === funilId : f.padrao))
        return (funil?.fases ?? [])
          .filter((f) => f.ativo)
          .map((f) => ({ value: f.id, label: f.nome }))
      }
      const servico =
        campo === 'motivo'
          ? servicos.cadastros.motivos
          : campo === 'origem'
            ? servicos.cadastros.origens
            : servicos.cadastros.solucoes
      const r = await servico.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
        .filter((c) => c.ativo)
        .map((c) => ({
          value: c.id,
          label:
            'aplicaA' in c
              ? `${c.nome} (${(c.aplicaA as (keyof typeof ROTULO_DO_STATUS)[]).map((s) => ROTULO_DO_STATUS[s]).join(', ')})`
              : c.nome,
        }))
    },
  })
}

/**
 * Cada valor distinto de uma coluna (Fase, Motivo, Origem ou Solução), com quantas linhas tem e o
 * cadastro que valerá: o que a pessoa apontou, ou o de mesmo nome.
 */
export function ValoresDaColuna({
  lote,
  campo,
  coluna,
  escolhas,
  aoEscolher,
}: {
  lote: LoteDeImportacao
  campo: CampoComValores
  coluna: string
  escolhas: Record<string, string>
  aoEscolher: (chave: string, valor: string) => void
}) {
  const servicos = useServicos()
  const textos = TEXTOS_DO_CAMPO[campo]
  const opcoes = useOpcoesDoCampo(campo, lote.funilId)
  const valores = useQuery({
    queryKey: ['importacao', 'valores', lote.id, campo, coluna, lote.funilId],
    retry: false,
    queryFn: async () => {
      const r = await servicos.importacao.lotes.valoresDoTipo(lote.id, coluna, campo)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  return (
    <section aria-label={textos.titulo} className={cartao}>
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-[15px] leading-5 font-semibold">{textos.titulo}</h2>
        <span className="text-[13px] text-ink-muted">{textos.descricao(coluna)}</span>
      </div>
      {valores.isPending || opcoes.isPending ? (
        <Skeleton lines={3} />
      ) : valores.isError || opcoes.isError ? (
        <Alert tone="danger" title={`Não foi possível listar ${textos.titulo.toLowerCase()}`}>
          {(valores.error ?? opcoes.error)?.message}
        </Alert>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {valores.data.itens.map((i) => {
            const padrao = i.origem === 'pular' ? PULAR : (i.tipoId ?? '')
            const atual = escolhas[i.chave] ?? padrao
            return (
              <li
                key={i.chave}
                aria-label={`${textos.titulo}: ${i.valor}`}
                className="grid items-center gap-x-4 gap-y-2 border-b border-border py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="font-semibold [overflow-wrap:anywhere]">{i.valor}</span>
                  <span className="text-[13px] text-ink-muted">
                    {i.linhas.toLocaleString('pt-BR')} {i.linhas === 1 ? 'linha' : 'linhas'}
                  </span>
                </div>
                <Select
                  aria-label={`Cadastro para ${i.valor}`}
                  value={atual}
                  placeholder="Escolher…"
                  options={[{ value: PULAR, label: textos.semCadastro }, ...opcoes.data]}
                  onChange={(e) => aoEscolher(i.chave, e.target.value)}
                  {...(atual === '' ? { hint: textos.vazio } : {})}
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
  )
}
