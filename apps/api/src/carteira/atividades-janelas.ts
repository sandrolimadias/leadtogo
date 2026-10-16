import { schema, sql, type SQL } from '@leadtogo/db'

const { atividades } = schema

/**
 * As janelas de tempo das atividades abertas, todas no fuso da empresa (nunca em UTC). São as mesmas contas da
 * tela Atividades e do Dashboard, e não se sobrepõem: atrasada, hoje (que ainda não venceu) e próximos 7 dias.
 */
export const aberta: SQL = sql`${atividades.situacao} IN ('pendente', 'em_execucao')`

const hojeNoFuso = (fuso: string) => sql`(now() AT TIME ZONE ${fuso})::date`
const diaDaAtividade = (fuso: string) => sql`(${atividades.dataInicio} AT TIME ZONE ${fuso})::date`

/** Aberta com a data passada; a de dia inteiro só atrasa quando o dia acaba. */
export const atrasada = (
  fuso: string,
): SQL => sql`(${aberta} AND (CASE WHEN ${atividades.diaInteiro}
  THEN ${diaDaAtividade(fuso)} < ${hojeNoFuso(fuso)}
  ELSE ${atividades.dataInicio} < now() END))`

/** Abertas de hoje que ainda não venceram, mais as de dia inteiro de hoje. */
export const hoje = (fuso: string): SQL =>
  sql`(${aberta} AND NOT ${atrasada(fuso)} AND ${diaDaAtividade(fuso)} = ${hojeNoFuso(fuso)})`

/** Abertas de amanhã até daqui a 7 dias. */
export const proximos7 = (fuso: string): SQL =>
  sql`(${aberta} AND ${diaDaAtividade(fuso)} > ${hojeNoFuso(fuso)} AND ${diaDaAtividade(fuso)} <= ${hojeNoFuso(fuso)} + 7)`

/** Abertas que não atrasaram (a aba Agendadas da tela Atividades). */
export const agendadas = (fuso: string): SQL => sql`(${aberta} AND NOT ${atrasada(fuso)})`
