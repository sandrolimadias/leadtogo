import type { Contato } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Building2, Ellipsis, Pencil, Plus, Power, Search, Star } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button, IconButton } from '@/components/ui/button'
import { TextField } from '@/components/ui/campos'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/exibicao'
import { Alert } from '@/components/ui/feedback'
import { Menu } from '@/components/ui/menu'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { DialogoDeConfirmacao, Janela } from '@/telas/cadastros/base'
import { documentoFormatado } from '@/telas/empresas/formatos'
import { Cartao } from '@/telas/empresas/ficha-resumo'

type Vinculo = Contato['vinculos'][number]

/** Atualiza a ficha e as listas depois de mexer em um vínculo. */
function useAposMudarVinculo(contatoId: string) {
  const queryClient = useQueryClient()
  return async (contato: Contato) => {
    queryClient.setQueryData(['contatos', 'contato', contatoId], contato)
    await queryClient.invalidateQueries({ queryKey: ['contatos', 'lista'] })
    await queryClient.invalidateQueries({ queryKey: ['contatos', 'da-empresa'] })
  }
}

/** Busca na carteira a empresa para vincular: só as que o usuário edita e que ainda não têm vínculo ativo. */
function EscolherEmpresa({
  jaVinculadas,
  aoEscolher,
}: {
  jaVinculadas: ReadonlySet<string>
  aoEscolher: (empresa: { id: string; nome: string }) => void
}) {
  const servicos = useServicos()
  const [texto, setTexto] = useState('')
  const [termo, setTermo] = useState('')
  useEffect(() => {
    const espera = setTimeout(() => setTermo(texto.trim()), 300)
    return () => clearTimeout(espera)
  }, [texto])
  const achadas = useQuery({
    queryKey: ['contatos', 'busca-de-empresa', termo],
    enabled: termo.length >= 2,
    retry: false,
    queryFn: async () => {
      const r = await servicos.carteira.listar({ busca: termo, porPagina: 8 })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens
    },
  })
  const opcoes = (achadas.data ?? []).filter((e) => e.editavel && !jaVinculadas.has(e.id))
  return (
    <div className="flex flex-col gap-2">
      <TextField
        label="Empresa"
        icon={Search}
        placeholder="Nome, CNPJ ou cidade"
        hint="Só aparecem empresas da sua carteira que ainda não têm este contato."
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      {achadas.isError ? (
        <span className="text-sm text-danger">{achadas.error.message}</span>
      ) : null}
      {achadas.data && opcoes.length === 0 ? (
        <span className="text-sm text-ink-muted">Nenhuma empresa sua com esse nome.</span>
      ) : null}
      {opcoes.length > 0 ? (
        <ul aria-label="Empresas encontradas" className="m-0 flex list-none flex-col gap-1 p-0">
          {opcoes.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => aoEscolher({ id: e.id, nome: e.nome })}
                className="flex w-full cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2 text-left hover:bg-surface-hover"
              >
                <span className="flex flex-1 flex-col">
                  <span className="text-sm font-semibold">{e.nome}</span>
                  <span className="font-mono text-xs text-ink-muted">
                    {documentoFormatado(e.tipoDocumento, e.documento)}
                  </span>
                </span>
                {e.cidade ? (
                  <Badge tone="neutral">{`${e.cidade.nome}/${e.cidade.uf}`}</Badge>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** "Vincular a outra empresa": escolhe a empresa e informa o cargo dela e se é o contato principal. */
function DialogoDeVincular({ contato, aoFechar }: { contato: Contato; aoFechar: () => void }) {
  const servicos = useServicos()
  const depois = useAposMudarVinculo(contato.id)
  const [empresa, setEmpresa] = useState<{ id: string; nome: string } | null>(null)
  const [cargo, setCargo] = useState('')
  const [principal, setPrincipal] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string>()
  const jaVinculadas = new Set(contato.vinculos.filter((v) => v.ativo).map((v) => v.empresa.id))

  const vincular = async () => {
    if (!empresa) return
    setSalvando(true)
    setErro(undefined)
    const r = await servicos.contatos.vincular(contato.id, {
      empresaId: empresa.id,
      ...(cargo.trim() ? { cargo: cargo.trim() } : {}),
      ...(principal ? { principal: true } : {}),
    })
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success('Contato vinculado', {
      description: `${contato.nome} agora também é de ${empresa.nome}.`,
    })
    await depois(r.dados)
    aoFechar()
  }

  return (
    <Janela
      open
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar()
      }}
      title="Vincular a outra empresa"
      description="O cargo é de cada empresa: a mesma pessoa pode ser sócia de uma e contadora de outra."
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={salvando}
            disabled={!empresa}
            onClick={() => void vincular()}
          >
            Vincular
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {empresa ? (
          <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border-strong bg-surface-sunken px-3 py-2">
            <span className="text-[13px] font-semibold">Empresa</span>
            <span className="flex-1 text-sm">{empresa.nome}</span>
            <Button size="sm" variant="ghost" onClick={() => setEmpresa(null)}>
              Trocar
            </Button>
          </div>
        ) : (
          <EscolherEmpresa jaVinculadas={jaVinculadas} aoEscolher={setEmpresa} />
        )}
        {empresa ? (
          <>
            <TextField
              label="Cargo nesta empresa"
              placeholder="Ex.: Compradora"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
            />
            <Checkbox
              label="Contato principal desta empresa"
              description="Só um por empresa: marcar este tira o selo do anterior."
              checked={principal}
              onChange={(e) => setPrincipal(e.target.checked)}
            />
          </>
        ) : null}
        {erro ? (
          <Alert tone="danger" title="Não foi possível vincular">
            {erro}
          </Alert>
        ) : null}
      </div>
    </Janela>
  )
}

function DialogoDoCargo({
  contato,
  vinculo,
  aoFechar,
}: {
  contato: Contato
  vinculo: Vinculo
  aoFechar: () => void
}) {
  const servicos = useServicos()
  const depois = useAposMudarVinculo(contato.id)
  const [cargo, setCargo] = useState(vinculo.cargo ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string>()
  const salvar = async () => {
    setSalvando(true)
    setErro(undefined)
    const r = await servicos.contatos.alterarVinculo(contato.id, vinculo.empresa.id, {
      cargo: cargo.trim(),
    })
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success('Cargo atualizado')
    await depois(r.dados)
    aoFechar()
  }
  return (
    <Janela
      open
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar()
      }}
      title={`Cargo em ${vinculo.empresa.nome}`}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button variant="primary" loading={salvando} onClick={() => void salvar()}>
            Salvar cargo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <TextField
          label="Cargo nesta empresa"
          placeholder="Ex.: Compradora"
          value={cargo}
          onChange={(e) => setCargo(e.target.value)}
        />
        {erro ? (
          <Alert tone="danger" title="Não foi possível salvar">
            {erro}
          </Alert>
        ) : null}
      </div>
    </Janela>
  )
}

/**
 * Empresas vinculadas: o cargo é de cada vínculo. Vincular, mudar o cargo, escolher o principal e inativar
 * (a pessoa saiu da empresa: o histórico fica). Só edita o vínculo de empresa da própria carteira.
 */
export function EmpresasVinculadas({
  contato,
  vendedor,
}: {
  contato: Contato
  /** O usuário é vendedor: inativar o último vínculo ativo tira o contato da carteira dele */
  vendedor: boolean
}) {
  const servicos = useServicos()
  const navegar = useNavigate()
  const depois = useAposMudarVinculo(contato.id)
  const [vinculando, setVinculando] = useState(false)
  const [editandoCargo, setEditandoCargo] = useState<Vinculo | null>(null)
  const [inativando, setInativando] = useState<Vinculo | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erroAoInativar, setErroAoInativar] = useState<string>()
  const ativos = contato.vinculos.filter((v) => v.ativo).length

  const alterar = async (
    v: Vinculo,
    patch: { principal?: boolean; ativo?: boolean },
    aviso: string,
  ) => {
    setEnviando(true)
    const r = await servicos.contatos.alterarVinculo(contato.id, v.empresa.id, patch)
    setEnviando(false)
    if (!r.ok) {
      toast.error('Não foi possível alterar o vínculo', { description: r.erro.mensagem })
      return false
    }
    toast.success(aviso)
    await depois(r.dados)
    return true
  }

  const inativar = async (v: Vinculo) => {
    setErroAoInativar(undefined)
    setEnviando(true)
    const r = await servicos.contatos.alterarVinculo(contato.id, v.empresa.id, { ativo: false })
    setEnviando(false)
    if (!r.ok) {
      setErroAoInativar(r.erro.mensagem)
      return
    }
    setInativando(null)
    await depois(r.dados)
    if (vendedor && ativos <= 1) {
      toast.success('Vínculo inativado', { description: `${contato.nome} saiu da sua carteira.` })
      void navegar({ to: '/contatos' })
      return
    }
    toast.success('Vínculo inativado', { description: 'O histórico continua.' })
  }

  const menuDe = (v: Vinculo) => [
    { icon: Pencil, label: 'Editar cargo', onSelect: () => setEditandoCargo(v) },
    ...(v.ativo
      ? [
          v.principal
            ? {
                icon: Star,
                label: 'Tirar o selo de principal',
                onSelect: () => void alterar(v, { principal: false }, 'Selo de principal retirado'),
              }
            : {
                icon: Star,
                label: 'Marcar como principal',
                onSelect: () =>
                  void alterar(v, { principal: true }, `Principal em ${v.empresa.nome}`),
              },
          { separator: true as const },
          {
            icon: Power,
            label: 'Inativar vínculo',
            danger: true,
            onSelect: () => {
              setErroAoInativar(undefined)
              setInativando(v)
            },
          },
        ]
      : [
          { separator: true as const },
          {
            icon: Power,
            label: 'Reativar vínculo',
            onSelect: () => void alterar(v, { ativo: true }, 'Vínculo reativado'),
          },
        ]),
  ]

  return (
    <>
      <Cartao
        titulo="Empresas vinculadas"
        semMargem
        direita={
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => setVinculando(true)}>
            Vincular
          </Button>
        }
      >
        {contato.vinculos.length === 0 ? (
          <p className="m-0 flex items-center gap-2 px-4 py-4 text-sm text-ink-muted">
            <Building2 size={16} strokeWidth={1.75} aria-hidden="true" />
            Este contato ainda não tem empresa.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {contato.vinculos.map((v) => (
              <li
                key={v.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 border-b border-border px-4 py-3',
                  !v.ativo && 'bg-surface-sunken',
                )}
              >
                <div className="flex min-w-44 flex-1 flex-col gap-0.5">
                  <Link
                    to="/empresas/$empresaId"
                    params={{ empresaId: v.empresa.id }}
                    className={cn('font-semibold', !v.ativo && 'text-ink-muted')}
                  >
                    {v.empresa.nome}
                  </Link>
                  <span className="text-[13px] text-ink-muted">
                    {v.cargo ?? 'Sem cargo informado'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {v.principal ? <Badge icon={Star}>Principal</Badge> : null}
                  <Badge tone={v.ativo ? 'success' : 'neutral'}>
                    {v.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                  {v.editavel ? (
                    <Menu
                      align="end"
                      items={menuDe(v)}
                      trigger={
                        <IconButton
                          icon={Ellipsis}
                          label={`Ações do vínculo com ${v.empresa.nome}`}
                          size="sm"
                          disabled={enviando}
                        />
                      }
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="m-0 px-4 py-2.5 text-[13px] text-ink-muted">
          O cargo é de cada vínculo. Ao sair de uma empresa, o vínculo fica inativo e o histórico
          continua.
        </p>
      </Cartao>

      {vinculando ? (
        <DialogoDeVincular contato={contato} aoFechar={() => setVinculando(false)} />
      ) : null}
      {editandoCargo ? (
        <DialogoDoCargo
          contato={contato}
          vinculo={editandoCargo}
          aoFechar={() => setEditandoCargo(null)}
        />
      ) : null}
      <DialogoDeConfirmacao
        aberto={inativando !== null}
        titulo="Inativar este vínculo?"
        descricao={
          inativando
            ? `${contato.nome} deixa de contar como contato de ${inativando.empresa.nome} (e perde o selo de principal), mas o histórico continua e o vínculo pode ser reativado.${
                vendedor && ativos <= 1
                  ? ' Como é o único vínculo ativo, o contato sai da sua carteira.'
                  : ''
              }`
            : ''
        }
        rotuloDoBotao="Inativar vínculo"
        erro={erroAoInativar}
        enviando={enviando}
        aoConfirmar={() => inativando && void inativar(inativando)}
        aoFechar={() => setInativando(null)}
      />
    </>
  )
}
