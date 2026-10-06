import { request } from 'node:http'

// Comando de saúde do worker (o que o Coolify executa): `node dist/saude-worker.js`.
// Consulta o servidor de saúde no loopback do próprio container; sai com 0 (saudável) ou 1.
const porta = Number(process.env['WORKER_SAUDE_PORTA'] ?? 3001)
const pedido = request(
  { host: '127.0.0.1', port: porta, path: '/health', timeout: 3000 },
  (resposta) => {
    resposta.resume()
    process.exit(resposta.statusCode === 200 ? 0 : 1)
  },
)
pedido.on('timeout', () => pedido.destroy(new Error('tempo esgotado')))
pedido.on('error', () => process.exit(1))
pedido.end()
