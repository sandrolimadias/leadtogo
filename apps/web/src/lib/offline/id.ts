/**
 * UUID v7 gerado no aparelho (RFC 9562): 48 bits de milissegundos e o resto aleatório. É o id do relatório
 * de visita desde o check-in, mesmo sem sinal: o `PUT /visitas/:id` é um upsert nele, e reenviar não duplica.
 */
export function novoIdDoAparelho(agora = Date.now()): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  let t = agora
  for (let i = 5; i >= 0; i -= 1) {
    b[i] = t % 256
    t = Math.floor(t / 256)
  }
  b[6] = ((b[6] as number) & 0x0f) | 0x70
  b[8] = ((b[8] as number) & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
