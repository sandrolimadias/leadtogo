import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_autenticado/')({
  component: function Inicio() {
    const servicos = useServicos()
    const navegar = useNavigate()
    const queryClient = useQueryClient()
    return (
      <main className="flex flex-col items-start gap-3 p-6">
        <h1 className="title-lg m-0">Leadtogo</h1>
        <p className="m-0 text-ink-muted">A casca do app chega no E9c.</p>
        <Link to="/perfil/seguranca" className="font-semibold text-brand hover:underline">
          Meu perfil → Segurança
        </Link>
        <Button
          onClick={() =>
            void servicos.sair().then(async () => {
              await queryClient.invalidateQueries({ queryKey: chaveDoMe })
              await navegar({ to: '/login', search: { redirect: undefined } })
            })
          }
        >
          Sair
        </Button>
      </main>
    )
  },
})
