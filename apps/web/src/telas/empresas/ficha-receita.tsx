import type { ConsultaDaReceitaDaEmpresa } from '@leadtogo/api-client'

import { Button } from '@leadtogo/ui/button'
import { Alert } from '@leadtogo/ui/feedback'
import { Janela } from '@/telas/cadastros/base'

import { dataCurta } from './formatos'

/**
 * "Atualizar pela Receita": o que a Receita tem de diferente do cadastro (atual × Receita) e a
 * situação da empresa. "Aplicar alterações" grava tudo; "Manter como está" só fecha (a situação e a
 * data da consulta já foram atualizadas).
 */
export function ComparacaoComAReceita({
  consulta,
  nome,
  aplicando,
  erro,
  aoAplicar,
  aoManter,
}: {
  consulta: ConsultaDaReceitaDaEmpresa
  nome: string
  aplicando: boolean
  erro?: string | undefined
  aoAplicar: () => void
  aoManter: () => void
}) {
  const { situacao, mudancas } = consulta
  const mudouASituacao =
    consulta.situacaoAnterior !== null && consulta.situacaoAnterior !== situacao.descricao
  const desde = situacao.desde ? ` desde ${dataCurta(`${situacao.desde}T12:00:00`)}` : ''
  return (
    <Janela
      open
      onOpenChange={(aberto) => (aberto ? undefined : aoManter())}
      title="Atualizar pela Receita"
      description={`${nome} · consulta de ${dataCurta(consulta.consultadoEm)}`}
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={aoManter}>
            {mudancas.length > 0 ? 'Manter como está' : 'Fechar'}
          </Button>
          {mudancas.length > 0 ? (
            <Button variant="primary" loading={aplicando} onClick={aoAplicar}>
              Aplicar alterações
            </Button>
          ) : null}
        </>
      }
    >
      {situacao.ativa ? (
        <Alert tone={mudouASituacao ? 'info' : 'success'} title={`Situação: ${situacao.descricao}`}>
          {mudouASituacao
            ? `Antes estava ${consulta.situacaoAnterior}.`
            : `Ativa na Receita${desde}.`}
        </Alert>
      ) : (
        <Alert tone="warning" title={`Situação: ${situacao.descricao}${desde}`}>
          {situacao.motivo ? `${situacao.motivo}. ` : ''}A empresa continua na carteira, com o aviso
          de situação.
        </Alert>
      )}
      {mudancas.length === 0 ? (
        <Alert tone="info" title="O cadastro já está igual à Receita">
          Não há valores para atualizar.
        </Alert>
      ) : (
        <>
          <Alert
            tone="info"
            title={`A Receita tem ${mudancas.length} ${mudancas.length === 1 ? 'valor diferente' : 'valores diferentes'}`}
          >
            Telefones da Receita são somados aos seus, nunca trocados.
          </Alert>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)] gap-x-4 gap-y-2.5 text-[13px] max-md:grid-cols-1">
            <span className="text-xs font-semibold text-ink-muted max-md:hidden">Campo</span>
            <span className="text-xs font-semibold text-ink-muted max-md:hidden">No CRM</span>
            <span className="text-xs font-semibold text-ink-muted max-md:hidden">Na Receita</span>
            {mudancas.map((m) => (
              <div key={m.chave} className="contents max-md:flex max-md:flex-col max-md:gap-0.5">
                <span className="font-semibold">{m.rotulo}</span>
                <span className="text-ink-muted [overflow-wrap:anywhere]">
                  <span className="md:hidden">No CRM: </span>
                  {m.atual ?? '—'}
                </span>
                <span className="font-semibold [overflow-wrap:anywhere]">
                  <span className="font-normal text-ink-muted md:hidden">Na Receita: </span>
                  {m.receita ?? '—'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {erro ? (
        <Alert tone="danger" title="Não foi possível aplicar">
          {erro}
        </Alert>
      ) : null}
    </Janela>
  )
}
