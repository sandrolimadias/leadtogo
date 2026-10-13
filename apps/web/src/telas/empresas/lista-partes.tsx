import type { ItemDaLista } from '@leadtogo/api-client'
import { linkDeLigacao, linkDoWhatsapp } from '@leadtogo/shared'
import {
  Calendar,
  ChevronRight,
  Clock,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { Tag } from '@/components/ui/exibicao'
import type { CorDeTag } from '@/components/ui/cores'
import { cn } from '@/lib/cn'

import { dataCurta, diasDesde, documentoFormatado, linkDeRota, tempoRelativo } from './formatos'

/** Visita a partir de 90 dias (ou nunca) é alerta; o contato, a partir do que a empresa configurou. */
export const DIAS_DE_ALERTA_DA_VISITA = 90

export function TagsDaEmpresa({ tags }: { tags: ItemDaLista['tags'] }) {
  if (tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <Tag key={t.id} color={t.cor as CorDeTag}>
          {t.nome}
        </Tag>
      ))}
    </div>
  )
}

/** Data e, abaixo, o tempo desde então; em alerta (aviso + negrito) quando passou do limite ou nunca houve. */
function DataComTempo({ iso, limite }: { iso: string | null; limite: number }) {
  const dias = diasDesde(iso)
  const alerta = dias === null || dias >= limite
  return (
    <div className="flex flex-col tabular-nums">
      <span>{dataCurta(iso)}</span>
      <span
        className={cn(
          'text-xs leading-4',
          alerta ? 'font-semibold text-warning' : 'text-ink-muted',
        )}
      >
        {tempoRelativo(dias)}
      </span>
    </div>
  )
}

function ProximaAtividade({ iso }: { iso: string | null }) {
  if (iso) return <span className="text-[13px] tabular-nums">{dataCurta(iso)}</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-warning">
      <Calendar size={13} strokeWidth={1.75} aria-hidden="true" />
      Sem próxima atividade
    </span>
  )
}

const cabecalho = 'h-9 px-3 text-left text-xs font-semibold text-ink-muted border-b border-border'

/** Tabela do desktop e do tablet. As células quebram linha: sem rolagem horizontal. */
export function TabelaDeEmpresas({
  itens,
  diasDeAlertaDoContato,
  aoAbrir,
}: {
  itens: ItemDaLista[]
  diasDeAlertaDoContato: number
  aoAbrir: (id: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-sm leading-5">
        <thead className="bg-surface-sunken">
          <tr>
            <th scope="col" className={cabecalho}>
              Empresa
            </th>
            <th scope="col" className={cabecalho}>
              Tags
            </th>
            <th scope="col" className={cabecalho}>
              Cidade
            </th>
            <th scope="col" className={cabecalho}>
              Última visita
            </th>
            <th scope="col" className={cabecalho}>
              Último contato
            </th>
            <th scope="col" className={cabecalho}>
              Próxima atividade
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((e) => (
            <tr
              key={e.id}
              className="cursor-pointer hover:bg-surface-hover"
              onClick={() => aoAbrir(e.id)}
            >
              <td className="min-w-40 border-b border-border px-3 py-2">
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    aoAbrir(e.id)
                  }}
                  className="flex cursor-pointer flex-col border-0 bg-transparent p-0 text-left text-inherit"
                >
                  <span className="font-semibold">{e.nome}</span>
                  <span className="font-mono text-xs leading-4 text-ink-muted">
                    {documentoFormatado(e.tipoDocumento, e.documento)}
                  </span>
                </button>
              </td>
              <td className="border-b border-border px-3 py-2">
                <TagsDaEmpresa tags={e.tags} />
              </td>
              <td className="border-b border-border px-3 py-2">
                {e.cidade ? `${e.cidade.nome}/${e.cidade.uf}` : '—'}
              </td>
              <td className="border-b border-border px-3 py-2">
                <DataComTempo iso={e.ultimaVisitaEm} limite={DIAS_DE_ALERTA_DA_VISITA} />
              </td>
              <td className="border-b border-border px-3 py-2">
                <DataComTempo iso={e.ultimoContatoEm} limite={diasDeAlertaDoContato} />
              </td>
              <td className="border-b border-border px-3 py-2">
                <ProximaAtividade iso={e.proximaAtividadeEm} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AcaoDoCartao({
  icone,
  rotulo,
  cor,
  href,
  ultima,
}: {
  icone: ReactNode
  rotulo: string
  cor: string
  href: string | null
  ultima?: boolean
}) {
  const classes = cn(
    'flex h-12 items-center justify-center gap-2 border-0 bg-transparent text-[15px] font-semibold text-ink',
    !ultima && 'border-r border-border',
    !href && 'cursor-not-allowed opacity-45',
  )
  const conteudo = (
    <>
      <span className={cn('flex', cor)}>{icone}</span>
      {rotulo}
    </>
  )
  return href ? (
    <a
      href={href}
      className={classes}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel="noreferrer"
    >
      {conteudo}
    </a>
  ) : (
    <span role="link" aria-disabled="true" className={classes}>
      {conteudo}
    </span>
  )
}

/** Cartões do celular, com Ligar, WhatsApp e Rota. */
export function CartoesDeEmpresas({
  itens,
  aoAbrir,
}: {
  itens: ItemDaLista[]
  aoAbrir: (id: string) => void
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {itens.map((e) => {
        const dias = diasDesde(e.ultimaVisitaEm)
        const alerta = dias === null || dias >= DIAS_DE_ALERTA_DA_VISITA
        return (
          <li key={e.id}>
            <article
              aria-label={e.nome}
              className="flex flex-col rounded-lg border border-border bg-surface"
            >
              <button
                type="button"
                onClick={() => aoAbrir(e.id)}
                className="flex cursor-pointer flex-col gap-2 border-0 bg-transparent px-3.5 pt-3.5 pb-3 text-left text-inherit"
              >
                <span className="flex items-start gap-2">
                  <span className="flex-1 text-base leading-[22px] font-semibold">{e.nome}</span>
                  <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <TagsDaEmpresa tags={e.tags} />
                <span className="flex flex-col gap-0.5 text-sm leading-5 text-ink-muted">
                  {e.cidade ? (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} strokeWidth={1.75} aria-hidden="true" />
                      {e.cidade.nome}/{e.cidade.uf}
                    </span>
                  ) : null}
                  <span className={cn('flex items-center gap-1.5', alerta && 'text-warning')}>
                    <Clock size={14} strokeWidth={1.75} aria-hidden="true" />
                    {dias === null
                      ? 'Nunca visitada'
                      : `Última visita ${tempoRelativo(dias)} (${dataCurta(e.ultimaVisitaEm)})`}
                  </span>
                  <ProximaAtividade iso={e.proximaAtividadeEm} />
                </span>
              </button>
              <div className="grid grid-cols-3 border-t border-border">
                <AcaoDoCartao
                  icone={<Phone size={18} strokeWidth={1.75} aria-hidden="true" />}
                  rotulo="Ligar"
                  cor="text-tag-blue-fg"
                  href={e.telefone ? linkDeLigacao(e.telefone) : null}
                />
                <AcaoDoCartao
                  icone={<MessageCircle size={18} strokeWidth={1.75} aria-hidden="true" />}
                  rotulo="WhatsApp"
                  cor="text-tag-green-fg"
                  href={e.telefone ? linkDoWhatsapp(e.telefone) : null}
                />
                <AcaoDoCartao
                  icone={<Navigation size={18} strokeWidth={1.75} aria-hidden="true" />}
                  rotulo="Rota"
                  cor="text-tag-orange-fg"
                  href={e.enderecoParaRota ? linkDeRota(e.enderecoParaRota) : null}
                  ultima
                />
              </div>
            </article>
          </li>
        )
      })}
    </ul>
  )
}
