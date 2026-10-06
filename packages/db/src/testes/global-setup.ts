import { zerarEMigrar } from '../suporte-testes.js'
import { urlOwnerDeTeste } from './conexoes.js'

// Apaga tudo o que o owner criou e aplica as migrações do zero em leadtogo_test.
export default async function setup(): Promise<void> {
  await zerarEMigrar(urlOwnerDeTeste())
}
