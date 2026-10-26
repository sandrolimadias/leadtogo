import { MAXIMO_DE_EMPRESAS_NO_ALCANCE } from '@leadtogo/shared'
import { X } from 'lucide-react'
import { useState } from 'react'

import { BuscaDeEmpresa } from '../atividades/busca-de-empresa'

export type EmpresaDoAlcance = { id: string; nome: string }

/** As empresas-clientes do alcance (publicação ou documento): as escolhidas viram chips e a busca adiciona uma a uma. */
export function SelecaoDeEmpresas({
  empresas,
  aoMudar,
}: {
  empresas: EmpresaDoAlcance[]
  aoMudar: (empresas: EmpresaDoAlcance[]) => void
}) {
  const [chaveDaBusca, setChaveDaBusca] = useState(0)
  return (
    <div className="flex flex-col gap-2">
      {empresas.length > 0 ? (
        <ul aria-label="Empresas do alcance" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {empresas.map((e) => (
            <li
              key={e.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken py-0.5 pr-1 pl-3 text-[13px]"
            >
              {e.nome}
              <button
                type="button"
                aria-label={`Tirar ${e.nome}`}
                onClick={() => aoMudar(empresas.filter((x) => x.id !== e.id))}
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-muted hover:bg-surface-hover"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {empresas.length < MAXIMO_DE_EMPRESAS_NO_ALCANCE ? (
        <BuscaDeEmpresa
          key={chaveDaBusca}
          valor={null}
          obrigatoria={false}
          rotuloOpcional="adicione uma a uma"
          aoMudar={(e) => {
            if (!e) return
            aoMudar(empresas.some((x) => x.id === e.id) ? empresas : [...empresas, e])
            setChaveDaBusca((k) => k + 1)
          }}
        />
      ) : null}
    </div>
  )
}
