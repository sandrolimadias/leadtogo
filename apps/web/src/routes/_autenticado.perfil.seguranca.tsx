import { createFileRoute } from '@tanstack/react-router'

import { TelaDeSeguranca } from '@/telas/perfil/seguranca'

// Meu perfil → Segurança. No E9c vira a folha de perfil da casca; até lá é uma página simples.
export const Route = createFileRoute('/_autenticado/perfil/seguranca')({
  component: () => (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-5 p-6">
      <TelaDeSeguranca />
    </main>
  ),
})
