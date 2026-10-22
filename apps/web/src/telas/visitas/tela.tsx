import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { ConteudoDaAba, Tabs } from '@/components/ui/tabs'
import { CabecalhoDeSecao, Carregamento } from '@/telas/cadastros/base'

import { AbaDoCheckin } from './checkin'
import { chaveDosModelos } from './consultas'
import { AbaDeModelos } from './modelos'
import { AbaDeResultados } from './resultados'

const ABAS = [
  { value: 'resultados', label: 'Resultados' },
  { value: 'modelos', label: 'Modelos' },
  { value: 'checkin', label: 'Check-in' },
]

/**
 * Configurações → Visitas (G3a): os resultados da visita, os modelos do relatório (construtor com
 * prévia) e o check-in. Quem chega aqui tem `cadastros.gerir`.
 */
export function TelaDeVisitas() {
  const servicos = useServicos()
  const [aba, setAba] = useState('resultados')
  const modelos = useQuery({
    queryKey: chaveDosModelos,
    retry: false,
    queryFn: async () => {
      const r = await servicos.visitas.modelos.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const cabecalho = (
    <CabecalhoDeSecao
      titulo="Visitas"
      descricao="Resultados e relatório da visita, e como o check-in trata a distância até a empresa."
    />
  )
  return (
    <div className="flex flex-col gap-4">
      {cabecalho}
      <Tabs items={ABAS} value={aba} onChange={setAba} label="Seções das visitas">
        <ConteudoDaAba value="resultados" className="pt-4">
          <Carregamento consulta={modelos} rotulo="os modelos do relatório" cabecalho={null}>
            <AbaDeResultados modelos={modelos.data ?? []} />
          </Carregamento>
        </ConteudoDaAba>
        <ConteudoDaAba value="modelos" className="pt-4">
          <Carregamento consulta={modelos} rotulo="os modelos do relatório" cabecalho={null}>
            <AbaDeModelos modelos={modelos.data ?? []} />
          </Carregamento>
        </ConteudoDaAba>
        <ConteudoDaAba value="checkin" className="pt-4">
          <AbaDoCheckin />
        </ConteudoDaAba>
      </Tabs>
    </div>
  )
}
