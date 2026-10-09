import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe, exigirAplicativo } from '@/auth/guardas'
import { Casca } from '@/casca/casca'
import { identificarSessao } from '@/observabilidade/erros'

// Tudo o que fica atrás do login, dentro da casca do app. Quem ainda não ativou o 2FA onde a regra exige
// é desviado para a ativação (a casca fica bloqueada até ativar).
export const Route = createFileRoute('/_autenticado')({
  beforeLoad: async ({ context, location }) => ({
    me: await exigirAplicativo(context, location.href),
  }),
  component: function Autenticado() {
    const { me: inicial } = Route.useRouteContext()
    const servicos = useServicos()
    const navegar = useNavigate()
    // o guarda já buscou a sessão; aqui ela só é mantida em dia (troca de empresa, 2FA...)
    const sessao = useQuery({ queryKey: chaveDoMe, queryFn: servicos.me, initialData: inicial })
    const me = sessao.data
    // os eventos de erro levam só o id do usuário e o da empresa ativa (tags)
    const usuarioId = me?.usuario.id
    const empresaId = me?.empresaAtivaId
    useEffect(() => {
      identificarSessao({ ...(usuarioId ? { usuarioId } : {}), empresaId: empresaId ?? null })
    }, [usuarioId, empresaId])
    useEffect(() => {
      if (me === null) void navegar({ to: '/login', search: { redirect: undefined } })
    }, [me, navegar])
    if (!me) return null
    return (
      <Casca me={me}>
        <Outlet />
      </Casca>
    )
  },
})
