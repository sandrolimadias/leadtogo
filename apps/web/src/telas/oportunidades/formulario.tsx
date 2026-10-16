import type { Funil } from '@leadtogo/api-client'
import {
  MESES_PADRAO,
  ponderadoDaOportunidade,
  totalDaOportunidade,
  VALOR_MAXIMO,
} from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'
import { Button } from '@/components/ui/button'
import { Select, TextArea, TextField } from '@/components/ui/campos'
import { Alert } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { BuscaDeEmpresa } from '@/telas/atividades/busca-de-empresa'
import { Janela } from '@/telas/cadastros/base'

import {
  ContextoDoFormularioDeOportunidade,
  type InicioDoFormularioDeOportunidade,
} from './contexto-formulario'
import { reais, sugestaoDeNome } from './formatos'

/** Guarda o formulário aberto e o desenha uma vez só para o app inteiro. */
export function FormularioDeOportunidadeProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<{
    inicio: InicioDoFormularioDeOportunidade
    chave: number
  } | null>(null)
  const contador = useRef(0)
  const abrir = useCallback((inicio: InicioDoFormularioDeOportunidade = {}) => {
    contador.current += 1
    setEstado({ inicio, chave: contador.current })
  }, [])
  const controle = useMemo(() => ({ abrir }), [abrir])
  return (
    <ContextoDoFormularioDeOportunidade.Provider value={controle}>
      {children}
      {estado ? (
        <FormularioDeOportunidade
          key={estado.chave}
          inicio={estado.inicio}
          aoFechar={() => setEstado(null)}
        />
      ) : null}
    </ContextoDoFormularioDeOportunidade.Provider>
  )
}

interface Formulario {
  titulo: string
  /** O nome foi digitado pela pessoa (a sugestão "Empresa – Solução" deixa de valer) */
  tituloDigitado: boolean
  empresaId: string
  empresaNome: string
  contatoId: string
  solucaoId: string
  origemId: string
  funilId: string
  faseId: string
  responsavelId: string
  valorUnico: string
  valorMensal: string
  meses: string
  /** Vazio = a da fase */
  probabilidade: string
  dataPrevista: string
  observacoes: string
}

const numero = (v: string): number => (v.trim() === '' ? 0 : Number(v.replace(',', '.')))
const ehNumeroValido = (v: string): boolean =>
  v.trim() === '' ||
  (Number.isFinite(Number(v.replace(',', '.'))) && Number(v.replace(',', '.')) >= 0)

function formularioInicial(inicio: InicioDoFormularioDeOportunidade): Formulario {
  const o = inicio.oportunidade
  if (o) {
    return {
      titulo: o.titulo,
      tituloDigitado: true,
      empresaId: o.empresa.id,
      empresaNome: o.empresa.nome,
      contatoId: o.contato?.id ?? '',
      solucaoId: o.solucao?.id ?? '',
      origemId: o.origem?.id ?? '',
      funilId: o.funil.id,
      faseId: o.fase.id,
      responsavelId: o.responsavel.id,
      valorUnico: String(o.valorUnico),
      valorMensal: String(o.valorMensal),
      meses: String(o.meses),
      probabilidade: String(o.probabilidade),
      dataPrevista: o.dataPrevistaFechamento ?? '',
      observacoes: o.observacoes ?? '',
    }
  }
  return {
    titulo: '',
    tituloDigitado: false,
    empresaId: inicio.empresa?.id ?? '',
    empresaNome: inicio.empresa?.nome ?? '',
    contatoId: '',
    solucaoId: '',
    origemId: '',
    funilId: inicio.funilId ?? '',
    faseId: inicio.faseId ?? '',
    responsavelId: '',
    valorUnico: '',
    valorMensal: '',
    meses: '',
    probabilidade: '',
    dataPrevista: '',
    observacoes: '',
  }
}

const CAMPO_DO_ERRO: Record<string, string> = {
  empresa_invalida: 'empresa',
  contato_invalido: 'contato',
  funil_invalido: 'funil',
  fase_invalida: 'fase',
  responsavel_invalido: 'responsavel',
}

/**
 * "Nova oportunidade" e "Editar oportunidade": janela no computador, folha no celular. A empresa se escolhe
 * pelo campo de pesquisa. Os valores são digitados (único, mensal e meses); o total e o ponderado
 * aparecem na hora, mas quem manda é o banco, que calcula os mesmos números.
 */
function FormularioDeOportunidade({
  inicio,
  aoFechar,
}: {
  inicio: InicioDoFormularioDeOportunidade
  aoFechar: () => void
}) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const edicao = inicio.oportunidade
  const [f, setF] = useState<Formulario>(() => formularioInicial(inicio))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string>()
  const [salvando, setSalvando] = useState(false)
  const mudar = (patch: Partial<Formulario>) => setF((a) => ({ ...a, ...patch }))

  const me = useQuery({ queryKey: chaveDoMe, queryFn: servicos.me }).data
  const papel = me?.empresas.find((e) => e.ativa)?.papel
  const funis = useQuery({
    queryKey: ['cadastros', 'funis'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.funis.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const solucoes = useQuery({
    queryKey: ['cadastros', 'solucoes'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.cadastros.solucoes.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const origens = useQuery({
    queryKey: ['cadastros', 'origens'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.cadastros.origens.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const opcoes = useQuery({
    queryKey: ['carteira', 'opcoes'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.carteira.opcoes()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const contatos = useQuery({
    queryKey: ['contatos', 'da-empresa', f.empresaId],
    enabled: f.empresaId !== '',
    retry: false,
    queryFn: async () => {
      const r = await servicos.contatos.daEmpresa(f.empresaId)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.filter((c) => c.ativo)
    },
  })

  const funisAtivos: Funil[] = (funis.data ?? []).filter((x) => x.ativo || x.id === f.funilId)
  const funil: Funil | undefined =
    funisAtivos.find((x) => x.id === f.funilId) ??
    funisAtivos.find((x) => x.padrao) ??
    funisAtivos[0]
  const fasesAtivas = (funil?.fases ?? []).filter((x) => x.ativo)
  const fase = fasesAtivas.find((x) => x.id === f.faseId) ?? fasesAtivas[0]
  const solucao = (solucoes.data ?? []).find((s) => s.id === f.solucaoId)

  // Os valores digitados e o que sai deles
  const unico = numero(f.valorUnico)
  const mensal = numero(f.valorMensal)
  const meses = f.meses.trim() === '' ? (mensal > 0 ? MESES_PADRAO : 0) : numero(f.meses)
  const total = totalDaOportunidade(unico, mensal, meses)
  const probabilidade =
    f.probabilidade.trim() === '' ? (fase?.probabilidadePadrao ?? 0) : numero(f.probabilidade)
  const ponderado = ponderadoDaOportunidade(total, probabilidade)

  const tituloMostrado = f.tituloDigitado
    ? f.titulo
    : sugestaoDeNome(f.empresaNome, solucao?.nome) || f.titulo

  const validar = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (f.empresaId === '') e['empresa'] = 'Escolha a empresa.'
    if (tituloMostrado.trim() === '') e['titulo'] = 'Informe o nome da oportunidade.'
    for (const [campo, valor] of [
      ['valorUnico', f.valorUnico],
      ['valorMensal', f.valorMensal],
    ] as const) {
      if (!ehNumeroValido(valor)) e[campo] = 'Informe um valor de zero para cima.'
      else if (numero(valor) > VALOR_MAXIMO) e[campo] = 'Valor alto demais.'
    }
    if (
      f.meses.trim() !== '' &&
      (!Number.isInteger(numero(f.meses)) || numero(f.meses) < 0 || numero(f.meses) > 600)
    ) {
      e['meses'] = 'Informe de 0 a 600 meses.'
    }
    if (
      f.probabilidade.trim() !== '' &&
      (!Number.isInteger(numero(f.probabilidade)) || probabilidade < 0 || probabilidade > 100)
    ) {
      e['probabilidade'] = 'Informe de 0 a 100.'
    }
    return e
  }

  const enviar = async () => {
    const invalidos = validar()
    setErros(invalidos)
    setErroGeral(undefined)
    if (Object.keys(invalidos).length > 0) return
    setSalvando(true)
    const valores = {
      valorUnico: unico,
      valorMensal: mensal,
      meses,
      dataPrevistaFechamento: f.dataPrevista === '' ? null : f.dataPrevista,
      observacoes: f.observacoes.trim() === '' ? null : f.observacoes.trim(),
    }
    const r = edicao
      ? await servicos.oportunidades.alterar(edicao.id, {
          titulo: tituloMostrado.trim(),
          contatoId: f.contatoId === '' ? null : f.contatoId,
          solucaoId: f.solucaoId === '' ? null : f.solucaoId,
          origemId: f.origemId === '' ? null : f.origemId,
          ...(f.responsavelId !== '' && f.responsavelId !== edicao.responsavel.id
            ? { responsavelId: f.responsavelId }
            : {}),
          ...valores,
          ...(f.probabilidade.trim() !== '' && probabilidade !== edicao.probabilidade
            ? { probabilidade }
            : {}),
        })
      : await servicos.oportunidades.criar({
          titulo: tituloMostrado.trim(),
          empresaId: f.empresaId,
          ...(f.contatoId !== '' ? { contatoId: f.contatoId } : {}),
          ...(f.solucaoId !== '' ? { solucaoId: f.solucaoId } : {}),
          ...(f.origemId !== '' ? { origemId: f.origemId } : {}),
          ...(funil ? { funilId: funil.id } : {}),
          ...(fase ? { faseId: fase.id } : {}),
          ...(f.responsavelId !== '' ? { responsavelId: f.responsavelId } : {}),
          ...valores,
          ...(f.probabilidade.trim() !== '' ? { probabilidade } : {}),
        })
    setSalvando(false)
    if (!r.ok) {
      const campo = CAMPO_DO_ERRO[r.erro.codigo]
      if (campo) setErros({ [campo]: r.erro.mensagem })
      else setErroGeral(r.erro.mensagem)
      return
    }
    await Promise.all(
      ['oportunidades', 'carteira', 'atividades'].map((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      ),
    )
    toast.success(edicao ? 'Oportunidade atualizada' : 'Oportunidade criada', {
      description: r.dados.titulo,
    })
    aoFechar()
  }

  return (
    <Janela
      open
      onOpenChange={(aberto) => {
        if (!aberto && !salvando) aoFechar()
      }}
      title={edicao ? 'Editar oportunidade' : 'Nova oportunidade'}
      width={620}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button variant="primary" loading={salvando} onClick={() => void enviar()}>
            {edicao ? 'Salvar' : 'Criar oportunidade'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void enviar()
        }}
      >
        {erroGeral ? <Alert tone="danger">{erroGeral}</Alert> : null}

        {edicao ? (
          <div className="flex flex-col gap-1">
            <span className="text-[13px] leading-[18px] font-semibold">Empresa</span>
            <span aria-label="Empresa" className="text-sm">
              {f.empresaNome}
            </span>
          </div>
        ) : (
          <BuscaDeEmpresa
            valor={f.empresaId === '' ? null : { id: f.empresaId, nome: f.empresaNome }}
            obrigatoria
            erro={erros['empresa']}
            aoMudar={(e) =>
              mudar({ empresaId: e?.id ?? '', empresaNome: e?.nome ?? '', contatoId: '' })
            }
          />
        )}

        <TextField
          label="Nome da oportunidade"
          required
          placeholder="Ex.: Contrato anual 2027"
          hint={f.tituloDigitado ? undefined : 'Sugerido: Empresa – Solução. Pode trocar.'}
          value={tituloMostrado}
          onChange={(e) => mudar({ titulo: e.target.value, tituloDigitado: true })}
          {...(erros['titulo'] ? { error: erros['titulo'] } : {})}
        />

        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Select
            label="Contato principal"
            placeholder={f.empresaId === '' ? 'Escolha a empresa antes' : 'Sem contato'}
            disabled={f.empresaId === ''}
            options={(contatos.data ?? []).map((c) => ({
              value: c.id,
              label: c.cargo ? `${c.nome} · ${c.cargo}` : c.nome,
            }))}
            value={f.contatoId}
            onChange={(e) => mudar({ contatoId: e.target.value })}
            {...(erros['contato'] ? { error: erros['contato'] } : {})}
          />
          <Select
            label="Solução"
            placeholder="Sem solução"
            options={(solucoes.data ?? [])
              .filter((s) => s.ativo || s.id === f.solucaoId)
              .map((s) => ({ value: s.id, label: s.nome }))}
            value={f.solucaoId}
            onChange={(e) => mudar({ solucaoId: e.target.value })}
          />
        </div>

        {edicao ? (
          <p className="m-0 text-sm text-ink-muted">
            Funil <strong className="text-ink">{edicao.funil.nome}</strong>, fase{' '}
            <strong className="text-ink">{edicao.fase.nome}</strong>. Para mudar de fase, arraste o
            card no Kanban ou use o menu da oportunidade.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <Select
              label="Funil"
              options={funisAtivos.map((x) => ({ value: x.id, label: x.nome }))}
              value={funil?.id ?? ''}
              onChange={(e) => mudar({ funilId: e.target.value, faseId: '' })}
              {...(erros['funil'] ? { error: erros['funil'] } : {})}
            />
            <Select
              label="Fase"
              options={fasesAtivas.map((x) => ({
                value: x.id,
                label: `${x.nome} (${x.probabilidadePadrao}%)`,
              }))}
              value={fase?.id ?? ''}
              onChange={(e) => mudar({ faseId: e.target.value })}
              {...(erros['fase'] ? { error: erros['fase'] } : {})}
            />
          </div>
        )}

        <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-sm border border-border p-3">
          <legend className="px-1 text-[13px] leading-[18px] font-semibold">Valores</legend>
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            <TextField
              label="Valor único (R$)"
              inputMode="decimal"
              placeholder="0,00"
              value={f.valorUnico}
              onChange={(e) => mudar({ valorUnico: e.target.value })}
              {...(erros['valorUnico'] ? { error: erros['valorUnico'] } : {})}
            />
            <TextField
              label="Valor mensal (R$)"
              inputMode="decimal"
              placeholder="0,00"
              value={f.valorMensal}
              onChange={(e) => mudar({ valorMensal: e.target.value })}
              {...(erros['valorMensal'] ? { error: erros['valorMensal'] } : {})}
            />
            <TextField
              label="Duração (meses)"
              inputMode="numeric"
              placeholder={mensal > 0 ? String(MESES_PADRAO) : '0'}
              value={f.meses}
              onChange={(e) => mudar({ meses: e.target.value })}
              {...(erros['meses'] ? { error: erros['meses'] } : {})}
            />
          </div>
          <p className="m-0 text-sm" aria-live="polite">
            Total do contrato: <strong>{reais(total)}</strong>{' '}
            <span className="text-ink-muted">(único + mensal × meses)</span>. Ponderado:{' '}
            <strong>{reais(ponderado)}</strong>.
          </p>
        </fieldset>

        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <TextField
            label="Probabilidade (%)"
            inputMode="numeric"
            placeholder={String(fase?.probabilidadePadrao ?? 0)}
            hint={
              f.probabilidade.trim() === ''
                ? `Sugerida pela fase: ${fase?.probabilidadePadrao ?? 0}%`
                : 'Editada à mão: mudar de fase não troca este valor'
            }
            value={f.probabilidade}
            onChange={(e) => mudar({ probabilidade: e.target.value })}
            {...(erros['probabilidade'] ? { error: erros['probabilidade'] } : {})}
          />
          <TextField
            label="Data prevista de fechamento"
            type="date"
            hint={'Sem data, fica como "sem previsão" e fora da previsão do mês.'}
            value={f.dataPrevista}
            onChange={(e) => mudar({ dataPrevista: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Select
            label="Origem"
            placeholder="Sem origem"
            options={(origens.data ?? [])
              .filter((o) => o.ativo || o.id === f.origemId)
              .map((o) => ({ value: o.id, label: o.nome }))}
            value={f.origemId}
            onChange={(e) => mudar({ origemId: e.target.value })}
          />
          {papel !== undefined && papel !== 'vendedor' ? (
            <Select
              label="Responsável"
              placeholder="O vendedor da empresa (padrão)"
              options={(opcoes.data?.vendedores ?? []).map((v) => ({ value: v.id, label: v.nome }))}
              value={f.responsavelId}
              onChange={(e) => mudar({ responsavelId: e.target.value })}
              {...(erros['responsavel'] ? { error: erros['responsavel'] } : {})}
            />
          ) : null}
        </div>

        <TextArea
          label="Observações"
          rows={3}
          value={f.observacoes}
          onChange={(e) => mudar({ observacoes: e.target.value })}
        />
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Janela>
  )
}
