import {
  campoDoTipo,
  LIMITE_BYTES_DA_IMPORTACAO,
  LIMITE_LINHAS_DA_IMPORTACAO,
  ROTULO_DO_TIPO_DE_IMPORTACAO,
  TIPOS_DE_IMPORTACAO,
  type TipoDeImportacao,
} from '@leadtogo/shared'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { Download, FileSpreadsheet, Info, Upload, X } from 'lucide-react'
import { type DragEvent, useRef, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/campos'
import { Alert } from '@/components/ui/feedback'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { cn } from '@/lib/cn'
import { useEnvio } from '@/telas/acesso/comum'

import { formatarTamanho, PASSO, TEXTOS_DO_TIPO, useQuemImporta } from './comum'
import { Pagina } from './pagina'

const EXTENSOES = ['.xlsx', '.csv']
const rota = getRouteApi('/_autenticado/importacao/nova')

/** Uma frase do que cada linha da planilha vira, para quem escolhe o tipo. */
const DESCRICAO_DO_TIPO: Record<TipoDeImportacao, string> = {
  empresas: 'Cada linha da planilha vira uma empresa na carteira, identificada pelo CNPJ.',
  contatos:
    'Cada linha vira um contato, ligado à empresa pelo CNPJ (a empresa precisa já estar na carteira). Contato que já existe (mesmo e-mail ou telefone) só é vinculado à empresa, sem mudar os dados dele.',
  atividades:
    'Cada linha vira uma atividade da empresa, ligada pelo CNPJ (a empresa precisa já estar na carteira). A realizada atualiza a última visita, o último contato e as tags da empresa, como se tivesse sido registrada à mão.',
}

/** O que está errado no arquivo escolhido, antes de enviar; `undefined` = pode enviar. */
function erroDoArquivo(arquivo: File): string | undefined {
  const nome = arquivo.name.toLowerCase()
  if (!EXTENSOES.some((e) => nome.endsWith(e))) {
    return 'Envie uma planilha Excel (.xlsx) ou um arquivo CSV.'
  }
  if (arquivo.size === 0) return 'O arquivo está vazio.'
  if (arquivo.size > LIMITE_BYTES_DA_IMPORTACAO) {
    return `O arquivo passa de ${formatarTamanho(LIMITE_BYTES_DA_IMPORTACAO)}. Divida a planilha em partes.`
  }
  return undefined
}

/** Passo 1: escolher a planilha (Excel ou CSV) e criar o lote. */
export function EnviarPlanilha() {
  const servicos = useServicos()
  const navegar = useNavigate()
  const { pode } = useQuemImporta()
  const { enviando, executar } = useEnvio()
  const { tipo: tipoInicial } = rota.useSearch()
  const [tipo, setTipo] = useState<TipoDeImportacao>(tipoInicial ?? 'empresas')
  const entrada = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string>()
  const [arrastando, setArrastando] = useState(false)

  const escolher = (novo: File | undefined) => {
    if (!novo) return
    setErro(erroDoArquivo(novo))
    setArquivo(novo)
  }
  const soltar = (e: DragEvent) => {
    e.preventDefault()
    setArrastando(false)
    escolher(e.dataTransfer.files[0])
  }
  const trocar = () => {
    setArquivo(null)
    setErro(undefined)
    if (entrada.current) entrada.current.value = ''
  }

  const enviar = () =>
    executar(async () => {
      if (!arquivo) return
      const r = await servicos.importacao.lotes.enviar(arquivo, nome.trim() || undefined, tipo)
      if (!r.ok) {
        setErro(r.erro.mensagem)
        return
      }
      await navegar({ to: '/importacao/$loteId', params: { loteId: r.dados.id } })
    })

  if (!pode) return null
  return (
    <Pagina
      titulo="Importar planilha"
      trilha={`${TEXTOS_DO_TIPO[tipo].trilha} › Importar planilha`}
      passo={PASSO.enviar}
      tipo={tipo}
      rodape={
        <Button
          variant="primary"
          iconRight={Upload}
          disabled={!arquivo || erroDoArquivo(arquivo) !== undefined}
          loading={enviando}
          onClick={() => void enviar()}
        >
          {enviando ? 'Enviando…' : 'Enviar e mapear colunas'}
        </Button>
      }
    >
      <section
        aria-label="Escolher o arquivo"
        className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
      >
        <h2 className="m-0 text-[15px] leading-5 font-semibold">O que você vai importar?</h2>
        <SegmentedControl
          label="O que importar"
          options={TIPOS_DE_IMPORTACAO.map((t) => ({
            value: t,
            label: ROTULO_DO_TIPO_DE_IMPORTACAO[t],
          }))}
          value={tipo}
          onChange={(v) => setTipo(v as TipoDeImportacao)}
        />
        <p className="m-0 text-[13px] text-ink-muted">{DESCRICAO_DO_TIPO[tipo]}</p>
        <Alert tone="info">
          Ordem recomendada: <strong>empresas → contatos → atividades</strong>. Contatos e
          atividades se ligam à empresa pelo CNPJ, que já precisa estar na carteira.
        </Alert>
        {tipo !== 'empresas' ? (
          <p className="m-0 text-[13px] text-ink-muted">
            Colunas:{' '}
            {(campoDoTipo(tipo) as readonly { rotulo: string; obrigatorio?: boolean }[])
              .map((c) => (c.obrigatorio ? `${c.rotulo}*` : c.rotulo))
              .join(' · ')}
            . O que tem * é obrigatório.
          </p>
        ) : null}

        {arquivo ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
            <span className="flex size-9 items-center justify-center rounded-sm bg-success-soft text-success">
              <FileSpreadsheet size={18} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="flex min-w-40 flex-1 flex-col">
              <span className="font-semibold">{arquivo.name}</span>
              <span className="text-[13px] text-ink-muted">{formatarTamanho(arquivo.size)}</span>
            </div>
            <Button variant="ghost" size="sm" icon={X} onClick={trocar}>
              Trocar
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setArrastando(true)
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={soltar}
            className={cn(
              'flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-dashed border-border-strong bg-surface-sunken p-6 text-ink max-md:min-h-[180px]',
              arrastando && 'border-brand',
            )}
          >
            <Upload size={28} strokeWidth={1.75} aria-hidden="true" className="text-ink-muted" />
            <span className="text-base font-semibold">Escolher arquivo</span>
            <span className="text-[13px] text-ink-muted">
              Excel (.xlsx) ou CSV, até {LIMITE_LINHAS_DA_IMPORTACAO.toLocaleString('pt-BR')} linhas
              e {formatarTamanho(LIMITE_BYTES_DA_IMPORTACAO)}
            </span>
          </button>
        )}
        <input
          ref={entrada}
          type="file"
          accept=".xlsx,.csv"
          aria-label="Arquivo da planilha"
          className="sr-only"
          onChange={(e) => escolher(e.target.files?.[0])}
        />

        {arquivo ? (
          <TextField
            label="Nome da importação"
            hint="Opcional. Se ficar em branco, usamos o nome do arquivo."
            value={nome}
            maxLength={120}
            onChange={(e) => setNome(e.target.value)}
          />
        ) : null}

        {erro ? (
          <Alert tone="danger" title="Não foi possível usar este arquivo">
            {erro}
          </Alert>
        ) : null}

        <Link to="/importacao" className="w-fit text-[13px] font-semibold text-brand">
          Ver as importações anteriores
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
          <Info size={14} strokeWidth={1.75} aria-hidden="true" />
          <span className="min-w-52 flex-1">
            A primeira linha precisa ter os nomes das colunas.
          </span>
          <a
            href={
              tipo === 'empresas' ? '/v1/importacao/modelo' : `/v1/importacao/modelo?tipo=${tipo}`
            }
            download
            className="inline-flex h-(--control-sm) items-center gap-1.5 rounded-sm px-2 text-[13px] font-semibold text-ink hover:bg-surface-hover"
          >
            <Download size={16} strokeWidth={1.75} aria-hidden="true" />
            Baixar modelo
          </a>
        </div>
      </section>
    </Pagina>
  )
}
