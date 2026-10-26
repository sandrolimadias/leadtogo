import type { RelatorioDeVisita } from '@leadtogo/api-client'
import type { CampoDeVisita, ContatoDaResposta, ProximoPassoDaResposta } from '@leadtogo/shared'
import { CloudOff, MapPin, MapPinOff, TriangleAlert } from 'lucide-react'

import { Badge } from '@leadtogo/ui/exibicao'

const dataEHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/** Os selos que contam como foi a visita: sem check-in, fora do limite, offline e (para quem pode) a distância. */
export function SelosDaVisita({ relatorio: r }: { relatorio: RelatorioDeVisita }) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Como foi a visita">
      <Badge tone={r.situacao === 'concluido' ? 'success' : 'warning'}>
        {r.situacao === 'concluido' ? 'Concluído' : 'Relatório pendente'}
      </Badge>
      {r.semCheckin ? (
        <Badge tone="warning" icon={MapPinOff}>
          Sem check-in
        </Badge>
      ) : (
        <Badge tone="neutral" icon={MapPin}>
          Check-in {r.checkinEm ? dataEHora(r.checkinEm) : ''}
        </Badge>
      )}
      {r.foraDoLimite && r.localizacaoVisivel ? (
        <Badge tone="danger" icon={TriangleAlert}>
          Fora do limite
        </Badge>
      ) : null}
      {r.checkinOffline ? (
        <Badge tone="outline" icon={CloudOff}>
          Feito sem sinal
        </Badge>
      ) : null}
      {r.localizacaoVisivel && r.distanciaM !== null ? (
        <span className="text-xs text-ink-muted">
          A {r.distanciaM.toLocaleString('pt-BR')} m da empresa
          {r.posicao ? (
            <>
              {' · '}
              <a
                href={`https://www.openstreetmap.org/?mlat=${r.posicao.latitude}&mlon=${r.posicao.longitude}#map=18/${r.posicao.latitude}/${r.posicao.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="text-brand"
              >
                ver posição
              </a>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}

/** O valor de uma resposta como texto, pelo tipo do campo da época. */
function valorComoTexto(campo: CampoDeVisita | undefined, valor: unknown): string {
  if (!campo) return typeof valor === 'string' ? valor : JSON.stringify(valor)
  switch (campo.tipo) {
    case 'sim_nao':
    case 'tag':
      return valor === true ? 'Sim' : 'Não'
    case 'escolha_unica':
      return campo.opcoes.find((o) => o.id === valor)?.rotulo ?? '—'
    case 'multipla_escolha':
      return (valor as string[])
        .map((id) => campo.opcoes.find((o) => o.id === id)?.rotulo)
        .filter(Boolean)
        .join(', ')
    case 'nota':
      return `${String(valor)} de 5`
    case 'data':
      return new Date(`${String(valor)}T12:00:00`).toLocaleDateString('pt-BR')
    case 'contato': {
      const c = valor as ContatoDaResposta
      return 'novo' in c ? c.novo.nome : 'Contato confirmado'
    }
    case 'proximo_passo': {
      const p = valor as ProximoPassoDaResposta
      return `${p.titulo} (${dataEHora(p.data)})`
    }
    default:
      return String(valor)
  }
}

/** O relatório concluído, só leitura, com os rótulos da época. */
export function VisaoDoRelatorio({ relatorio: r }: { relatorio: RelatorioDeVisita }) {
  const campos = (r.modeloVersao?.campos ?? []) as CampoDeVisita[]
  return (
    <dl className="m-0 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-0.5">
        <dt className="text-[13px] font-semibold text-ink-muted">Resultado</dt>
        <dd className="m-0 text-sm">{r.resultado?.nome ?? '—'}</dd>
      </div>
      {r.respostas.map((x) => (
        <div key={x.campoId} className="flex flex-col gap-0.5">
          <dt className="text-[13px] font-semibold text-ink-muted">{x.rotulo}</dt>
          <dd className="m-0 text-sm whitespace-pre-wrap">
            {valorComoTexto(
              campos.find((c) => c.id === x.campoId),
              x.valor,
            )}
          </dd>
        </div>
      ))}
      <div className="flex flex-col gap-0.5">
        <dt className="text-[13px] font-semibold text-ink-muted">Responsável</dt>
        <dd className="m-0 text-sm">
          {r.responsavel.nome}
          {r.concluidoEm ? ` · concluído em ${dataEHora(r.concluidoEm)}` : ''}
        </dd>
      </div>
    </dl>
  )
}
