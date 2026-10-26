// Push no navegador (Web Push + VAPID). Tudo o que fala com as APIs do navegador fica aqui, para a tela só decidir o
// que mostrar. O consentimento é sempre uma ação da pessoa (botão): nunca se pede permissão sozinho.

export type EstadoDoPush =
  /** Navegador sem Service Worker, PushManager ou Notification */
  | 'sem_suporte'
  /** iPhone/iPad no Safari: o push só funciona com o portal instalado na tela de início */
  | 'instalar_primeiro'
  /** A pessoa bloqueou as notificações nas configurações do navegador */
  | 'bloqueado'
  /** Pode ativar (ainda não pediu, ou pediu e não ativou) */
  | 'desativado'
  /** Este aparelho já está inscrito */
  | 'ativo'

const ehIos = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** O portal está aberto como app instalado (tela de início), não numa aba do navegador */
export const estaInstalado = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const temSuporte = (): boolean =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function inscricaoAtual(): Promise<PushSubscription | null> {
  const registro = await navigator.serviceWorker.getRegistration()
  return (await registro?.pushManager.getSubscription()) ?? null
}

export async function estadoDoPush(): Promise<EstadoDoPush> {
  if (!temSuporte()) return ehIos() && !estaInstalado() ? 'instalar_primeiro' : 'sem_suporte'
  if (ehIos() && !estaInstalado()) return 'instalar_primeiro'
  if (Notification.permission === 'denied') return 'bloqueado'
  return (await inscricaoAtual()) ? 'ativo' : 'desativado'
}

/** A chave pública VAPID (base64 URL) no formato que o navegador pede */
function chaveParaNavegador(chave: string): Uint8Array<ArrayBuffer> {
  const preenchida = (chave + '='.repeat((4 - (chave.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const bruto = atob(preenchida)
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length))
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i)
  return bytes
}

const base64Url = (buffer: ArrayBuffer | null): string => {
  if (!buffer) return ''
  let texto = ''
  for (const b of new Uint8Array(buffer)) texto += String.fromCharCode(b)
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface InscricaoParaApi {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Pede a permissão (quando a pessoa clicou) e inscreve este aparelho. Devolve nulo se ela recusou. */
export async function ativarPushNesteAparelho(
  chavePublica: string,
): Promise<InscricaoParaApi | null> {
  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') return null
  const registro = await navigator.serviceWorker.ready
  const inscricao =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chaveParaNavegador(chavePublica),
    }))
  return {
    endpoint: inscricao.endpoint,
    keys: {
      p256dh: base64Url(inscricao.getKey('p256dh')),
      auth: base64Url(inscricao.getKey('auth')),
    },
  }
}

/** Cancela a inscrição deste aparelho no navegador e devolve o endereço, para a API revogar também. */
export async function desativarPushNesteAparelho(): Promise<string | null> {
  const inscricao = await inscricaoAtual()
  if (!inscricao) return null
  const endpoint = inscricao.endpoint
  await inscricao.unsubscribe()
  return endpoint
}

/** Registra o service worker (instalação e push). Só em produção, onde o arquivo existe e o HTTPS é garantido. */
export function registrarServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
