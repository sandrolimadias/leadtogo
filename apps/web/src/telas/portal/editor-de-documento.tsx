import type { Documento } from '@leadtogo/api-client'
import {
  TAMANHO_MAXIMO_DA_DESCRICAO_DO_DOCUMENTO,
  TAMANHO_MAXIMO_DO_DOCUMENTO,
  TAMANHO_MAXIMO_DO_TITULO_DO_DOCUMENTO,
} from '@leadtogo/shared'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Select, TextArea, TextField } from '@leadtogo/ui/campos'
import { Dialog } from '@leadtogo/ui/dialog'
import { Alert } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

import { tamanhoLegivel } from '../chamados/rotulos'

import { SelecaoDeEmpresas } from './selecao-de-empresas'
import { SelecaoDeTags } from './selecao-de-tags'

/**
 * Novo documento (escolhe o arquivo, que sobe direto ao armazenamento e passa pelo antivírus) ou edição dos dados
 * de um documento existente (o arquivo não troca: publique outro).
 */
export function EditorDeDocumento({
  inicial,
  aoFechar,
  aoSalvar,
}: {
  inicial: Documento | null
  aoFechar: () => void
  aoSalvar: (d: Documento) => void
}) {
  const servicos = useServicos()
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '')
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '')
  const [alcance, setAlcance] = useState<'todos' | 'empresas' | 'tags'>(inicial?.alcance ?? 'todos')
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>(inicial?.empresas ?? [])
  const [tags, setTags] = useState<{ id: string; nome: string }[]>(inicial?.tags ?? [])
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const pronto =
    titulo.trim().length >= 3 &&
    (inicial !== null || arquivo !== null) &&
    (alcance === 'todos' || (alcance === 'empresas' ? empresas.length > 0 : tags.length > 0))

  async function salvar() {
    setErro(null)
    const comum = {
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      alcance,
      empresaIds: alcance === 'empresas' ? empresas.map((e) => e.id) : [],
      tagIds: alcance === 'tags' ? tags.map((t) => t.id) : [],
    }
    setOcupado(true)
    try {
      if (inicial) {
        const r = await servicos.portal.documentos.editar(inicial.id, comum)
        if (!r.ok) return setErro(r.erro.mensagem)
        toast.success('Documento atualizado')
        return aoSalvar(r.dados)
      }
      if (!arquivo) return
      const criado = await servicos.portal.documentos.criar({
        ...comum,
        arquivo: {
          nome: arquivo.name,
          mime: arquivo.type || 'application/octet-stream',
          tamanho: arquivo.size,
        },
      })
      if (!criado.ok) return setErro(criado.erro.mensagem)
      const envio = await servicos.portal.documentos.enviar(criado.dados.envio.url, arquivo)
      if (!envio.ok) return setErro(envio.erro.mensagem)
      const confirmado = await servicos.portal.documentos.confirmar(criado.dados.documento.id)
      if (!confirmado.ok) return setErro(confirmado.erro.mensagem)
      toast.success(
        'Documento enviado. O antivírus verifica o arquivo antes de liberar para os clientes.',
      )
      aoSalvar(confirmado.dados)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !ocupado) aoFechar()
      }}
      title={inicial ? 'Editar documento' : 'Novo documento'}
      description={
        inicial
          ? 'O arquivo não troca: para outra versão, publique um novo documento.'
          : 'O arquivo passa pelo antivírus antes de aparecer para os clientes.'
      }
      width={600}
      footer={
        <>
          <Button disabled={ocupado} onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={ocupado}
            disabled={!pronto}
            onClick={() => void salvar()}
          >
            {inicial ? 'Salvar' : 'Enviar documento'}
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
          maxLength={TAMANHO_MAXIMO_DO_TITULO_DO_DOCUMENTO}
          onChange={(e) => setTitulo(e.target.value)}
        />
        <TextArea
          label="Descrição"
          rows={3}
          value={descricao}
          maxLength={TAMANHO_MAXIMO_DA_DESCRICAO_DO_DOCUMENTO}
          onChange={(e) => setDescricao(e.target.value)}
          hint="Opcional. Aparece abaixo do título, para o cliente saber do que se trata."
        />
        {inicial ? (
          <p className="m-0 text-sm text-ink-muted">
            Arquivo: <strong>{inicial.arquivo.nome}</strong> (
            {tamanhoLegivel(inicial.arquivo.tamanho)})
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="arquivo-do-documento"
              className="text-[13px] leading-[18px] font-semibold"
            >
              Arquivo
              <span aria-hidden="true" className="ml-0.5 text-danger">
                *
              </span>
            </label>
            <input
              id="arquivo-do-documento"
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setArquivo(f)
                setErro(
                  f && f.size > TAMANHO_MAXIMO_DO_DOCUMENTO
                    ? 'O arquivo passa de 25 MB. Escolha um menor.'
                    : null,
                )
              }}
            />
            <span className="text-xs text-ink-muted">
              {arquivo
                ? `${arquivo.name} · ${tamanhoLegivel(arquivo.size)}`
                : 'Até 25 MB. PDF, planilha, imagem ou outro arquivo.'}
            </span>
          </div>
        )}
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
      </div>
    </Dialog>
  )
}
