import type { PadroesDosPerfis } from '@leadtogo/db'
import {
  NOVAS_POR_VERSAO,
  PERMISSOES_DE_VER,
  PERMISSOES_PADRAO,
  chaveDeSistemaSchema,
  exige2faDaPoliticaAntiga,
  linhasDasPermissoes,
  nomeDoPerfilDeSistema,
  VERSAO_DO_CATALOGO,
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
  versao: VERSAO_DO_CATALOGO,
  novasPorVersao: NOVAS_POR_VERSAO,
}
