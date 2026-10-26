import { MAX_EMPRESAS_OFFLINE } from '@leadtogo/shared'
import { CloudDownload } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { toast } from '@leadtogo/ui/toast'
import { guardarEmpresas } from '@/lib/offline/visitas'

/**
 * "Levar para offline" (G3b): guarda no aparelho, cifrado e por 7 dias, o mínimo das empresas da lista
 * (até 300 por vez) para fazer check-in e relatório sem sinal.
 */
export function BotaoLevarParaOffline({ empresaIds }: { empresaIds: string[] }) {
  const servicos = useServicos()
  const [levando, setLevando] = useState(false)
  const demais = empresaIds.length > MAX_EMPRESAS_OFFLINE
  const levar = async () => {
    setLevando(true)
    const r = await servicos.visitas.campo.offline(empresaIds.slice(0, MAX_EMPRESAS_OFFLINE))
    if (!r.ok) {
      setLevando(false)
      toast.error('Não foi possível levar para o offline', { description: r.erro.mensagem })
      return
    }
    try {
      await guardarEmpresas(r.dados.empresas)
      toast.success(
        `${r.dados.empresas.length} ${r.dados.empresas.length === 1 ? 'empresa guardada' : 'empresas guardadas'} no aparelho`,
        {
          description: `Valem por 7 dias.${r.dados.ignoradas ? ` ${r.dados.ignoradas} fora da sua carteira ficaram de fora.` : ''}`,
        },
      )
    } catch {
      toast.error('Este navegador não deixou guardar os dados no aparelho.')
    } finally {
      setLevando(false)
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" icon={CloudDownload} loading={levando} onClick={() => void levar()}>
        Levar para offline
      </Button>
      {demais ? (
        <span className="text-xs text-ink-muted">
          Vão as {MAX_EMPRESAS_OFFLINE} primeiras (o limite por vez).
        </span>
      ) : null}
    </div>
  )
}
