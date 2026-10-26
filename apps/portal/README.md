# Portal do Cliente (`@leadtogo/portal`)

App estático (React + Vite) do cliente final das empresas que usam o Leadtogo. Fala só com `/v1/portal/*`; o CRM
(`apps/web`) fica em `/v1/*`. Plano e decisões: `docs/plano_portal_cliente.md`.

- **Acesso sem senha:** o cliente pede um link de entrada por e-mail (`/entrar`), o link abre `/acesso#<token>` e o botão
  **confirma** (o consumo é por `POST`, nunca ao carregar a página).
- **Cookie:** `__Host-portal` (produção) emitido pela API; `HttpOnly`, `SameSite=Lax`, sem `Domain`.
- **Telas (Fase 3A):** início, chamados (lista, abrir, detalhe com conversa e anexos, reabrir e avaliar), notificações com
  tempo real (SSE), perfil e empresa (nome, e-mail, pedido de acesso para colegas, 2FA e dispositivos).
- **Serviços:** `src/servicos` (interface `ServicosDoPortal`, implementação real e contexto); os testes usam serviços de
  mentira (`src/testes/fakes.tsx`), como o `apps/web`.

## Desenvolvimento

```
pnpm --filter @leadtogo/portal dev     # http://localhost:5174 (o proxy do Vite leva /v1 à API em :3000)
```

A API precisa de `PORTAL_URL=http://localhost:5174` (origem que ela confere nas alterações e base dos links dos e-mails).
