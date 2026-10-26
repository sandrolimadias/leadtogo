import type { ConfiguracaoDeVisitas } from '@leadtogo/api-client'
import {
  configuracaoDeVisitasSchema,
  LIMITE_DO_CHECKIN_M,
  type ModoDeCheckin,
  ROTULO_DO_MODO_DE_CHECKIN,
} from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Alert } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'
import { cn } from '@leadtogo/ui/cn'
import { useEnvio } from '@/telas/acesso/comum'
import { CabecalhoDeSecao, Carregamento } from '@/telas/cadastros/base'

import { chaveDoCheckin } from './consultas'

const DESCRICAO_DO_MODO: Record<ModoDeCheckin, string> = {
  avisar: 'Mostra a distância até a empresa e deixa seguir, mesmo além do limite.',
  bloquear:
    'Não deixa fazer check-in além do limite. O vendedor pode registrar a visita depois, sem check-in.',
  so_gravar: 'Não avisa nada na hora; grava a distância para o gestor ver.',
}

/** Configurações → Visitas → Check-in: modo, limite e o horário do lembrete dos relatórios pendentes. */
export function AbaDoCheckin() {
  const servicos = useServicos()
  const consulta = useQuery({
    queryKey: chaveDoCheckin,
    retry: false,
    queryFn: async () => {
      const r = await servicos.visitas.configuracao()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const cabecalho = (
    <CabecalhoDeSecao
      titulo="Check-in"
      descricao="Como o sistema trata a distância entre o vendedor e a empresa no check-in, e quando lembra dos relatórios pendentes."
    />
  )

  return (
    <section aria-label="Check-in" className="flex flex-col gap-4">
      <Carregamento consulta={consulta} rotulo="a configuração do check-in" cabecalho={cabecalho}>
        {cabecalho}
        {consulta.data ? <FormularioDoCheckin inicial={consulta.data} /> : null}
      </Carregamento>
    </section>
  )
}

function FormularioDoCheckin({ inicial }: { inicial: ConfiguracaoDeVisitas }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const [estado, setEstado] = useState({
    modo: inicial.checkinModo,
    limite: String(inicial.checkinLimiteM),
    hora: inicial.lembreteRelatoriosHora,
  })
  const [erros, setErros] = useState<{ limite?: string; hora?: string; geral?: string }>({})

  const salvar = (e: FormEvent) => {
    e.preventDefault()
    const dados = {
      checkinModo: estado.modo,
      checkinLimiteM: Number(estado.limite),
      lembreteRelatoriosHora: estado.hora,
    }
    const v = configuracaoDeVisitasSchema.safeParse(dados)
    if (!v.success) {
      const porCampo = v.error.flatten().fieldErrors
      setErros({
        ...(porCampo.checkinLimiteM?.[0] ? { limite: porCampo.checkinLimiteM[0] } : {}),
        ...(porCampo.lembreteRelatoriosHora?.[0]
          ? { hora: porCampo.lembreteRelatoriosHora[0] }
          : {}),
      })
      return
    }
    setErros({})
    void executar(async () => {
      const r = await servicos.visitas.alterarConfiguracao(v.data)
      if (!r.ok) {
        setErros({ geral: r.erro.mensagem })
        return
      }
      queryClient.setQueryData(chaveDoCheckin, r.dados)
      toast.success('Check-in atualizado')
    })
  }

  return (
    <form
      noValidate
      onSubmit={salvar}
      className="flex max-w-[640px] flex-col gap-5 rounded-lg border border-border bg-surface p-4"
    >
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-[13px] leading-[18px] font-semibold">
          Quando o vendedor está longe da empresa
        </legend>
        {(Object.keys(ROTULO_DO_MODO_DE_CHECKIN) as ModoDeCheckin[]).map((modo) => (
          <label
            key={modo}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5',
              estado.modo === modo ? 'border-brand bg-brand-soft' : 'border-border',
            )}
          >
            <input
              type="radio"
              name="modo-checkin"
              value={modo}
              checked={estado.modo === modo}
              onChange={() => setEstado({ ...estado, modo })}
              className="mt-1 accent-(--brand)"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{ROTULO_DO_MODO_DE_CHECKIN[modo]}</span>
              <span className="text-[13px] text-ink-muted">{DESCRICAO_DO_MODO[modo]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <TextField
        id="checkin-limite"
        label="Limite de distância (metros)"
        hint={`De ${LIMITE_DO_CHECKIN_M.minimo} a ${LIMITE_DO_CHECKIN_M.maximo.toLocaleString('pt-BR')} m. Padrão: 300 m.`}
        inputMode="numeric"
        value={estado.limite}
        error={erros.limite}
        onChange={(e) => setEstado({ ...estado, limite: e.target.value.replace(/\D/g, '') })}
        className="max-w-[240px]"
      />
      <TextField
        id="checkin-lembrete"
        type="time"
        label="Lembrete dos relatórios pendentes"
        hint="No fuso da empresa. Aparece com o app aberto (notificação, se permitida) ou ao abrir o app depois desse horário."
        value={estado.hora}
        error={erros.hora}
        onChange={(e) => setEstado({ ...estado, hora: e.target.value })}
        className="max-w-[240px]"
      />
      {erros.geral ? (
        <Alert tone="danger" title="Não foi possível salvar">
          {erros.geral}
        </Alert>
      ) : null}
      <div>
        <Button type="submit" variant="primary" loading={enviando}>
          Salvar
        </Button>
      </div>
    </form>
  )
}
