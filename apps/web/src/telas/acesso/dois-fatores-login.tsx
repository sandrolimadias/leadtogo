import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe, destinoSeguro } from '@/auth/guardas'
import { CampoDeCodigo } from '@/components/acesso/campo-de-codigo'
import { Cabecalho } from '@/components/acesso/layout'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Checkbox } from '@leadtogo/ui/checkbox'

import { classeDoLink, classeDoLinkSuave, focarCampo, useEnvio } from './comum'

/** Segundo passo do login: código do app autenticador (6 dígitos) ou código de recuperação. */
export function TelaDeVerificacao({ redirect }: { redirect?: string | undefined }) {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const [recuperacao, setRecuperacao] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [codigoDeRecuperacao, setCodigoDeRecuperacao] = useState('')
  const [confiar, setConfiar] = useState(true)
  const [erro, setErro] = useState<string | undefined>()
  const [venceu, setVenceu] = useState(false)

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const valor = recuperacao ? codigoDeRecuperacao.trim() : codigo
    if (recuperacao ? valor.length < 4 : valor.length < 6) {
      setErro(recuperacao ? 'Digite o código de recuperação.' : 'Digite os 6 números do código.')
      if (recuperacao) focarCampo('codigo-de-recuperacao')
      return
    }
    void executar(async () => {
      const r = recuperacao
        ? await servicos.verificarCodigoDeRecuperacao(valor, confiar)
        : await servicos.verificarCodigo(valor, confiar)
      if (!r.ok) {
        if (r.erro.codigo === 'INVALID_TWO_FACTOR_COOKIE') setVenceu(true)
        setErro(r.erro.mensagem)
        return
      }
      await queryClient.invalidateQueries({ queryKey: chaveDoMe })
      await navegar({ to: destinoSeguro(redirect) })
    })
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
      <Cabecalho
        titulo="Verificação em duas etapas"
        descricao={
          recuperacao
            ? 'Digite um dos códigos de recuperação que você guardou ao ativar a verificação.'
            : 'Digite o código de 6 números do seu app autenticador.'
        }
      />
      {recuperacao ? (
        <TextField
          id="codigo-de-recuperacao"
          label="Código de recuperação"
          mono
          autoFocus
          autoComplete="off"
          value={codigoDeRecuperacao}
          onChange={(e) => {
            setCodigoDeRecuperacao(e.target.value)
            setErro(undefined)
          }}
          error={erro}
        />
      ) : (
        <CampoDeCodigo
          valor={codigo}
          onChange={(c) => {
            setCodigo(c)
            setErro(undefined)
          }}
          erro={erro}
        />
      )}
      <Checkbox
        label="Confiar neste aparelho por 30 dias"
        checked={confiar}
        onChange={(e) => setConfiar(e.target.checked)}
      />
      <Button type="submit" variant="primary" block size="lg" loading={enviando}>
        Verificar
      </Button>
      <div className="flex flex-wrap justify-between gap-3 text-[13px]">
        <button
          type="button"
          className={`cursor-pointer border-0 bg-transparent p-0 ${classeDoLink}`}
          onClick={() => {
            setRecuperacao((r) => !r)
            setErro(undefined)
          }}
        >
          {recuperacao ? 'Usar o app autenticador' : 'Usar código de recuperação'}
        </button>
        <Link to="/login" search={{ redirect }} className={classeDoLinkSuave}>
          {venceu ? 'Entrar de novo' : 'Voltar ao login'}
        </Link>
      </div>
    </form>
  )
}
