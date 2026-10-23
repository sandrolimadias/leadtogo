import { useState } from 'react'

import { Tabs } from '@/components/ui/tabs'

import { AreasDeAtendimento } from './areas-de-atendimento'
import { ExpedienteDosChamados } from './expediente'
import { TriagemDosChamados } from './triagem'

type Aba = 'areas' | 'triagem' | 'expediente'

/** Configurações → Chamados (`chamados.gerir_areas`): áreas e metas, triagem e expediente com feriados. */
export function TelaDeConfiguracoesDeChamados() {
  const [aba, setAba] = useState<Aba>('areas')
  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-xl font-semibold">Chamados</h2>
      <Tabs
        label="Configuração dos chamados"
        value={aba}
        onChange={(v) => setAba(v as Aba)}
        items={[
          { value: 'areas', label: 'Áreas' },
          { value: 'triagem', label: 'Triagem' },
          { value: 'expediente', label: 'Expediente e feriados' },
        ]}
      />
      {aba === 'areas' ? <AreasDeAtendimento /> : null}
      {aba === 'triagem' ? <TriagemDosChamados /> : null}
      {aba === 'expediente' ? <ExpedienteDosChamados /> : null}
    </div>
  )
}
