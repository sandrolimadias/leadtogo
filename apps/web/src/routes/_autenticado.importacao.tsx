import { createFileRoute, Outlet } from '@tanstack/react-router'

// Importação de planilha: enviar (/importacao/nova) e o assistente de um lote (/importacao/:loteId).
export const Route = createFileRoute('/_autenticado/importacao')({
  component: Outlet,
})
