import type { Publicacao } from '@leadtogo/api-client'
import {
  type SalvarPublicacaoEntrada,
  TAMANHO_MAXIMO_DA_PUBLICACAO,
  TAMANHO_MAXIMO_DO_TITULO,
} from '@leadtogo/shared'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Select, TextArea, TextField } from '@leadtogo/ui/campos'
import { Dialog } from '@leadtogo/ui/dialog'
import { Alert } from '@leadtogo/ui/feedback'
import { Markdown } from '@leadtogo/ui/markdown'
import { toast } from '@leadtogo/ui/toast'

import { SelecaoDeEmpresas } from './selecao-de-empresas'

type Quando = 'rascunho' | 'publicada' | 'agendada'

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

/**
 * Criar ou editar uma publicação do portal. Rascunho e agendada mudam livremente; a já publicada só tem o
 * conteúdo e o alcance editados (a API recusa voltar a rascunho).
 */
export function EditorDePublicacao({
  inicial,
  aoFechar,
  aoSalvar,
}: {
  inicial: Publicacao | null
  aoFechar: () => void
  aoSalvar: (p: Publicacao) => void
}) {
  const servicos = useServicos()
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '')
  const [corpo, setCorpo] = useState(inicial?.corpo ?? '')
  const [alcance, setAlcance] = useState<'todos' | 'empresas'>(inicial?.alcance ?? 'todos')
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>(inicial?.empresas ?? [])
  const [quando, setQuando] = useState<Quando>(
    inicial?.situacao === 'publicada' ? 'publicada' : (inicial?.situacao ?? 'rascunho'),
  )
  const [agendarPara, setAgendarPara] = useState(paraLocal(inicial?.agendadaPara ?? null))
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [previa, setPrevia] = useState(false)
  const jaPublicada = inicial?.situacao === 'publicada'

  const rotuloDoBotao =
    quando === 'publicada'
      ? jaPublicada
        ? 'Salvar alterações'
        : 'Publicar'
      : quando === 'agendada'
        ? 'Agendar'
        : 'Salvar rascunho'

  async function salvar() {
    setErro(null)
    const agendadaPara = quando === 'agendada' ? paraIso(agendarPara) : null
    if (quando === 'agendada' && !agendadaPara) {
      setErro('Informe quando publicar.')
      return
    }
    const dados: SalvarPublicacaoEntrada = {
      titulo: titulo.trim(),
      corpo: corpo.trim(),
      alcance,
      empresaIds: alcance === 'empresas' ? empresas.map((e) => e.id) : [],
      situacao: quando,
      agendadaPara,
    }
    setOcupado(true)
    const r = inicial
      ? await servicos.portal.publicacoes.editar(inicial.id, dados)
      : await servicos.portal.publicacoes.criar(dados)
    setOcupado(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success(
      quando === 'publicada'
        ? jaPublicada
          ? 'Publicação atualizada'
          : 'Publicação no ar'
        : quando === 'agendada'
          ? 'Publicação agendada'
          : 'Rascunho salvo',
    )
    aoSalvar(r.dados)
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) aoFechar()
      }}
      title={inicial ? 'Editar publicação' : 'Nova publicação'}
      description="Aparece no Início do portal dos clientes do alcance escolhido."
      width={640}
      footer={
        <>
          <Button onClick={aoFechar}>Cancelar</Button>
          <Button
            variant="primary"
            loading={ocupado}
            disabled={titulo.trim().length < 3 || corpo.trim() === ''}
            onClick={() => void salvar()}
          >
            {rotuloDoBotao}
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
          maxLength={TAMANHO_MAXIMO_DO_TITULO}
          onChange={(e) => setTitulo(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <TextArea
            label="Texto"
            required
            rows={8}
            value={corpo}
            maxLength={TAMANHO_MAXIMO_DA_PUBLICACAO}
            onChange={(e) => setCorpo(e.target.value)}
            hint="Aceita **negrito**, *itálico*, [link](https://...), listas com “- ” e subtítulos com “## ”. HTML não é aceito."
          />
          <div>
            <Button size="sm" variant="ghost" onClick={() => setPrevia((v) => !v)}>
              {previa ? 'Ocultar pré-visualização' : 'Pré-visualizar'}
            </Button>
          </div>
          {previa ? (
            <div
              aria-label="Pré-visualização"
              role="region"
              className="rounded-sm border border-border bg-surface-sunken p-3"
            >
              {corpo.trim() ? (
                <Markdown texto={corpo} />
              ) : (
                <span className="text-sm text-ink-muted">Nada para mostrar ainda.</span>
              )}
            </div>
          ) : null}
        </div>

        <Select
          label="Para quem"
          value={alcance}
          options={[
            { value: 'todos', label: 'Todos os clientes' },
            { value: 'empresas', label: 'Empresas escolhidas' },
          ]}
          onChange={(e) => setAlcance(e.target.value as 'todos' | 'empresas')}
        />
        {alcance === 'empresas' ? (
          <SelecaoDeEmpresas empresas={empresas} aoMudar={setEmpresas} />
        ) : null}

        {jaPublicada ? null : (
          <>
            <Select
              label="Quando"
              value={quando}
              options={[
                { value: 'rascunho', label: 'Só guardar como rascunho' },
                { value: 'publicada', label: 'Publicar agora' },
                { value: 'agendada', label: 'Agendar' },
              ]}
              onChange={(e) => setQuando(e.target.value as Quando)}
            />
            {quando === 'agendada' ? (
              <TextField
                label="Publicar em"
                type="datetime-local"
                value={agendarPara}
                onChange={(e) => setAgendarPara(e.target.value)}
              />
            ) : null}
          </>
        )}
      </div>
    </Dialog>
  )
}
