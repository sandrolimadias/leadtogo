import type { SessaoDoPortal } from '@leadtogo/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { CHAVE_DA_SESSAO } from '@/app/guardas'
import { useServicos } from '@/servicos/contexto'

/**
 * Depois de entrar (código ou troca de empresa): guarda a sessão e decide a próxima tela. 2FA pendente vai à
 * verificação; quem acessa mais de uma empresa-cliente escolhe a empresa; os demais vão ao Início.
 */
export function useDepoisDeEntrar() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  return async (sessao: SessaoDoPortal) => {
    queryClient.setQueryData(CHAVE_DA_SESSAO, sessao)
    if (sessao.segundoFatorPendente) {
      await navegar({ to: '/verificacao' })
      return
    }
    const empresas = await servicos.empresas.listar()
    await navegar({ to: empresas.ok && empresas.dados.itens.length > 1 ? '/empresas' : '/' })
  }
}
