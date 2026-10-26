import type { UseQueryResult } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Check } from 'lucide-react'
import { type KeyboardEvent, type ReactNode } from 'react'

import { Button, IconButton } from '@leadtogo/ui/button'
import { CORES_DE_TAG, classeDaCor, type CorDeTag, ROTULO_DA_COR } from '@leadtogo/ui/cores'
import { Dialog, Sheet } from '@leadtogo/ui/dialog'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { cn } from '@leadtogo/ui/cn'
import { useDispositivo } from '@/casca/dispositivo'

// Peças comuns das telas de Configurações → Cadastros (tags, tipos de atividade, funis...).

/** Diálogo no desktop e no tablet; folha que sobe do rodapé no celular. */
export function Janela({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  width,
}: {
  open: boolean
  onOpenChange: (aberto: boolean) => void
  title: string
  description?: string
  footer?: ReactNode
  children?: ReactNode
  width?: number
}) {
  const celular = useDispositivo() === 'celular'
  const comuns = {
    open,
    onOpenChange,
    title,
    ...(description ? { description } : {}),
    ...(footer ? { footer } : {}),
  }
  return celular ? (
    <Sheet {...comuns}>{children}</Sheet>
  ) : (
    <Dialog {...comuns} {...(width ? { width } : {})}>
      {children}
    </Dialog>
  )
}

/** Título da seção, uma frase que diz para que serve e a ação principal (uma só). */
export function CabecalhoDeSecao({
  titulo,
  descricao,
  acao,
}: {
  titulo: string
  descricao: string
  acao?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="m-0 text-[17px] leading-6 font-semibold">{titulo}</h2>
        <p className="m-0 text-sm text-ink-muted">{descricao}</p>
      </div>
      {acao}
    </div>
  )
}

/** Carregando (o formato do que vem) ou erro com "Tentar de novo"; com dados, mostra o conteúdo. */
export function Carregamento({
  consulta,
  rotulo,
  cabecalho,
  children,
}: {
  consulta: Pick<UseQueryResult<unknown, Error>, 'isPending' | 'isError' | 'error' | 'refetch'>
  /** O que está carregando, no plural: "as tags" */
  rotulo: string
  cabecalho: ReactNode
  children: ReactNode
}) {
  if (consulta.isPending) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label={`Carregando ${rotulo}`}>
        {cabecalho}
        <Skeleton lines={4} />
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <div className="flex flex-col gap-4">
        {cabecalho}
        <Alert
          tone="danger"
          title={`Não foi possível carregar ${rotulo}`}
          actions={
            <Button size="sm" onClick={() => void consulta.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          {consulta.error?.message}
        </Alert>
      </div>
    )
  }
  return children
}

/** Subir e descer um item da lista (sem arrastar: funciona no celular e no teclado). */
export function BotoesDeOrdem({
  nome,
  primeiro,
  ultimo,
  desativado,
  aoMover,
}: {
  nome: string
  primeiro: boolean
  ultimo: boolean
  desativado?: boolean
  aoMover: (deslocamento: -1 | 1) => void
}) {
  return (
    <>
      <IconButton
        size="sm"
        icon={ArrowUp}
        label={`Mover ${nome} para cima`}
        disabled={primeiro || desativado}
        onClick={() => aoMover(-1)}
      />
      <IconButton
        size="sm"
        icon={ArrowDown}
        label={`Mover ${nome} para baixo`}
        disabled={ultimo || desativado}
        onClick={() => aoMover(1)}
      />
    </>
  )
}

/** As 10 cores da paleta de tags. A escolhida leva um "✓" além do anel: nunca só a cor. */
export function SeletorDeCor({
  label,
  value,
  onChange,
}: {
  label: string
  value: CorDeTag
  onChange: (cor: CorDeTag) => void
}) {
  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const passo =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    if (!passo) return
    e.preventDefault()
    const proxima = CORES_DE_TAG[(indice + passo + CORES_DE_TAG.length) % CORES_DE_TAG.length]
    if (!proxima) return
    onChange(proxima)
    const irmaos = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')
    irmaos?.[CORES_DE_TAG.indexOf(proxima)]?.focus()
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span id="seletor-de-cor-rotulo" className="text-[13px] leading-[18px] font-semibold">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby="seletor-de-cor-rotulo"
        className="flex flex-wrap gap-2"
      >
        {CORES_DE_TAG.map((cor, i) => {
          const marcada = cor === value
          return (
            <button
              key={cor}
              type="button"
              role="radio"
              aria-checked={marcada}
              aria-label={ROTULO_DA_COR[cor]}
              title={ROTULO_DA_COR[cor]}
              tabIndex={marcada ? 0 : -1}
              onClick={() => onChange(cor)}
              onKeyDown={(e) => aoTeclar(e, i)}
              className={cn(
                'inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-border-strong',
                classeDaCor[cor],
                marcada && 'outline-2 outline-offset-2 outline-ink',
              )}
            >
              {marcada ? (
                <Check size={16} strokeWidth={2.5} aria-hidden="true" />
              ) : (
                <span aria-hidden="true" className="size-2 rounded-full bg-current" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Confirmação de uma ação que não dá para desfazer pela tela (excluir). */
export function DialogoDeConfirmacao({
  aberto,
  titulo,
  descricao,
  rotuloDoBotao,
  erro,
  enviando,
  aoConfirmar,
  aoFechar,
}: {
  aberto: boolean
  titulo: string
  descricao: string
  rotuloDoBotao: string
  erro?: string | undefined
  enviando: boolean
  aoConfirmar: () => void
  aoFechar: () => void
}) {
  return (
    <Janela
      open={aberto}
      onOpenChange={(o) => {
        if (!o) aoFechar()
      }}
      title={titulo}
      description={descricao}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>
            Voltar
          </Button>
          <Button variant="danger" loading={enviando} onClick={aoConfirmar}>
            {rotuloDoBotao}
          </Button>
        </>
      }
    >
      {erro ? (
        <Alert tone="danger" title="Não foi possível concluir">
          {erro}
        </Alert>
      ) : null}
    </Janela>
  )
}
