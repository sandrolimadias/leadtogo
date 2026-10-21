import { atualizarAgora, useNovaVersao } from './atualizacao'

/**
 * Aviso discreto no rodapé: "Nova versão disponível · Atualizar". Só aparece quando o service worker novo
 * está esperando e só recarrega no clique, nunca sozinho (uma pessoa no meio de um formulário não perde nada).
 * No celular sobe acima da barra inferior.
 */
export function AvisoDeNovaVersao({ celular = false }: { celular?: boolean }) {
  const nova = useNovaVersao()
  if (!nova) return null
  return (
    <div
      role="status"
      className={`fixed inset-x-3 z-[1200] mx-auto flex w-fit max-w-[calc(100vw-24px)] items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink shadow-md ${celular ? 'bottom-[84px]' : 'bottom-4'}`}
    >
      <span>Nova versão disponível</span>
      <span aria-hidden="true" className="text-ink-subtle">
        ·
      </span>
      <button
        type="button"
        onClick={atualizarAgora}
        className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-brand underline"
      >
        Atualizar
      </button>
    </div>
  )
}
