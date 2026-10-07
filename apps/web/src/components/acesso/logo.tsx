import marcaEscura from '@/styles/assets/logos/leadtogo-mark-dark.svg'
import marcaClara from '@/styles/assets/logos/leadtogo-mark.svg'

/** Marca do Leadtogo; no tema escuro troca para a versão escura (ver globals.css). */
export function Logo({ tamanho = 32 }: { tamanho?: number }) {
  return (
    <>
      <img src={marcaClara} alt="" width={tamanho} height={tamanho} className="logo-claro" />
      <img src={marcaEscura} alt="" width={tamanho} height={tamanho} className="logo-escuro" />
    </>
  )
}
