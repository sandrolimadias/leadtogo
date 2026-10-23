import type { TagGrupo } from '@leadtogo/api-client'
import { ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Menu, type ItemDeMenu } from '@/components/ui/menu'
import { BotaoAdicionarARota } from '@/telas/rotas/adicionar-da-lista'
import { BotaoLevarParaOffline } from '@/telas/visitas/campo/offline'

/** As tags que se aplicam à mão: dos grupos ativos que não são do sistema (a Visitação, não). */
function itensDoMenu(
  grupos: TagGrupo[],
  aplicar: (tagId: string, nome: string) => void,
): ItemDeMenu[] {
  const itens: ItemDeMenu[] = []
  for (const g of grupos.filter((x) => x.ativo && !x.automatico)) {
    const tags = g.tags.filter((t) => t.ativo)
    if (tags.length === 0) continue
    itens.push({ heading: g.selecao === 'unica' ? `${g.nome} (substitui a atual)` : g.nome })
    for (const t of tags) itens.push({ label: t.nome, onSelect: () => aplicar(t.id, t.nome) })
  }
  return itens
}

/**
 * Barra que aparece quando há empresas marcadas na lista: quantas, "Aplicar tag" (Status substitui o
 * atual; as de seleção múltipla se somam), "Levar para offline", "Adicionar à rota" (G4) e "Limpar seleção".
 */
export function BarraDeAcoesEmMassa({
  empresaIds,
  quantidade,
  grupos,
  ocupado,
  aoAplicar,
  aoLimpar,
}: {
  /** As marcadas: "Levar para offline" (G3b) */
  empresaIds: string[]
  quantidade: number
  grupos: TagGrupo[]
  ocupado: boolean
  aoAplicar: (tagId: string, nome: string) => void
  aoLimpar: () => void
}) {
  return (
    <section
      aria-label="Ações em massa"
      data-density="compact"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-brand bg-surface-selected px-3 py-2"
    >
      <span className="mr-2 font-semibold" aria-live="polite">
        {quantidade === 1 ? '1 selecionada' : `${quantidade} selecionadas`}
      </span>
      <Menu
        items={itensDoMenu(grupos, aoAplicar)}
        trigger={
          <Button size="sm" iconRight={ChevronDown} disabled={ocupado}>
            Aplicar tag
          </Button>
        }
      />
      <BotaoLevarParaOffline empresaIds={empresaIds} />
      <BotaoAdicionarARota empresaIds={empresaIds} />
      <span className="flex-1" />
      <Button variant="ghost" size="sm" onClick={aoLimpar} disabled={ocupado}>
        Limpar seleção
      </Button>
    </section>
  )
}
