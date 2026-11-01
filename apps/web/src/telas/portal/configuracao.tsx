import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Select, TextField } from '@leadtogo/ui/campos'
import { Switch } from '@leadtogo/ui/checkbox'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

/** Configurações → Portal (`portal.configurar`): liga o portal, escolhe o nome do topo e a regra de 2FA do Responsável. */
export function TelaDeConfiguracoesDoPortal() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const consulta = useQuery({
    queryKey: ['portal', 'configuracao'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.configuracao.obter()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const [nome, setNome] = useState<string | null>(null)
  const [limite, setLimite] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const c = consulta.data

  const salvar = async (
    dados: Parameters<typeof servicos.portal.configuracao.atualizar>[0],
    sucesso: string,
  ) => {
    setSalvando(true)
    setErro(null)
    const r = await servicos.portal.configuracao.atualizar(dados)
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    queryClient.setQueryData(['portal', 'configuracao'], r.dados)
    toast.success(sucesso)
  }

  if (consulta.isError)
    return (
      <Alert tone="danger">Não consegui carregar a configuração. {consulta.error.message}</Alert>
    )
  if (!c) return <Skeleton lines={4} />
  const nomeAtual = nome ?? c.nome ?? ''
  const limiteAtual = limite ?? String(c.avisosLimiteSemanal)
  const limiteNumero = Number.parseInt(limiteAtual, 10)
  const limiteValido = Number.isInteger(limiteNumero) && limiteNumero >= 1 && limiteNumero <= 20
  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-xl font-semibold">Portal do Cliente</h2>
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
        <Switch
          checked={c.ativo}
          disabled={salvando}
          onChange={(e) =>
            void salvar(
              { ativo: e.target.checked },
              e.target.checked ? 'Portal ligado' : 'Portal desligado',
            )
          }
          label="Portal ligado"
        />
        <p className="m-0 text-[13px] text-ink-muted">
          Desligado, ninguém entra e as sessões abertas deixam de valer na hora. Os acessos e os
          chamados ficam guardados.
        </p>
      </section>
      <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
        <TextField
          label="Nome mostrado no topo do portal"
          hint="Em branco, o portal mostra o nome da empresa-cliente."
          maxLength={80}
          value={nomeAtual}
          onChange={(e) => setNome(e.target.value)}
        />
        <div>
          <Button
            variant="primary"
            loading={salvando}
            disabled={nome === null || nomeAtual === (c.nome ?? '')}
            onClick={() => void salvar({ nome: nomeAtual.trim() || null }, 'Nome atualizado')}
          >
            Salvar nome
          </Button>
        </div>
      </section>
      <section className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
        <Switch
          checked={c.exigeDoisFatoresDoResponsavel}
          disabled={salvando}
          onChange={(e) =>
            void salvar(
              { exigeDoisFatoresDoResponsavel: e.target.checked },
              e.target.checked
                ? 'Verificação em duas etapas exigida'
                : 'Verificação em duas etapas opcional',
            )
          }
          label="Exigir verificação em duas etapas do Responsável"
        />
        <p className="m-0 text-[13px] text-ink-muted">
          Quem é Responsável precisa ligar o aplicativo autenticador no próximo acesso. Os Colegas
          podem ligar por vontade própria.
        </p>
      </section>
      <section className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
        <Switch
          checked={c.comentariosAtivos}
          disabled={salvando}
          onChange={(e) =>
            void salvar(
              { comentariosAtivos: e.target.checked },
              e.target.checked ? 'Comentários liberados' : 'Comentários desligados',
            )
          }
          label="Permitir comentários nas publicações"
        />
        <p className="m-0 text-[13px] text-ink-muted">
          Chave geral: desligada, ninguém comenta, em nenhuma publicação. Os comentários já feitos
          continuam visíveis.
        </p>
      </section>
      <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
        <TextField
          label="Avisos normais por semana, por empresa"
          type="number"
          min={1}
          max={20}
          value={limiteAtual}
          onChange={(e) => setLimite(e.target.value)}
          error={limiteValido ? undefined : 'Use um número de 1 a 20.'}
          hint="Evita que o aviso vire ruído. Os avisos urgentes não contam. A semana vai de segunda a domingo."
        />
        <div>
          <Button
            variant="primary"
            loading={salvando}
            disabled={limite === null || !limiteValido || limiteNumero === c.avisosLimiteSemanal}
            onClick={() =>
              void salvar({ avisosLimiteSemanal: limiteNumero }, 'Limite de avisos atualizado')
            }
          >
            Salvar limite
          </Button>
        </div>
      </section>
      <PesquisaDeSatisfacao
        atual={c.formularioSatisfacaoId}
        salvando={salvando}
        aoSalvar={(formularioSatisfacaoId) =>
          void salvar(
            { formularioSatisfacaoId },
            formularioSatisfacaoId
              ? 'Pesquisa de satisfação ligada'
              : 'Pesquisa de satisfação desligada',
          )
        }
      />
      <EventosNoCrm
        ativo={c.eventosCrmAtivo}
        responsavelId={c.eventosCrmResponsavelId}
        avaliacaoPorEmail={c.avaliacaoPorEmail}
        salvando={salvando}
        aoSalvar={(dados, sucesso) => void salvar(dados, sucesso)}
      />
    </div>
  )
}

/**
 * Eventos (Fase 4G): levar ao CRM quem se inscreve com CNPJ (empresa como Lead, contato e a tarefa "Contato
 * pós-evento" para o administrador ou gestor escolhido, que redistribui ao vendedor) e pedir a avaliação por
 * e-mail a quem não tem acesso ao portal.
 */
function EventosNoCrm({
  ativo,
  responsavelId,
  avaliacaoPorEmail,
  salvando,
  aoSalvar,
}: {
  ativo: boolean
  responsavelId: string | null
  avaliacaoPorEmail: boolean
  salvando: boolean
  aoSalvar: (
    dados: {
      eventosCrmAtivo?: boolean
      eventosCrmResponsavelId?: string | null
      avaliacaoPorEmail?: boolean
    },
    sucesso: string,
  ) => void
}) {
  const servicos = useServicos()
  const equipe = useQuery({
    queryKey: ['equipe', 'ativos'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.equipe()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.filter(
        (m) => m.ativo && m.temLogin && (m.papel === 'admin' || m.papel === 'gestor'),
      )
    },
  })
  const [escolha, setEscolha] = useState<string | null>(null)
  const responsavel = escolha ?? responsavelId ?? ''
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
      <h3 className="m-0 text-[15px] font-semibold">Eventos</h3>
      <Select
        label="Responsável pelos inscritos novos"
        value={responsavel}
        disabled={salvando}
        hint="Administrador ou gestor: recebe a empresa e a tarefa do dia útil seguinte ao evento e redistribui ao vendedor."
        options={[
          { value: '', label: 'Escolha' },
          ...(equipe.data ?? []).map((m) => ({ value: m.id, label: m.nome })),
        ]}
        onChange={(e) => {
          setEscolha(e.target.value)
          if (e.target.value && ativo) {
            aoSalvar({ eventosCrmResponsavelId: e.target.value }, 'Responsável atualizado')
          }
        }}
      />
      <Switch
        checked={ativo}
        disabled={salvando || (!ativo && !responsavel)}
        onChange={(e) =>
          aoSalvar(
            e.target.checked
              ? { eventosCrmAtivo: true, eventosCrmResponsavelId: responsavel || null }
              : { eventosCrmAtivo: false },
            e.target.checked ? 'Vínculo com o CRM ligado' : 'Vínculo com o CRM desligado',
          )
        }
        label="Levar ao CRM quem se inscreve com CNPJ"
      />
      <p className="m-0 text-[13px] text-ink-muted">
        Vale para inscrições com o campo CNPJ (página pública e inclusão pela equipe). CNPJ que já
        está na carteira só ganha o contato; CNPJ novo vira Lead com a tarefa “Contato pós-evento”.
      </p>
      <Switch
        checked={avaliacaoPorEmail}
        disabled={salvando}
        onChange={(e) =>
          aoSalvar(
            { avaliacaoPorEmail: e.target.checked },
            e.target.checked ? 'Avaliação por e-mail ligada' : 'Avaliação por e-mail desligada',
          )
        }
        label="Pedir a avaliação por e-mail a quem não tem acesso ao portal"
      />
      <p className="m-0 text-[13px] text-ink-muted">
        Quem tem acesso recebe o pedido no portal (sino e notificação no celular). Sem acesso, chega
        um e-mail com um link pessoal para avaliar.
      </p>
    </section>
  )
}

/**
 * A pesquisa de satisfação dos chamados (Fase 4F): um formulário publicado com a finalidade "Satisfação do
 * chamado". Ao resolver o chamado, o cliente vê a pesquisa no portal; a primeira nota de 1 a 5 vira a avaliação.
 */
function PesquisaDeSatisfacao({
  atual,
  salvando,
  aoSalvar,
}: {
  atual: string | null
  salvando: boolean
  aoSalvar: (id: string | null) => void
}) {
  const servicos = useServicos()
  const [escolha, setEscolha] = useState<string | null>(null)
  const formularios = useQuery({
    queryKey: ['portal', 'formularios', 'satisfacao'],
    queryFn: async () => {
      const r = await servicos.portal.formularios.listar({ situacao: 'publicado', porPagina: 100 })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens.filter((f) => f.finalidade === 'satisfacao_chamado')
    },
  })
  const valor = escolha ?? atual ?? ''
  return (
    <section
      aria-label="Pesquisa de satisfação"
      className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4"
    >
      <Select
        label="Pesquisa de satisfação dos chamados"
        hint="Formulários publicados com a finalidade “Satisfação do chamado”. Sem pesquisa, o cliente avalia só com as estrelas."
        value={valor}
        placeholder="Sem pesquisa (só as estrelas)"
        options={(formularios.data ?? []).map((f) => ({ value: f.id, label: f.nome }))}
        onChange={(e) => setEscolha(e.target.value)}
      />
      <div>
        <Button
          variant="primary"
          loading={salvando}
          disabled={escolha === null || escolha === (atual ?? '')}
          onClick={() => aoSalvar(escolha || null)}
        >
          Salvar pesquisa
        </Button>
      </div>
    </section>
  )
}
