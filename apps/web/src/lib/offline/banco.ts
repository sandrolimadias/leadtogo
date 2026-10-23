/**
 * Banco do aparelho para as visitas offline (G3b; docs/lgpd.md, seção 3.2). Guarda o MÍNIMO (empresas
 * levadas ou abertas, a configuração das visitas e a fila de relatórios), tudo CIFRADO com AES-GCM e uma
 * chave não extraível do WebCrypto guardada no próprio IndexedDB. Limite (dito no lgpd.md): protege
 * contra a leitura casual dos arquivos do navegador, não contra quem tem o navegador desbloqueado.
 * As chaves levam a empresa ativa na frente (`<empresa>:<id>`): trocar de empresa não perde a fila.
 */

export const LOJAS = ['meta', 'empresas', 'apoio', 'fila'] as const
export type Loja = (typeof LOJAS)[number]
type LojaDeDados = Exclude<Loja, 'meta'>

/** Validade dos dados do aparelho: passou disso, some (a fila não vence: é trabalho por enviar). */
export const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000

/** O que o banco precisa de um armazenamento (IndexedDB no navegador; memória nos testes). */
export interface Armazem {
  ler: (loja: Loja, chave: string) => Promise<unknown>
  gravar: (loja: Loja, chave: string, valor: unknown) => Promise<void>
  apagar: (loja: Loja, chave: string) => Promise<void>
  chaves: (loja: Loja) => Promise<string[]>
  esvaziar: (loja: Loja) => Promise<void>
}

function indexedDb(): Armazem {
  let aberto: Promise<IDBDatabase> | null = null
  const abrir = () =>
    (aberto ??= new Promise((resolve, reject) => {
      const pedido = indexedDB.open('leadtogo-offline', 1)
      pedido.onupgradeneeded = () => {
        for (const loja of LOJAS) {
          if (!pedido.result.objectStoreNames.contains(loja)) pedido.result.createObjectStore(loja)
        }
      }
      pedido.onsuccess = () => resolve(pedido.result)
      pedido.onerror = () => {
        aberto = null
        reject(pedido.error ?? new Error('IndexedDB indisponível'))
      }
    }))
  const em = <T>(
    loja: Loja,
    modo: IDBTransactionMode,
    acao: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> =>
    abrir().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(loja, modo)
          const pedido = acao(tx.objectStore(loja))
          tx.oncomplete = () => resolve(pedido.result)
          tx.onerror = () => reject(tx.error ?? new Error('falha no IndexedDB'))
          tx.onabort = () => reject(tx.error ?? new Error('transação abortada'))
        }),
    )
  return {
    ler: (loja, chave) => em(loja, 'readonly', (s) => s.get(chave)),
    gravar: (loja, chave, valor) =>
      em(loja, 'readwrite', (s) => s.put(valor, chave)).then(() => undefined),
    apagar: (loja, chave) => em(loja, 'readwrite', (s) => s.delete(chave)).then(() => undefined),
    chaves: (loja) => em(loja, 'readonly', (s) => s.getAllKeys()).then((k) => k.map(String)),
    esvaziar: (loja) => em(loja, 'readwrite', (s) => s.clear()).then(() => undefined),
  }
}

/** Armazém em memória (testes). */
export function armazemEmMemoria(): Armazem {
  const lojas = new Map<Loja, Map<string, unknown>>(LOJAS.map((l) => [l, new Map()]))
  const de = (l: Loja) => lojas.get(l) as Map<string, unknown>
  return {
    ler: (l, c) => Promise.resolve(de(l).get(c)),
    gravar: (l, c, v) => {
      de(l).set(c, v)
      return Promise.resolve()
    },
    apagar: (l, c) => {
      de(l).delete(c)
      return Promise.resolve()
    },
    chaves: (l) => Promise.resolve([...de(l).keys()]),
    esvaziar: (l) => {
      de(l).clear()
      return Promise.resolve()
    },
  }
}

let armazem: Armazem | null = null
const atual = (): Armazem => (armazem ??= indexedDb())

/** Só para os testes: troca o IndexedDB por outro armazém (ex.: `armazemEmMemoria()`). */
export function usarArmazem(novo: Armazem | null): void {
  armazem = novo
}

// ---- Cifra ----

interface Cifrado {
  iv: Uint8Array<ArrayBuffer>
  dados: ArrayBuffer
  salvoEm: number
}

async function chaveDaCifra(): Promise<CryptoKey> {
  const existente = (await atual().ler('meta', 'chave')) as CryptoKey | undefined
  if (existente) return existente
  // não extraível: nem o próprio app consegue exportá-la; só cifra e decifra neste navegador
  const nova = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  await atual().gravar('meta', 'chave', nova)
  return nova
}

const prefixo = async () => {
  const dono = (await atual().ler('meta', 'dono')) as { empresaId: string } | undefined
  if (!dono) throw new Error('banco offline sem dono: chame prepararParaUsuario antes')
  return `${dono.empresaId}:`
}

export async function guardar(loja: LojaDeDados, id: string, valor: unknown): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const dados = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await chaveDaCifra(),
    new TextEncoder().encode(JSON.stringify(valor)),
  )
  await atual().gravar(loja, (await prefixo()) + id, {
    iv,
    dados,
    salvoEm: Date.now(),
  } satisfies Cifrado)
}

async function decifrar<T>(loja: LojaDeDados, chaveCompleta: string): Promise<T | null> {
  const c = (await atual().ler(loja, chaveCompleta)) as Cifrado | undefined
  if (!c) return null
  try {
    const claro = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: c.iv },
      await chaveDaCifra(),
      c.dados,
    )
    return JSON.parse(new TextDecoder().decode(claro)) as T
  } catch {
    // chave trocada ou dado corrompido: o registro não serve mais
    await atual().apagar(loja, chaveCompleta)
    return null
  }
}

export async function recuperar<T>(loja: LojaDeDados, id: string): Promise<T | null> {
  return decifrar<T>(loja, (await prefixo()) + id)
}

/** Todos os registros da loja da empresa ativa. */
export async function recuperarTodos<T>(loja: LojaDeDados): Promise<{ id: string; valor: T }[]> {
  const p = await prefixo()
  const saida: { id: string; valor: T }[] = []
  for (const chave of await atual().chaves(loja)) {
    if (!chave.startsWith(p)) continue
    const valor = await decifrar<T>(loja, chave)
    if (valor !== null) saida.push({ id: chave.slice(p.length), valor })
  }
  return saida
}

export async function remover(loja: LojaDeDados, id: string): Promise<void> {
  await atual().apagar(loja, (await prefixo()) + id)
}

/** Quantos registros da loja existem no aparelho (de todas as empresas): o aviso antes de sair. */
export async function contar(loja: LojaDeDados): Promise<number> {
  return (await atual().chaves(loja)).length
}

// ---- Proteção do aparelho ----

/** Apaga TUDO (inclusive a chave): ao sair da conta e quando outra pessoa entra no aparelho. */
export async function limparTudo(): Promise<void> {
  for (const loja of LOJAS) await atual().esvaziar(loja)
}

/**
 * Ao entrar e ao abrir o app com sessão: se o aparelho guarda dados de OUTRA pessoa, apaga tudo antes;
 * depois tira o que passou da validade (7 dias), exceto a fila (trabalho ainda por enviar).
 */
export async function prepararParaUsuario(usuarioId: string, empresaId: string): Promise<void> {
  const dono = (await atual().ler('meta', 'dono')) as { usuarioId: string } | undefined
  if (dono && dono.usuarioId !== usuarioId) await limparTudo()
  await atual().gravar('meta', 'dono', { usuarioId, empresaId })
  const limite = Date.now() - VALIDADE_MS
  for (const loja of ['empresas', 'apoio'] as const) {
    for (const chave of await atual().chaves(loja)) {
      const c = (await atual().ler(loja, chave)) as Cifrado | undefined
      if (!c || c.salvoEm < limite) await atual().apagar(loja, chave)
    }
  }
}
