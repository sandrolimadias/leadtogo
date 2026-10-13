/**
 * Espera por resultado assíncrono nos testes (e-mail no Mailpit, job na fila, evento do outbox).
 *
 * Padrão único: 15 s. As esperas terminam assim que o resultado chega, então o prazo largo não deixa
 * a suíte mais lenta; só dá folga quando a máquina (WSL, runner de 2 vCPUs) está ocupada. O prazo de
 * 15 s cabe no tempo limite por teste da API (20 s, em vitest.config.ts).
 */
export const PRAZO_ESPERA_MS = 15_000

export async function esperarAte(
  condicao: () => Promise<boolean>,
  ms = PRAZO_ESPERA_MS,
): Promise<void> {
  const limite = Date.now() + ms
  while (Date.now() < limite) {
    if (await condicao()) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`condição não atingida em ${ms} ms`)
}
