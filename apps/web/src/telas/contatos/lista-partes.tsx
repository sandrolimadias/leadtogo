import type { ItemDaListaDeContatos } from '@leadtogo/api-client'
import { linkDeLigacao, linkDoWhatsapp } from '@leadtogo/shared'
import { ChevronRight, Mail, MessageCircle, Phone, Star } from 'lucide-react'

import { Avatar, Badge } from '@/components/ui/exibicao'
import { cn } from '@/lib/cn'

import { AcaoDoCartao } from '../empresas/lista-partes'
import { telefoneParaTela } from './formatos'

// `sticky`: o cabeçalho das colunas fica no topo da área que rola (docs/design_system.md, "Layout e rolagem")
const cabecalho =
  'sticky top-0 z-10 h-9 border-b border-border bg-surface-sunken px-3 text-left text-xs font-semibold text-ink-muted'
const celula = 'border-b border-border px-3 py-2 align-top'

type Vinculo = ItemDaListaDeContatos['empresas'][number]

/** O nome da empresa, com a estrela do contato principal; vínculo inativo aparece apagado e riscado. */
function EmpresaDoVinculo({ v }: { v: Vinculo }) {
  return (
    <span className={cn('flex items-center gap-1.5', !v.ativo && 'text-ink-muted')}>
      <span className={cn(!v.ativo && 'line-through')}>{v.nome}</span>
      {v.principal ? (
        <span className="flex text-warning" title="Contato principal">
          <Star size={13} strokeWidth={1.75} fill="currentColor" aria-label="Contato principal" />
        </span>
      ) : null}
      {v.ativo ? null : <span className="text-xs">(inativo)</span>}
    </span>
  )
}

const NaoQuerContato = () => (
  <Badge tone="warning" className="w-fit">
    Não quer contato
  </Badge>
)

/** Tabela do desktop e do tablet. As células quebram linha: sem rolagem horizontal. */
export function TabelaDeContatos({
  itens,
  aoAbrir,
}: {
  itens: ItemDaListaDeContatos[]
  aoAbrir: (id: string) => void
}) {
  return (
    <div>
      <table className="w-full border-collapse text-sm leading-5">
        <thead className="bg-surface-sunken">
          <tr>
            <th className={cabecalho}>Contato</th>
            <th className={cabecalho}>Empresas</th>
            <th className={cabecalho}>Cargo</th>
            <th className={cabecalho}>Telefone</th>
            <th className={cabecalho}>E-mail</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((c) => (
            <tr key={c.id} className="hover:bg-surface-hover">
              <td className={celula}>
                <button
                  type="button"
                  onClick={() => aoAbrir(c.id)}
                  className="flex cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left text-inherit"
                >
                  <Avatar name={c.nome} />
                  <span className="flex flex-col items-start gap-0.5">
                    <span className="font-semibold">{c.nome}</span>
                    {c.papelDecisao ? (
                      <span className="text-xs leading-4 text-ink-muted">
                        {c.papelDecisao.nome}
                      </span>
                    ) : null}
                    {c.naoQuerContato ? <NaoQuerContato /> : null}
                  </span>
                </button>
              </td>
              <td className={celula}>
                <div className="flex flex-col gap-0.5">
                  {c.empresas.length === 0 ? (
                    <span className="text-ink-muted">Sem empresa</span>
                  ) : (
                    c.empresas.map((v) => <EmpresaDoVinculo key={v.id} v={v} />)
                  )}
                </div>
              </td>
              <td className={celula}>
                <div className="flex flex-col gap-0.5">
                  {c.empresas.length === 0
                    ? '—'
                    : c.empresas.map((v) => (
                        <span key={v.id} className={cn(!v.ativo && 'text-ink-muted')}>
                          {v.cargo ?? '—'}
                        </span>
                      ))}
                </div>
              </td>
              <td className={cn(celula, 'tabular-nums')}>
                {c.telefone ? (
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {telefoneParaTela(c.telefone)}
                    {c.temWhatsapp ? (
                      <span className="flex text-tag-green-fg" title="Tem WhatsApp">
                        <MessageCircle size={14} strokeWidth={1.75} aria-label="Tem WhatsApp" />
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-ink-muted">—</span>
                )}
              </td>
              <td className={cn(celula, '[overflow-wrap:anywhere]')}>
                {c.email ?? <span className="text-ink-muted">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Cartões do celular, com Ligar, WhatsApp e E-mail. */
export function CartoesDeContatos({
  itens,
  aoAbrir,
}: {
  itens: ItemDaListaDeContatos[]
  aoAbrir: (id: string) => void
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {itens.map((c) => {
        const principal = c.empresas.find((v) => v.ativo) ?? c.empresas[0]
        const outras = c.empresas.length - 1
        return (
          <li key={c.id}>
            <article
              aria-label={c.nome}
              className="flex flex-col rounded-lg border border-border bg-surface"
            >
              <button
                type="button"
                onClick={() => aoAbrir(c.id)}
                className="flex cursor-pointer items-start gap-3 border-0 bg-transparent p-3.5 text-left text-inherit"
              >
                <Avatar name={c.nome} size="lg" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-base leading-[22px] font-semibold">{c.nome}</span>
                  <span className="text-sm text-ink-muted">
                    {principal
                      ? [principal.cargo, principal.nome].filter(Boolean).join(' · ')
                      : 'Sem empresa'}
                  </span>
                  {outras > 0 ? (
                    <span className="text-[13px] text-ink-muted">
                      {outras === 1 ? '+ 1 outra empresa' : `+ ${outras} outras empresas`}
                    </span>
                  ) : null}
                  {c.naoQuerContato ? <NaoQuerContato /> : null}
                </span>
                <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <div className="grid grid-cols-3 border-t border-border">
                <AcaoDoCartao
                  icone={<Phone size={18} strokeWidth={1.75} aria-hidden="true" />}
                  rotulo="Ligar"
                  cor="text-tag-blue-fg"
                  href={c.telefone ? linkDeLigacao(c.telefone) : null}
                />
                <AcaoDoCartao
                  icone={<MessageCircle size={18} strokeWidth={1.75} aria-hidden="true" />}
                  rotulo="WhatsApp"
                  cor="text-tag-green-fg"
                  href={c.telefone ? linkDoWhatsapp(c.telefone) : null}
                />
                <AcaoDoCartao
                  icone={<Mail size={18} strokeWidth={1.75} aria-hidden="true" />}
                  rotulo="E-mail"
                  cor="text-tag-orange-fg"
                  href={c.email ? `mailto:${c.email}` : null}
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
