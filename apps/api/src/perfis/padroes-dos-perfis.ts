import type { PadroesDosPerfis } from '@leadtogo/db'
import {
  PERMISSOES_DE_VER,
  PERMISSOES_PADRAO,
  chaveDeSistemaSchema,
  exige2faDaPoliticaAntiga,
  linhasDasPermissoes,
  nomeDoPerfilDeSistema,
} from '@leadtogo/shared'

/**
 * Padrões dos perfis de sistema a partir do catálogo de permissões (packages/shared): o que o pacote
 * do banco grava ao criar uma empresa e no backfill da partida.
 */
export const padroesDosPerfis: PadroesDosPerfis = {
  perfis: chaveDeSistemaSchema.options.map((chave) => ({
    chave,
    nome: nomeDoPerfilDeSistema[chave],
    permissoes: linhasDasPermissoes(PERMISSOES_PADRAO[chave]),
  })),
  permissoesDeVer: PERMISSOES_DE_VER,
  exige2fa: exige2faDaPoliticaAntiga,
}
