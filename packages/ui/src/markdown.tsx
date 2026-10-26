import { Fragment, type ReactNode } from 'react'

import { cn } from './cn'
import { blocosDoMarkdown } from './markdown-blocos'

// Markdown RESTRITO das publicações do portal: negrito, itálico, links, listas, subtítulos e parágrafos. Nunca
// vira HTML: tudo sai como elementos do React (texto escapado), então `<script>` ou `<b>` digitados aparecem
// como texto. Só abre link http(s) e mailto.

const INLINE =
  /(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_|\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^\s)]+\))/g
const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/

/** Negrito, itálico e links dentro de uma linha; o resto é texto. */
function inlineDoMarkdown(texto: string): ReactNode[] {
  return texto.split(INLINE).map((parte, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{parte}</Fragment>
    if (parte.startsWith('**')) return <strong key={i}>{parte.slice(2, -2)}</strong>
    const link = LINK.exec(parte)
    if (link) {
      return (
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand underline underline-offset-2"
        >
          {link[1]}
        </a>
      )
    }
    return <em key={i}>{parte.slice(1, -1)}</em>
  })
}

function Linhas({ linhas }: { linhas: string[] }) {
  return (
    <>
      {linhas.map((linha, i) => (
        <Fragment key={i}>
          {i > 0 ? <br /> : null}
          {inlineDoMarkdown(linha)}
        </Fragment>
      ))}
    </>
  )
}

/** Renderiza o Markdown restrito das publicações. */
export function Markdown({ texto, className }: { texto: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 text-sm leading-6 break-words', className)}>
      {blocosDoMarkdown(texto).map((b, i) => {
        if (b.tipo === 'subtitulo') {
          return (
            <h3 key={i} className="m-0 mt-1 text-[15px] leading-6 font-semibold">
              {inlineDoMarkdown(b.texto)}
            </h3>
          )
        }
        if (b.tipo === 'lista') {
          const Lista = b.ordenada ? 'ol' : 'ul'
          return (
            <Lista
              key={i}
              className={cn(
                'm-0 flex flex-col gap-1 pl-5',
                b.ordenada ? 'list-decimal' : 'list-disc',
              )}
            >
              {b.itens.map((item, j) => (
                <li key={j}>{inlineDoMarkdown(item)}</li>
              ))}
            </Lista>
          )
        }
        return (
          <p key={i} className="m-0">
            <Linhas linhas={b.linhas} />
          </p>
        )
      })}
    </div>
  )
}
