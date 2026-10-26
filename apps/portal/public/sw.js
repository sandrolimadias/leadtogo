// Service worker do Portal do Cliente: torna o portal instalável e recebe o push dos avisos.
// Não guarda nada em cache: o portal mostra dados da empresa do cliente e nada disso pode ficar no aparelho
// fora da sessão. Só trata `push` (mostra a notificação) e `notificationclick` (abre o destino).

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()))

self.addEventListener('push', (evento) => {
  let dados
  try {
    dados = evento.data ? evento.data.json() : {}
  } catch {
    dados = { corpo: evento.data ? evento.data.text() : '' }
  }
  const titulo =
    typeof dados.titulo === 'string' && dados.titulo ? dados.titulo : 'Portal do Cliente'
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: typeof dados.corpo === 'string' ? dados.corpo : '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: typeof dados.tag === 'string' ? dados.tag : undefined,
      requireInteraction: dados.urgente === true,
      data: { destino: typeof dados.destino === 'string' ? dados.destino : null },
    }),
  )
})

// Só abre um caminho do próprio portal ou um endereço https; qualquer outra coisa cai no início do portal.
function destinoSeguro(destino) {
  if (typeof destino !== 'string' || !destino) return '/'
  if (/^\/(?!\/)\S*$/.test(destino)) return destino
  if (/^https:\/\/\S+$/i.test(destino)) return destino
  return '/'
}

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = new URL(destinoSeguro(evento.notification.data?.destino), self.location.origin)
  evento.waitUntil(
    (async () => {
      if (destino.origin === self.location.origin) {
        const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const janela of janelas) {
          if ('focus' in janela) {
            await janela.focus()
            if ('navigate' in janela) await janela.navigate(destino.href)
            return
          }
        }
      }
      await self.clients.openWindow(destino.href)
    })(),
  )
})
