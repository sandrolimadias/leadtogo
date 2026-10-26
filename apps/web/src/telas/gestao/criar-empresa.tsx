import { cnpjValido } from '@leadtogo/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Alert } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'
import { focarCampo, useEnvio } from '@/telas/acesso/comum'

/**
 * Criar empresa do grupo (administrador da conta). Só a razão social é obrigatória; o CNPJ, se vier, é
 * validado. Ao criar, a pessoa já entra na empresa nova. O CNPJ repetido só vira aviso (nunca erro).
 */
export function TelaCriarEmpresa() {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const [razaoSocial, setRazaoSocial] = useState('')
  const [nomeFantasia, setNomeFantasia] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [tentou, setTentou] = useState(false)
  const [falha, setFalha] = useState<string | undefined>()

  const erroDaRazao =
    tentou && razaoSocial.trim().length < 2 ? 'Informe a razão social.' : undefined
  const erroDoCnpj =
    tentou && cnpj.trim() && !cnpjValido(cnpj) ? 'CNPJ inválido. Confira os números.' : undefined

  const criar = (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (razaoSocial.trim().length < 2) return focarCampo('ce-razao')
    if (cnpj.trim() && !cnpjValido(cnpj)) return focarCampo('ce-cnpj')
    setFalha(undefined)
    void executar(async () => {
      const r = await servicos.criarEmpresa({
        razaoSocial: razaoSocial.trim(),
        ...(nomeFantasia.trim() ? { nomeFantasia: nomeFantasia.trim() } : {}),
        ...(cnpj.trim() ? { cnpj: cnpj.trim() } : {}),
      })
      if (!r.ok) {
        setFalha(r.erro.mensagem)
        return
      }
      const { empresa, cnpjRepetidoNaConta } = r.dados
      const nome = empresa.nomeFantasia ?? empresa.razaoSocial
      const troca = await servicos.trocarEmpresa(empresa.id)
      await queryClient.invalidateQueries()
      if (troca.ok) {
        toast.success(`${nome} criada`, { description: 'Você já está na empresa nova.' })
      } else {
        // A empresa existe; só a troca falhou: a pessoa escolhe no seletor
        toast.warning(`${nome} criada`, {
          description: 'Escolha a empresa no seletor para entrar nela.',
        })
      }
      if (cnpjRepetidoNaConta) {
        toast.warning('CNPJ já usado na sua conta', {
          description: 'Outra empresa do seu grupo tem o mesmo CNPJ. Confira se não é duplicidade.',
        })
      }
      await queryClient.invalidateQueries({ queryKey: chaveDoMe })
      await navegar({ to: '/' })
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-5 p-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
        Voltar
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl leading-[30px] font-semibold">Criar empresa</h1>
        <p className="m-0 text-sm text-ink-muted">
          A nova empresa fica no seu grupo, com carteira, equipe e configurações próprias. Você
          entra nela como administrador.
        </p>
      </div>
      <form noValidate onSubmit={criar} className="flex flex-col gap-4">
        <TextField
          id="ce-razao"
          label="Razão social"
          required
          autoFocus
          autoComplete="organization"
          value={razaoSocial}
          onChange={(e) => setRazaoSocial(e.target.value)}
          error={erroDaRazao}
        />
        <TextField
          id="ce-fantasia"
          label="Nome de exibição"
          hint="Como a empresa aparece no seletor. Se vazio, usa a razão social."
          value={nomeFantasia}
          onChange={(e) => setNomeFantasia(e.target.value)}
        />
        <TextField
          id="ce-cnpj"
          label="CNPJ"
          mono
          placeholder="00.000.000/0000-00"
          hint="Opcional. Aceita o CNPJ alfanumérico."
          value={cnpj}
          onChange={(e) => setCnpj(e.target.value)}
          error={erroDoCnpj}
        />
        {falha ? (
          <Alert tone="danger" title="Não foi possível criar a empresa">
            {falha}
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Link to="/" className="contents">
            <Button variant="ghost" size="lg">
              Cancelar
            </Button>
          </Link>
          <Button type="submit" variant="primary" size="lg" loading={enviando}>
            Criar empresa
          </Button>
        </div>
      </form>
    </main>
  )
}
