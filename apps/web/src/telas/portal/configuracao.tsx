import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
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
    </div>
  )
}
