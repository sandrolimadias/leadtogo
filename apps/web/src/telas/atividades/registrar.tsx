import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react'

import { usePermissoes } from '@/auth/permissoes'
import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/checkbox'
import { Select, TextArea, TextField } from '@/components/ui/campos'
import { Alert } from '@/components/ui/feedback'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { BolhaDoTipo } from '@/telas/cadastros/tipos-de-atividade'
import { Janela } from '@/telas/cadastros/base'

import { BuscaDeEmpresa } from './busca-de-empresa'
import { Contexto, type InicioDoRegistro } from './registro-contexto'
import {
  doCampoDeData,
  doCampoDeDataEHora,
  efeitoNaCarteira,
  paraCampoDeData,
  paraCampoDeDataEHora,
} from './formatos'

/** Guarda o formulário aberto e o desenha uma vez só para o app inteiro. */
export function RegistrarAtividadeProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<{ inicio: InicioDoRegistro; chave: number } | null>(null)
  // A chave nunca se repete: reabrir logo depois de fechar (agendar próxima) começa um formulário novo
  const contador = useRef(0)
  const abrir = useCallback((inicio: InicioDoRegistro = {}) => {
    contador.current += 1
    setEstado({ inicio, chave: contador.current })
  }, [])
  const controle = useMemo(() => ({ abrir }), [abrir])
  return (
    <Contexto.Provider value={controle}>
      {children}
      {estado ? (
        <FormularioDeAtividade
          key={estado.chave}
          inicio={estado.inicio}
          aoFechar={() => setEstado(null)}
          aoAgendarProxima={abrir}
        />
      ) : null}
    </Contexto.Provider>
  )
}

interface Formulario {
  tipoId: string
  empresaId: string
  empresaNome: string
  contatoId: string
  titulo: string
  diaInteiro: boolean
  /** `datetime-local` (ou `date`, no dia inteiro); vazio = não informada */
  data: string
  situacao: 'realizada' | 'pendente'
  resultado: string
  importante: boolean
  urgente: boolean
  /** Vazio = sem oportunidade */
  oportunidadeId: string
  /** Vazio = o próprio usuário */
  responsavelId: string
}

const agoraNoCampo = () => paraCampoDeDataEHora(new Date())

function formularioInicial(inicio: InicioDoRegistro): Formulario {
  const a = inicio.atividade
  if (a) {
    // Realizada: a data que vale é QUANDO aconteceu
    const quando = a.situacao === 'realizada' && a.realizadaEm ? a.realizadaEm : a.dataInicio
    return {
      tipoId: a.tipo.id,
      empresaId: a.empresa?.id ?? '',
      empresaNome: a.empresa?.nome ?? '',
      contatoId: a.contato?.id ?? '',
      titulo: a.titulo,
      diaInteiro: a.diaInteiro,
      data: a.diaInteiro ? paraCampoDeData(quando) : paraCampoDeDataEHora(quando),
      situacao: a.situacao === 'realizada' ? 'realizada' : 'pendente',
      resultado: a.resultado ?? '',
      importante: a.importante,
      urgente: a.urgente,
      oportunidadeId: a.oportunidade?.id ?? '',
      responsavelId: a.responsavel.id,
    }
  }
  const situacao = inicio.situacao ?? 'realizada'
  return {
    tipoId: inicio.tipoId ?? '',
    empresaId: inicio.empresa?.id ?? '',
    empresaNome: inicio.empresa?.nome ?? '',
    contatoId: inicio.contatoId ?? '',
    titulo: '',
    diaInteiro: false,
    // Pendente vindo de "agendar próxima": data vazia, para a pessoa escolher
    data: situacao === 'realizada' ? agoraNoCampo() : '',
    situacao,
    resultado: '',
    importante: false,
    urgente: false,
    oportunidadeId: inicio.oportunidade?.id ?? '',
    responsavelId: '',
  }
}

/** O campo da tela a que cada erro da API se refere. */
const CAMPO_DO_ERRO: Record<string, string> = {
  empresa_obrigatoria: 'empresa',
  empresa_invalida: 'empresa',
  contato_invalido: 'contato',
  contato_sem_empresa: 'contato',
  oportunidade_invalida: 'oportunidade',
  oportunidade_sem_empresa: 'oportunidade',
  atividade_no_futuro: 'data',
  fim_antes_do_inicio: 'data',
  resultado_obrigatorio: 'resultado',
  tipo_invalido: 'tipo',
  tipo_inativo: 'tipo',
  responsavel_invalido: 'responsavel',
}

/**
 * "Registrar atividade" (e "Editar atividade"): janela no computador, folha que sobe do rodapé no
 * celular. Situação padrão Realizada (com Resultado) ou Pendente (agendar); o responsável padrão é quem
 * está logado. "Registrar e agendar próxima" reabre com a mesma empresa, tipo e contato, em Pendente.
 */
function FormularioDeAtividade({
  inicio,
  aoFechar,
  aoAgendarProxima,
}: {
  inicio: InicioDoRegistro
  aoFechar: () => void
  aoAgendarProxima: (inicio: InicioDoRegistro) => void
}) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const edicao = inicio.atividade
  const [f, setF] = useState<Formulario>(() => formularioInicial(inicio))
  const [inicial] = useState<Formulario>(() => formularioInicial(inicio))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string>()
  const [maisOpcoes, setMaisOpcoes] = useState(Boolean(edicao))
  const [salvando, setSalvando] = useState(false)
  const mudar = (patch: Partial<Formulario>) => setF((a) => ({ ...a, ...patch }))

  const { pode } = usePermissoes()
  const tipos = useQuery({
    queryKey: ['cadastros', 'tipos-atividade'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.cadastros.tiposAtividade.listar()
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

  // As oportunidades ativas da empresa (a da atividade que se edita aparece mesmo se já fechou)
  const oportunidades = useQuery({
    queryKey: ['oportunidades', 'da-empresa', f.empresaId],
    enabled: f.empresaId !== '',
    retry: false,
    queryFn: async () => {
      const r = await servicos.oportunidades.listar({
        empresaId: f.empresaId,
        status: 'ativo',
        porPagina: 100,
        ordem: 'titulo',
        sentido: 'asc',
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens
    },
  })

  // Os tipos ativos (o do registro que se edita aparece mesmo inativo); padrão: Visita
  const tiposAtivos = (tipos.data ?? []).filter((t) => t.ativo || t.id === inicial.tipoId)
  const tipoId =
    f.tipoId || (tiposAtivos.find((t) => t.chaveSistema === 'visita') ?? tiposAtivos[0])?.id || ''
  const tipo = tiposAtivos.find((t) => t.id === tipoId)
  const exigeEmpresa = tipo?.exigeEmpresa ?? true

  const podeEscolherResponsavel = pode('atividades.atribuir_responsavel')
  const responsaveis = opcoes.data?.vendedores ?? []

  const realizada = f.situacao === 'realizada'
  const campoDeData = f.diaInteiro ? 'date' : 'datetime-local'

  const validar = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (!tipoId) e['tipo'] = 'Escolha o tipo da atividade.'
    if (f.titulo.trim() === '') e['titulo'] = 'Informe o título.'
    if (exigeEmpresa && f.empresaId === '') e['empresa'] = 'Escolha a empresa.'
    if (f.data === '') e['data'] = realizada ? 'Informe quando aconteceu.' : 'Informe a data.'
    if (realizada && f.resultado.trim() === '') e['resultado'] = 'Informe o resultado.'
    return e
  }

  const enviar = async (agendarProxima: boolean) => {
    const invalidos = validar()
    setErros(invalidos)
    setErroGeral(undefined)
    if (Object.keys(invalidos).length > 0) return
    setSalvando(true)
    const dataIso = f.diaInteiro ? doCampoDeData(f.data) : doCampoDeDataEHora(f.data)
    const r = edicao
      ? await servicos.atividades.alterar(edicao.id, {
          tipoAtividadeId: tipoId,
          titulo: f.titulo.trim(),
          empresaId: f.empresaId === '' ? null : f.empresaId,
          contatoId: f.contatoId === '' ? null : f.contatoId,
          oportunidadeId: f.oportunidadeId === '' ? null : f.oportunidadeId,
          ...(f.responsavelId !== '' && f.responsavelId !== inicial.responsavelId
            ? { responsavelId: f.responsavelId }
            : {}),
          // a data só vai se a pessoa a mudou: editar o resto não reescreve quando aconteceu
          ...(f.data !== inicial.data || f.diaInteiro !== inicial.diaInteiro
            ? { dataInicio: dataIso, diaInteiro: f.diaInteiro }
            : {}),
          ...(realizada ? { resultado: f.resultado.trim() } : {}),
          importante: f.importante,
          urgente: f.urgente,
        })
      : await servicos.atividades.criar({
          tipoAtividadeId: tipoId,
          titulo: f.titulo.trim(),
          ...(f.empresaId !== '' ? { empresaId: f.empresaId } : {}),
          ...(f.contatoId !== '' ? { contatoId: f.contatoId } : {}),
          ...(f.oportunidadeId !== '' ? { oportunidadeId: f.oportunidadeId } : {}),
          ...(f.responsavelId !== '' ? { responsavelId: f.responsavelId } : {}),
          dataInicio: dataIso,
          diaInteiro: f.diaInteiro,
          situacao: f.situacao,
          ...(realizada ? { resultado: f.resultado.trim() } : {}),
          importante: f.importante,
          urgente: f.urgente,
        })
    setSalvando(false)
    if (!r.ok) {
      const campo = CAMPO_DO_ERRO[r.erro.codigo]
      if (campo) setErros({ [campo]: r.erro.mensagem })
      else setErroGeral(r.erro.mensagem)
      return
    }
    await Promise.all(
      ['atividades', 'carteira', 'contatos'].map((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      ),
    )
    toast.success(edicao ? 'Atividade atualizada' : 'Atividade registrada', {
      description: r.dados.empresa?.nome ?? r.dados.titulo,
    })
    aoFechar()
    if (agendarProxima) {
      aoAgendarProxima({
        ...(f.empresaId !== '' ? { empresa: { id: f.empresaId, nome: f.empresaNome } } : {}),
        ...(f.contatoId !== '' ? { contatoId: f.contatoId } : {}),
        tipoId,
        situacao: 'pendente',
      })
    }
  }

  const titulo = edicao ? 'Editar atividade' : 'Registrar atividade'
  return (
    <Janela
      open
      onOpenChange={(aberto) => {
        if (!aberto && !salvando) aoFechar()
      }}
      title={titulo}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Button>
          {!edicao && realizada ? (
            <Button disabled={salvando} onClick={() => void enviar(true)}>
              Registrar e agendar próxima
            </Button>
          ) : null}
          <Button variant="primary" loading={salvando} onClick={() => void enviar(false)}>
            {edicao ? 'Salvar' : realizada ? 'Registrar atividade' : 'Agendar atividade'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void enviar(false)
        }}
      >
        {erroGeral ? <Alert tone="danger">{erroGeral}</Alert> : null}

        <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[13px] leading-[18px] font-semibold">Tipo</legend>
          <div className="grid grid-cols-3 gap-2 max-md:grid-cols-2">
            {tiposAtivos.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={t.id === tipoId}
                onClick={() => mudar({ tipoId: t.id })}
                className={cn(
                  'flex h-(--ctl) min-w-0 cursor-pointer items-center gap-2 rounded-sm border bg-surface px-2 text-left text-[length:var(--ctl-font)] font-semibold text-ink',
                  t.id === tipoId
                    ? 'border-brand bg-brand-soft'
                    : 'border-border-strong hover:bg-surface-hover',
                )}
              >
                <BolhaDoTipo icone={t.icone} cor={t.cor} />
                <span className="truncate">{t.nome}</span>
              </button>
            ))}
          </div>
          {erros['tipo'] ? (
            <span className="text-xs font-medium text-danger">{erros['tipo']}</span>
          ) : null}
        </fieldset>

        <BuscaDeEmpresa
          valor={f.empresaId === '' ? null : { id: f.empresaId, nome: f.empresaNome }}
          obrigatoria={exigeEmpresa}
          rotuloOpcional={`opcional na ${tipo?.nome ?? 'Tarefa'}`}
          erro={erros['empresa']}
          // trocar de empresa limpa o contato (ele é da empresa anterior)
          aoMudar={(e) =>
            mudar({ empresaId: e?.id ?? '', empresaNome: e?.nome ?? '', contatoId: '' })
          }
        />

        <Select
          label="Contato"
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

        <TextField
          label="Título"
          required
          placeholder="Ex.: Apresentar a proposta"
          value={f.titulo}
          onChange={(e) => mudar({ titulo: e.target.value })}
          {...(erros['titulo'] ? { error: erros['titulo'] } : {})}
        />

        <div className="grid grid-cols-[1fr_auto] items-end gap-3 max-md:grid-cols-1">
          <TextField
            label={realizada ? 'Quando aconteceu' : 'Data e hora'}
            required
            type={campoDeData}
            value={f.data}
            onChange={(e) => mudar({ data: e.target.value })}
            {...(erros['data'] ? { error: erros['data'] } : {})}
          />
          <Switch
            label="Dia inteiro"
            checked={f.diaInteiro}
            onChange={(e) => {
              const diaInteiro = e.target.checked
              mudar({
                diaInteiro,
                data:
                  f.data === ''
                    ? ''
                    : diaInteiro
                      ? f.data.slice(0, 10)
                      : `${f.data.slice(0, 10)}T09:00`,
              })
            }}
            className="pb-2.5"
          />
        </div>

        {edicao ? (
          <p className="m-0 text-sm text-ink-muted">
            Situação: <strong className="text-ink">{realizada ? 'Realizada' : 'Pendente'}</strong>.
            Para concluir, cancelar ou excluir, use as ações da atividade.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] leading-[18px] font-semibold">Situação</span>
            <SegmentedControl
              label="Situação"
              options={[
                { value: 'realizada', label: 'Realizada' },
                { value: 'pendente', label: 'Pendente (agendar)' },
              ]}
              value={f.situacao}
              onChange={(v) =>
                mudar({
                  situacao: v as 'realizada' | 'pendente',
                  ...(v === 'realizada' && f.data === '' ? { data: agoraNoCampo() } : {}),
                })
              }
            />
          </div>
        )}

        {realizada ? (
          <TextArea
            label="Resultado"
            required
            rows={3}
            placeholder="O que aconteceu?"
            hint={efeitoNaCarteira(tipo?.contaComo)}
            value={f.resultado}
            onChange={(e) => mudar({ resultado: e.target.value })}
            {...(erros['resultado'] ? { error: erros['resultado'] } : {})}
          />
        ) : null}

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Switch
            label="Importante"
            checked={f.importante}
            onChange={(e) => mudar({ importante: e.target.checked })}
          />
          <Switch
            label="Urgente"
            checked={f.urgente}
            onChange={(e) => mudar({ urgente: e.target.checked })}
          />
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={maisOpcoes}
            onClick={() => setMaisOpcoes((v) => !v)}
            className="w-fit cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-brand"
          >
            {maisOpcoes ? 'Menos opções' : 'Mais opções'}
          </button>
          {maisOpcoes ? (
            <>
              <Select
                label="Oportunidade"
                placeholder={f.empresaId === '' ? 'Escolha a empresa antes' : 'Sem oportunidade'}
                disabled={f.empresaId === ''}
                options={[
                  ...(edicao?.oportunidade &&
                  !(oportunidades.data ?? []).some((o) => o.id === edicao.oportunidade?.id)
                    ? [{ value: edicao.oportunidade.id, label: edicao.oportunidade.nome }]
                    : []),
                  ...(oportunidades.data ?? []).map((o) => ({ value: o.id, label: o.titulo })),
                ]}
                value={f.oportunidadeId}
                onChange={(e) => mudar({ oportunidadeId: e.target.value })}
                {...(erros['oportunidade'] ? { error: erros['oportunidade'] } : {})}
              />
              {podeEscolherResponsavel ? (
                <Select
                  label="Responsável"
                  placeholder="Eu (padrão)"
                  options={responsaveis.map((v) => ({ value: v.id, label: v.nome }))}
                  value={f.responsavelId}
                  onChange={(e) => mudar({ responsavelId: e.target.value })}
                  {...(erros['responsavel'] ? { error: erros['responsavel'] } : {})}
                />
              ) : null}
            </>
          ) : null}
        </div>
        {/* Enter no campo de texto envia o formulário */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Janela>
  )
}
