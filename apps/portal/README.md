# Portal do Cliente (`@leadtogo/portal`)

App estático (React + Vite) do cliente final das empresas que usam o Leadtogo. Fala só com `/v1/portal/*`; o CRM
(`apps/web`) fica em `/v1/*`. Plano e decisões: `docs/plano_portal_cliente.md`.

- **Acesso sem senha:** o cliente pede um link de entrada por e-mail (`/entrar`), o link abre `/acesso#<token>` e o botão
  **confirma** (o consumo é por `POST`, nunca ao carregar a página).
- **Cookie:** `__Host-portal` (produção) emitido pela API; `HttpOnly`, `SameSite=Lax`, sem `Domain`.
- **Telas (Fase 3A):** início, chamados (lista, abrir, detalhe com conversa e anexos, reabrir e avaliar), notificações com
  tempo real (SSE), perfil e empresa (nome, e-mail, pedido de acesso para colegas, 2FA e dispositivos).
- **PWA e push (Fase 3E):** `public/manifest.webmanifest` e `public/sw.js` (service worker sem cache: só push e abertura do destino), registrado em produção por `src/casca/push.ts`, que também concentra as APIs do navegador (permissão, inscrição). O push só liga com as chaves `VAPID_*` na API e no worker; sem elas a tela de preferências explica. No iPhone exige o portal instalado na tela de início.
- **Serviços:** `src/servicos` (interface `ServicosDoPortal`, implementação real e contexto); os testes usam serviços de
  mentira (`src/testes/fakes.tsx`), como o `apps/web`.

## Desenvolvimento

```
pnpm --filter @leadtogo/portal dev     # http://localhost:5174 (o proxy do Vite leva /v1 à API em :3000)
```

A API precisa de `PORTAL_URL=http://localhost:5174` (origem que ela confere nas alterações e base dos links dos e-mails).
