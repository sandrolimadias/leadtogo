import { TAMANHO_MAXIMO_DA_BUSCA, TAMANHO_MINIMO_DA_BUSCA } from '@leadtogo/shared'
import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowRight, Clock, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button, IconButton } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'

import {
  type ItemAchado,
  itensEmOrdem,
  TIPOS,
  termoValido,
  useBuscaGlobal,
  useBuscasRecentes,
  useTermoComEspera,
} from './consultas'
import { ICONE_DO_TIPO, useAbrirItem } from './abrir'
import { ConteudoDoItem } from './itens'

const rota = getRouteApi('/_autenticado/busca')

/** "Ver todos em …": a lista do tipo, já filtrada pelo termo. */
function VerTodos({ tipo, termo }: { tipo: ItemAchado['tipo']; termo: string }) {
  const classe =
    'inline-flex items-center gap-1 self-start text-sm font-semibold text-brand no-underline hover:underline'
  const conteudo = (rotulo: string) => (
    <>
      Ver todos em {rotulo}
      <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
    </>
  )
  if (tipo === 'empresas') {
    return (
      <Link to="/empresas" search={{ busca: termo }} className={classe}>
        {conteudo('Empresas')}
      </Link>
    )
  }
  if (tipo === 'contatos') {
    return (
      <Link to="/contatos" search={{ busca: termo }} className={classe}>
        {conteudo('Contatos')}
      </Link>
    )
  }
  return (
    <Link to="/oportunidades" search={{ visao: 'lista', busca: termo }} className={classe}>
      {conteudo('Oportunidades')}
    </Link>
  )
}

/**
 * Tela `/busca` (Enter na barra do topo, "Ver todos os resultados" e a lupa do celular): o termo fica na URL, os
 * resultados em seções por tipo (até 5) e, com o campo vazio, as buscas recentes.
 */
export function TelaDeBusca() {
  const { q = '' } = rota.useSearch()
  const navegar = rota.useNavigate()
  const abrirItem = useAbrirItem()
  const recentes = useBuscasRecentes()
  const [texto, setTexto] = useState(q)
  const termo = useTermoComEspera(texto)
  const busca = useBuscaGlobal(termo)
  const digitado = texto.trim()

  // O termo vai para a URL (sem empilhar no histórico) para a tela poder ser recarregada ou compartilhada
  useEffect(() => {
    if (termo === q) return
    void navegar({ search: termo ? { q: termo } : {}, replace: true })
  }, [termo, q, navegar])

  const atual = busca.data?.termo === termo && termoValido(termo)
  const itens = atual ? itensEmOrdem(busca.data?.resultado) : []
  const escolher = (item: ItemAchado) => {
    recentes.registrar(digitado)
    abrirItem(item)
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="m-0 text-2xl leading-8 font-semibold">Busca</h1>
        <p className="mt-1 mb-0 text-sm leading-5 text-ink-muted">
          Procure empresas, contatos e oportunidades da sua carteira.
        </p>
      </header>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          recentes.registrar(digitado)
        }}
      >
        <TextField
          label="O que você procura?"
          icon={Search}
          type="search"
          value={texto}
          autoFocus
          autoComplete="off"
          maxLength={TAMANHO_MAXIMO_DA_BUSCA}
          onChange={(e) => setTexto(e.target.value)}
          hint={
            digitado !== '' && !termoValido(digitado)
              ? `Digite ao menos ${TAMANHO_MINIMO_DA_BUSCA} letras.`
              : 'Nome, CNPJ, cidade, e-mail, telefone ou título. A busca ignora acentos e maiúsculas.'
          }
        />
      </form>

      {digitado === '' && recentes.itens.length > 0 ? (
        <section aria-labelledby="buscas-recentes" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 id="buscas-recentes" className="m-0 text-sm leading-5 font-semibold text-ink-muted">
              Buscas recentes
            </h2>
            <Button variant="ghost" size="sm" onClick={() => recentes.limpar()}>
              Limpar histórico
            </Button>
          </div>
          <ul className="m-0 list-none divide-y divide-border rounded-md border border-border bg-surface p-0">
            {recentes.itens.map((r) => (
              <li key={r.id} className="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  onClick={() => setTexto(r.termo)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent px-4 py-3 text-left hover:bg-surface-hover"
                >
                  <Clock
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className="flex-none text-ink-subtle"
                  />
                  <span className="truncate text-sm leading-5">{r.termo}</span>
                </button>
                <IconButton
                  icon={X}
                  size="sm"
                  label={`Remover "${r.termo}" das buscas recentes`}
                  onClick={() => recentes.apagar(r.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {busca.isError && !atual ? (
        <Alert
          tone="danger"
          title="Não foi possível buscar agora."
          actions={
            <Button variant="secondary" size="sm" onClick={() => void busca.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : null}
      {termoValido(digitado) && !atual && !busca.isError ? <Skeleton lines={4} /> : null}
      {atual && itens.length === 0 ? (
        <div className="rounded-md border border-border bg-surface">
          <EmptyState
            icon={Search}
            title={`Nada encontrado para “${termo}”`}
            description="Tente outras palavras ou parte do nome. A busca ignora acentos e maiúsculas."
          />
        </div>
      ) : null}

      {atual
        ? TIPOS.map(({ tipo, rotulo }) => {
            const doTipo = itens.filter((i) => i.tipo === tipo)
            if (doTipo.length === 0) return null
            const Icone = ICONE_DO_TIPO[tipo]
            return (
              <section key={tipo} aria-label={rotulo} className="flex flex-col gap-2">
                <h2 className="m-0 flex items-center gap-2 text-sm leading-5 font-semibold text-ink-muted">
                  <Icone size={16} strokeWidth={1.75} aria-hidden="true" />
                  {rotulo}
                </h2>
                <ul className="m-0 list-none divide-y divide-border rounded-md border border-border bg-surface p-0">
                  {doTipo.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => escolher(item)}
                        className="flex w-full cursor-pointer items-start gap-2 border-0 bg-transparent px-4 py-3 text-left hover:bg-surface-hover"
                      >
                        <ConteudoDoItem item={item} />
                      </button>
                    </li>
                  ))}
                </ul>
                <VerTodos tipo={tipo} termo={termo} />
              </section>
            )
          })
        : null}
    </div>
  )
}
