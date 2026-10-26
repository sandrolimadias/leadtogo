import type { EmpresaCarteira } from '@leadtogo/api-client'
import { RAIO_DE_INCERTEZA_M } from '@leadtogo/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { MapPin, Pencil, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Alert } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'
import { Cartao } from '@/telas/empresas/ficha-resumo'
import { dataCurta } from '@/telas/empresas/formatos'

import { AjustarPosicao } from './ajustar-posicao'
import { distanciaCurta, rotuloDaAproximacao, rotuloDaOrigem, textoDasFaltas } from './rotulos'
import { SeloDePosicao } from './selo'

/**
 * O cartão "Localização" da ficha: o selo de precisão com a origem, o que falta quando o endereço está
 * incompleto, o aviso de "o endereço mudou depois do ajuste" e as ações (ajustar o pin, geocodificar de novo).
 */
export function CartaoDaPosicao({ empresa: e }: { empresa: EmpresaCarteira }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const p = e.posicao
  const [ajustando, setAjustando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string>()
  const [ocupado, setOcupado] = useState(false)

  const atualizar = () => queryClient.invalidateQueries({ queryKey: ['carteira'] })
  const noExterior = e.endereco.paisCodigo !== null

  async function confirmarAjuste(latitude: number, longitude: number) {
    setSalvando(true)
    setErro(undefined)
    const r = await servicos.geolocalizacao.posicao.ajustar(e.id, { latitude, longitude })
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    setAjustando(false)
    toast.success('Posição ajustada.')
    await atualizar()
  }

  async function resolverMudanca(acao: 'manter_posicao' | 'refazer') {
    setOcupado(true)
    const r = await servicos.geolocalizacao.posicao.confirmarEndereco(e.id, { acao })
    setOcupado(false)
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      return
    }
    toast.success(acao === 'refazer' ? 'Vou procurar o endereço novo.' : 'Posição mantida.')
    await atualizar()
  }

  async function geocodificarDeNovo() {
    setOcupado(true)
    const r = await servicos.geolocalizacao.posicao.geocodificarDeNovo(e.id)
    setOcupado(false)
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      return
    }
    toast.success('Vou procurar o endereço de novo. Atualize a ficha em alguns instantes.')
    await atualizar()
  }

  if (noExterior) {
    return (
      <Cartao titulo="Localização">
        <p className="m-0 text-sm text-ink-muted">Empresa no exterior: não aparece no mapa.</p>
      </Cartao>
    )
  }

  return (
    <Cartao
      titulo="Localização"
      direita={
        e.permissoes.editar ? (
          <div className="flex flex-wrap gap-2">
            {!p.ajusteManual && p.estado !== 'sem_coordenada' ? (
              <Button
                variant="ghost"
                size="sm"
                icon={RefreshCw}
                loading={ocupado}
                onClick={() => void geocodificarDeNovo()}
              >
                Procurar de novo
              </Button>
            ) : null}
            <Button size="sm" icon={MapPin} onClick={() => setAjustando(true)}>
              Ajustar posição
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SeloDePosicao posicao={p} />
          {p.origem ? (
            <span className="text-[13px] text-ink-muted">{rotuloDaOrigem(p.origem)}</span>
          ) : null}
        </div>

        {p.estado === 'exata' || p.estado === 'aproximada' ? (
          <p className="m-0 text-sm [text-wrap:pretty]">
            {p.estado === 'exata'
              ? `O ponto está a cerca de ${distanciaCurta(p.raioM ?? RAIO_DE_INCERTEZA_M.exata)} da porta.`
              : `A posição é aproximada (${rotuloDaAproximacao(p.aproximacao)}): pode estar a até ${distanciaCurta(p.raioM ?? RAIO_DE_INCERTEZA_M.rua)} da porta. Ajuste o pin para melhorar.`}
            {p.atualizadoEm ? (
              <span className="text-ink-muted"> Atualizada em {dataCurta(p.atualizadoEm)}.</span>
            ) : null}
          </p>
        ) : null}

        {p.estado === 'sem_coordenada' ? (
          <p className="m-0 text-sm text-ink-muted">
            A empresa ainda não tem posição no mapa. Ela é procurada sozinha quando o endereço é
            salvo; você também pode marcar o ponto à mão.
          </p>
        ) : null}

        {p.estado === 'a_confirmar' ? (
          <Alert
            tone="warning"
            title="Falta confirmar o endereço"
            actions={
              e.permissoes.editar ? (
                <Link
                  to="/empresas/$empresaId/editar"
                  params={{ empresaId: e.id }}
                  className="inline-flex items-center gap-1 text-sm font-semibold"
                >
                  <Pencil size={14} aria-hidden="true" /> Editar endereço
                </Link>
              ) : undefined
            }
          >
            {textoDasFaltas(p.faltas) || 'Não achei esse endereço.'} Completando o endereço (ou
            marcando o ponto no mapa) a empresa entra no mapa.
          </Alert>
        ) : null}

        {p.enderecoMudouDepoisDoAjuste ? (
          <Alert
            tone="info"
            title="O endereço mudou depois do ajuste"
            actions={
              e.permissoes.editar ? (
                <>
                  <Button
                    size="sm"
                    loading={ocupado}
                    onClick={() => void resolverMudanca('manter_posicao')}
                  >
                    Manter a posição
                  </Button>
                  <Button
                    size="sm"
                    loading={ocupado}
                    onClick={() => void resolverMudanca('refazer')}
                  >
                    Procurar o endereço novo
                  </Button>
                </>
              ) : undefined
            }
          >
            A posição que você marcou foi preservada. Quer manter ou procurar de novo?
          </Alert>
        ) : null}
      </div>

      {ajustando ? (
        <AjustarPosicao
          aberto
          aoFechar={() => {
            setAjustando(false)
            setErro(undefined)
          }}
          nomeDaEmpresa={e.nome}
          posicao={p}
          salvando={salvando}
          erro={erro}
          aoConfirmar={(la, lo) => void confirmarAjuste(la, lo)}
        />
      ) : null}
    </Cartao>
  )
}
