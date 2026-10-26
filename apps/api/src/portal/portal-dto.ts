import type { SessaoDoPortal } from '@leadtogo/shared'

import type { ContextoDoPortal } from './portal.tipos.js'

/** O que o portal recebe sobre a sessão (lista de permissão: nada além disto sai). */
export const sessaoDoPortalDe = (p: ContextoDoPortal): SessaoDoPortal => ({
  acessoId: p.acessoId,
  contato: { id: p.contatoId, nome: p.nome, email: p.email },
  empresaCliente: { id: p.empresaId, nome: p.empresaNome },
  papel: p.papel,
  nomeDoPortal: p.nomeDoPortal,
  logoUrl: null,
  segundoFatorAtivo: p.segundoFatorAtivo,
  segundoFatorExigido: p.segundoFatorExigido,
  segundoFatorPendente: p.segundoFatorPendente,
})
