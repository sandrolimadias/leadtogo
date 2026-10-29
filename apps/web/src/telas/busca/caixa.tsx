import { TAMANHO_MAXIMO_DA_BUSCA, TAMANHO_MINIMO_DA_BUSCA } from '@leadtogo/shared'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Clock, Search, X } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { cn } from '@leadtogo/ui/cn'

import {
  type ItemAchado,
  itensEmOrdem,
  TIPOS,
  termoValido,
  useBuscaGlobal,
  useBuscasRecentes,
  useTermoComEspera,
} from './consultas'
import { useAbrirItem } from './abrir'
import { ConteudoDoItem } from './itens'

/** O foco não está num campo de texto (o atalho "/" não pode roubar a digitação). */
const digitando = (alvo: EventTarget | null) =>
  alvo instanceof HTMLElement &&
  (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName))

/** Ctrl+K (ou ⌘K) e "/" levam o foco à busca global. */
function useAtalhoDaBusca(campo: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const aoTeclar = (e: globalThis.KeyboardEvent) => {
      const ctrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'
      const barra = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !digitando(e.target)
      if (!ctrlK && !barra) return
      e.preventDefault()
      campo.current?.focus()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [campo])
}

/** Uma linha que o teclado percorre: uma busca recente, um resultado ou "Ver todos os resultados". */
type Opcao =
  | { chave: string; tipo: 'recente'; termo: string }
  | { chave: string; tipo: 'item'; item: ItemAchado }
  | { chave: string; tipo: 'todos' }

/**
 * A busca global da barra do topo (desktop e tablet): com a caixa vazia, as buscas recentes; digitando, as
 * sugestões por tipo (até 5). Enter sem item marcado, ou "Ver todos os resultados", abre a tela `/busca`.
 * Só a busca concluída (escolheu um resultado ou apertou Enter) entra nas recentes.
 */
export function BuscaGlobal() {
  const navegar = useNavigate()
  const abrirItem = useAbrirItem()
  const recentes = useBuscasRecentes()
  const campo = useRef<HTMLInputElement>(null)
  const base = useId()
  const [texto, setTexto] = useState('')
  const [aberta, setAberta] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  useAtalhoDaBusca(campo)

  const digitado = texto.trim()
  const termo = useTermoComEspera(texto)
  const busca = useBuscaGlobal(termo)
  const modo = digitado === '' ? 'recentes' : termoValido(digitado) ? 'resultados' : 'curto'
  const atual = busca.data?.termo === termo && termo === digitado
  const itens = modo === 'resultados' && atual ? itensEmOrdem(busca.data?.resultado) : []

  const fechar = () => {
    setAberta(false)
    setAtivo(-1)
  }
  const irParaTela = (q: string) => {
    recentes.registrar(q)
    fechar()
    setTexto('')
    campo.current?.blur()
    void navegar({ to: '/busca', search: { q } })
  }
  const escolher = (item: ItemAchado) => {
    recentes.registrar(digitado)
    fechar()
    setTexto('')
    campo.current?.blur()
    abrirItem(item)
  }
  const repetir = (t: string) => {
    setTexto(t)
    setAtivo(-1)
    campo.current?.focus()
  }

  const opcoes: Opcao[] =
    modo === 'recentes'
      ? recentes.itens.map((r) => ({ chave: `r-${r.id}`, tipo: 'recente', termo: r.termo }))
      : modo === 'resultados' && atual && itens.length > 0
        ? [
            ...itens.map((item) => ({
              chave: `${item.tipo}-${item.id}`,
              tipo: 'item' as const,
              item,
            })),
            { chave: 'todos', tipo: 'todos' },
          ]
        : []
  // O item marcado pode ter saído da lista (chegou outro resultado): aí nenhum fica marcado
  const marcado = ativo < opcoes.length ? ativo : -1
  const indiceDe = (chave: string) => opcoes.findIndex((o) => o.chave === chave)
  const indiceDosTodos = indiceDe('todos')
  const idDa = (i: number) => `${base}-opcao-${i}`
  const visivel = aberta && (modo !== 'recentes' || recentes.itens.length > 0)

  const executar = (o: Opcao) => {
    if (o.tipo === 'recente') repetir(o.termo)
    else if (o.tipo === 'item') escolher(o.item)
    else irParaTela(digitado)
  }

  const aoTeclar = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setAberta(true)
      if (opcoes.length === 0) return
      // Anda em círculo pelas opções, passando pelo campo (-1, nenhuma marcada)
      const proxima = marcado + (e.key === 'ArrowDown' ? 1 : -1)
      setAtivo(proxima >= opcoes.length ? -1 : proxima < -1 ? opcoes.length - 1 : proxima)
      return
    }
    if (e.key === 'Escape') {
      if (visivel) {
        e.preventDefault()
        fechar()
      }
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const opcao = marcado >= 0 ? opcoes[marcado] : undefined
      if (opcao) executar(opcao)
      else if (termoValido(digitado)) irParaTela(digitado)
    }
  }

  const classeDaOpcao = (i: number) =>
    cn(
      'flex w-full cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-left',
      i === marcado ? 'bg-surface-hover' : 'hover:bg-surface-hover',
    )
  /** Sem tirar o foco do campo ao clicar (o combobox continua aberto até a escolha) */
  const semRoubarFoco = (e: React.MouseEvent) => e.preventDefault()

  return (
    <div
      className="relative w-full"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) fechar()
      }}
    >
      <TextField
        ref={campo}
        icon={Search}
        type="search"
        role="combobox"
        aria-label="Buscar empresas, contatos e oportunidades"
        aria-autocomplete="list"
        aria-expanded={visivel}
        aria-controls={`${base}-lista`}
        aria-activedescendant={marcado >= 0 ? idDa(marcado) : undefined}
        aria-keyshortcuts="Control+K /"
        placeholder="Buscar empresas, contatos e oportunidades"
        autoComplete="off"
        maxLength={TAMANHO_MAXIMO_DA_BUSCA}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setAberta(true)
          setAtivo(-1)
        }}
        onFocus={() => setAberta(true)}
        onClick={() => setAberta(true)}
        onKeyDown={aoTeclar}
      />
      {visivel ? (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 flex max-h-[min(70vh,520px)] flex-col overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-md">
          <ul
            id={`${base}-lista`}
            role="listbox"
            aria-label="Busca global"
            className="m-0 list-none p-0"
          >
            {modo === 'recentes' ? (
              <li role="group" aria-labelledby={`${base}-recentes`}>
                <p
                  id={`${base}-recentes`}
                  className="m-0 px-2 pt-1.5 pb-1 text-xs leading-4 font-semibold text-ink-muted"
                >
                  Buscas recentes
                </p>
                <ul role="presentation" className="m-0 list-none p-0">
                  {recentes.itens.map((r) => {
                    const i = indiceDe(`r-${r.id}`)
                    return (
                      <li key={r.id} role="presentation" className="flex items-center gap-1">
                        <div
                          id={idDa(i)}
                          role="option"
                          aria-selected={i === marcado}
                          onMouseDown={semRoubarFoco}
                          onClick={() => repetir(r.termo)}
                          className={cn(classeDaOpcao(i), 'items-center')}
                        >
                          <Clock
                            size={16}
                            strokeWidth={1.75}
                            aria-hidden="true"
                            className="flex-none text-ink-subtle"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm leading-5">
                            {r.termo}
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remover "${r.termo}" das buscas recentes`}
                          onMouseDown={semRoubarFoco}
                          onClick={() => recentes.apagar(r.id)}
                          className="inline-flex size-7 flex-none cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-ink-subtle hover:bg-surface-hover hover:text-ink"
                        >
                          <X size={14} strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ) : null}

            {modo === 'curto' ? (
              <li role="presentation" className="px-2 py-1.5 text-sm text-ink-muted">
                Digite ao menos {TAMANHO_MINIMO_DA_BUSCA} letras.
              </li>
            ) : null}

            {modo === 'resultados' && busca.isError && !atual ? (
              <li
                role="presentation"
                className="flex items-center gap-2 px-2 py-1.5 text-sm text-danger"
              >
                Não foi possível buscar agora.
                <Button
                  variant="ghost"
                  size="sm"
                  onMouseDown={semRoubarFoco}
                  onClick={() => void busca.refetch()}
                >
                  Tentar de novo
                </Button>
              </li>
            ) : null}
            {modo === 'resultados' && !atual && !busca.isError ? (
              <li role="presentation">
                <span role="status" className="block px-2 py-1.5 text-sm text-ink-muted">
                  Buscando…
                </span>
              </li>
            ) : null}
            {modo === 'resultados' && atual && itens.length === 0 ? (
              <li role="presentation" className="px-2 py-1.5 text-sm text-ink-muted">
                Nada encontrado para “{digitado}”.
              </li>
            ) : null}

            {modo === 'resultados' && atual
              ? TIPOS.map(({ tipo, rotulo }) => {
                  const doTipo = itens.filter((i) => i.tipo === tipo)
                  if (doTipo.length === 0) return null
                  return (
                    <li key={tipo} role="group" aria-labelledby={`${base}-${tipo}`}>
                      <p
                        id={`${base}-${tipo}`}
                        className="m-0 px-2 pt-1.5 pb-1 text-xs leading-4 font-semibold text-ink-muted"
                      >
                        {rotulo}
                      </p>
                      <ul role="presentation" className="m-0 list-none p-0">
                        {doTipo.map((item) => {
                          const i = indiceDe(`${item.tipo}-${item.id}`)
                          return (
                            <li
                              key={item.id}
                              id={idDa(i)}
                              role="option"
                              aria-selected={i === marcado}
                              onMouseDown={semRoubarFoco}
                              onClick={() => escolher(item)}
                              className={classeDaOpcao(i)}
                            >
                              <ConteudoDoItem item={item} />
                            </li>
                          )
                        })}
                      </ul>
                    </li>
                  )
                })
              : null}
            {indiceDosTodos >= 0 ? (
              <li
                id={idDa(indiceDosTodos)}
                role="option"
                aria-selected={indiceDosTodos === marcado}
                onMouseDown={semRoubarFoco}
                onClick={() => irParaTela(digitado)}
                className={cn(
                  classeDaOpcao(indiceDosTodos),
                  'mt-1 items-center border-t border-border pt-2 text-sm font-semibold text-brand',
                )}
              >
                Ver todos os resultados
                <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
              </li>
            ) : null}
          </ul>
          {modo === 'recentes' ? (
            <div className="mt-1 flex justify-end border-t border-border pt-1">
              <Button
                variant="ghost"
                size="sm"
                onMouseDown={semRoubarFoco}
                onClick={() => recentes.limpar()}
              >
                Limpar histórico
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
