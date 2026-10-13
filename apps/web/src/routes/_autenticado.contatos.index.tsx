import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus, Users } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_autenticado/contatos/')({
  component: function Contatos() {
    const navegar = useNavigate()
    return (
      <PaginaVazia
        titulo="Contatos"
        icone={Users}
        descricao="A lista de contatos está em construção. Já dá para cadastrar e editar contatos."
        acao={
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => void navegar({ to: '/contatos/novo' })}
          >
            Novo contato
          </Button>
        }
      />
    )
  },
})
