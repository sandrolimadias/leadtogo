import type { Evento } from '@leadtogo/api-client'
import {
  type SalvarEventoEntrada,
  TAMANHO_MAXIMO_DA_DESCRICAO_DO_EVENTO,
  TAMANHO_MAXIMO_DO_LOCAL,
  TAMANHO_MAXIMO_DO_TITULO_DO_EVENTO,
} from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Select, TextArea, TextField } from '@leadtogo/ui/campos'
import { Switch } from '@leadtogo/ui/checkbox'
import { Dialog } from '@leadtogo/ui/dialog'
import { Alert } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

import { SelecaoDeEmpresas } from './selecao-de-empresas'
import { SelecaoDeTags } from './selecao-de-tags'

/** `datetime-local` (hora do navegador) → ISO com fuso; vazio ou inválido → null. */
const paraIso = (local: string): string | null => {
  const data = new Date(local)
  return local && !Number.isNaN(data.getTime()) ? data.toISOString() : null
}
const paraLocal = (iso: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`
}
const inteiro = (texto: string): number | null => {
  const n = Number.parseInt(texto, 10)
  return Number.isFinite(n) ? n : null
}

/** Os formulários publicados de uma finalidade, para escolher no evento. */
function useFormularios(finalidade: 'inscricao_evento' | 'avaliacao_evento') {
  const servicos = useServicos()
  return useQuery({
    queryKey: ['portal', 'formularios', 'finalidade', finalidade],
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.formularios.listar({
        finalidade,
        situacao: 'publicado',
        porPagina: 100,
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens
    },
  })
}

/** Criar ou editar um evento da agenda (nasce como rascunho; publicar é uma ação à parte). */
export function EditorDeEvento({
  inicial,
  aoFechar,
  aoSalvar,
}: {
  inicial: Evento | null
  aoFechar: () => void
  aoSalvar: (e: Evento) => void
}) {
  const servicos = useServicos()
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '')
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '')
  const [local, setLocal] = useState(inicial?.local ?? '')
  const [linkOnline, setLinkOnline] = useState(inicial?.linkOnline ?? '')
  const [inicio, setInicio] = useState(paraLocal(inicial?.inicioEm ?? null))
  const [fim, setFim] = useState(paraLocal(inicial?.fimEm ?? null))
  const [vagasTotais, setVagasTotais] = useState(String(inicial?.vagasTotais ?? ''))
  const [vagasPorEmpresa, setVagasPorEmpresa] = useState(String(inicial?.vagasPorEmpresa ?? ''))
  const [prazo, setPrazo] = useState(paraLocal(inicial?.prazoConfirmacao ?? null))
  const [alcance, setAlcance] = useState<'todos' | 'empresas' | 'tags'>(inicial?.alcance ?? 'todos')
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>(inicial?.empresas ?? [])
  const [tags, setTags] = useState<{ id: string; nome: string }[]>(inicial?.tags ?? [])
  const [publico, setPublico] = useState(inicial?.publico ?? false)
  const [formInscricao, setFormInscricao] = useState(inicial?.formularioInscricaoId ?? '')
  const [formAvaliacao, setFormAvaliacao] = useState(inicial?.formularioAvaliacaoId ?? '')
  const [exigeCodigo, setExigeCodigo] = useState(inicial?.checkinExigeCodigo ?? false)
  const deInscricao = useFormularios('inscricao_evento')
  const deAvaliacao = useFormularios('avaliacao_evento')
  const semAudiencia =
    (alcance === 'empresas' && empresas.length === 0) || (alcance === 'tags' && tags.length === 0)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    setErro(null)
    const inicioEm = paraIso(inicio)
    const fimEm = paraIso(fim)
    if (!inicioEm || !fimEm) return setErro('Informe o início e o fim do evento.')
    const dados: SalvarEventoEntrada = {
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      local: local.trim() || null,
      linkOnline: linkOnline.trim() || null,
      inicioEm,
      fimEm,
      vagasTotais: inteiro(vagasTotais),
      vagasPorEmpresa: inteiro(vagasPorEmpresa),
      prazoConfirmacao: paraIso(prazo),
      alcance,
      empresaIds: alcance === 'empresas' ? empresas.map((e) => e.id) : [],
      tagIds: alcance === 'tags' ? tags.map((t) => t.id) : [],
      publico,
      formularioInscricaoId: formInscricao || null,
      formularioAvaliacaoId: formAvaliacao || null,
      checkinExigeCodigo: exigeCodigo,
    }
    setOcupado(true)
    const r = inicial
      ? await servicos.portal.eventos.editar(inicial.id, dados)
      : await servicos.portal.eventos.criar(dados)
    setOcupado(false)
    if (!r.ok) return setErro(r.erro.mensagem)
    toast.success(inicial ? 'Evento atualizado' : 'Evento criado como rascunho')
    aoSalvar(r.dados)
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !ocupado) aoFechar()
      }}
      title={inicial ? 'Editar evento' : 'Novo evento'}
      description={
        inicial?.situacao === 'publicado'
          ? 'O evento já está publicado: as mudanças valem na hora para os clientes.'
          : 'Fica como rascunho até você publicar.'
      }
      width={640}
      footer={
        <>
          <Button disabled={ocupado} onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={ocupado}
            disabled={titulo.trim().length < 3 || !inicio || !fim || semAudiencia}
            onClick={() => void salvar()}
          >
            {inicial ? 'Salvar alterações' : 'Criar evento'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
        <TextField
          label="Título"
          required
          value={titulo}
          maxLength={TAMANHO_MAXIMO_DO_TITULO_DO_EVENTO}
          onChange={(e) => setTitulo(e.target.value)}
        />
        <TextArea
          label="Descrição"
          rows={4}
          value={descricao}
          maxLength={TAMANHO_MAXIMO_DA_DESCRICAO_DO_EVENTO}
          onChange={(e) => setDescricao(e.target.value)}
          hint="Opcional. Aceita **negrito**, *itálico*, [link](https://...) e listas com “- ”. HTML não é aceito."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Início"
            type="datetime-local"
            required
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
          <TextField
            label="Fim"
            type="datetime-local"
            required
            value={fim}
            onChange={(e) => setFim(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Local"
            value={local}
            maxLength={TAMANHO_MAXIMO_DO_LOCAL}
            onChange={(e) => setLocal(e.target.value)}
          />
          <TextField
            label="Link online"
            value={linkOnline}
            placeholder="https://"
            onChange={(e) => setLinkOnline(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField
            label="Vagas totais"
            type="number"
            min={1}
            value={vagasTotais}
            hint="Vazio = sem limite"
            onChange={(e) => setVagasTotais(e.target.value)}
          />
          <TextField
            label="Vagas por empresa"
            type="number"
            min={1}
            value={vagasPorEmpresa}
            hint="Vazio = sem limite"
            onChange={(e) => setVagasPorEmpresa(e.target.value)}
          />
          <TextField
            label="Confirmar até"
            type="datetime-local"
            value={prazo}
            hint="Vazio = até o início"
            onChange={(e) => setPrazo(e.target.value)}
          />
        </div>
        <Select
          label="Para quem"
          value={alcance}
          options={[
            { value: 'todos', label: 'Todos os clientes' },
            { value: 'empresas', label: 'Empresas escolhidas' },
            { value: 'tags', label: 'Contatos com tags' },
          ]}
          onChange={(e) => setAlcance(e.target.value as 'todos' | 'empresas' | 'tags')}
        />
        {alcance === 'empresas' ? (
          <SelecaoDeEmpresas empresas={empresas} aoMudar={setEmpresas} />
        ) : null}
        {alcance === 'tags' ? <SelecaoDeTags tags={tags} aoMudar={setTags} /> : null}
        <Switch
          label="Mostrar na página pública de eventos (inscrição sem login)"
          checked={publico}
          onChange={(e) => setPublico(e.target.checked)}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Formulário de inscrição"
            value={formInscricao}
            hint="Sem formulário, o cliente confirma com um toque."
            options={[
              { value: '', label: 'Nenhum (confirmação direta)' },
              ...(deInscricao.data ?? []).map((f) => ({ value: f.id, label: f.nome })),
            ]}
            onChange={(e) => setFormInscricao(e.target.value)}
          />
          <Select
            label="Formulário de avaliação"
            value={formAvaliacao}
            hint="Pedido a quem esteve presente quando o evento é encerrado."
            options={[
              { value: '', label: 'Sem avaliação' },
              ...(deAvaliacao.data ?? []).map((f) => ({ value: f.id, label: f.nome })),
            ]}
            onChange={(e) => setFormAvaliacao(e.target.value)}
          />
        </div>
        <Switch
          label="Check-in pelo QR pede o código enviado ao e-mail"
          checked={exigeCodigo}
          onChange={(e) => setExigeCodigo(e.target.checked)}
        />
        <p className="-mt-2 m-0 text-xs text-ink-muted">
          Desligado, quem lê o QR sem estar logado só informa o e-mail da inscrição: mais rápido na
          recepção. Logado no portal, o check-in é sempre um toque.
        </p>
      </div>
    </Dialog>
  )
}
