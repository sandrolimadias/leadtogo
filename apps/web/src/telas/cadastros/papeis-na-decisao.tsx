import type { PapelDecisao } from '@leadtogo/api-client'
import type { AlterarPapelDecisaoEntrada, CriarPapelDecisaoEntrada } from '@leadtogo/shared'
import { Scale } from 'lucide-react'

import { type ConfigDaLista, ListaDeCadastro } from './lista'

interface EstadoDoPapel {
  nome: string
}

const papeis: ConfigDaLista<
  PapelDecisao,
  EstadoDoPapel,
  CriarPapelDecisaoEntrada,
  AlterarPapelDecisaoEntrada
> = {
  chave: 'papeis-decisao',
  titulo: 'Papéis na decisão',
  descricao: 'O papel de cada contato na decisão de compra (Decisor, Influenciador...).',
  icone: Scale,
  rotulos: {
    singular: 'papel',
    plural: 'os papéis na decisão',
    novo: 'Novo papel',
    vazioTitulo: 'Nenhum papel ainda',
    vazioDescricao: 'Crie os papéis que você usa para classificar os contatos.',
    criado: 'Papel criado',
    atualizado: 'Papel atualizado',
    excluido: (nome) => `Papel ${nome} excluído`,
    exemploDoNome: 'Ex.: Patrocinador',
  },
  servicos: (s) => s.cadastros.papeisDecisao,
  linha: (p) => <span className="font-semibold">{p.nome}</span>,
  estadoInicial: (p) => ({ nome: p?.nome ?? '' }),
  campos: () => null,
  paraCriar: (e) => ({ nome: e.nome }),
  paraAlterar: (e) => ({ nome: e.nome }),
}

/** Configurações → Papéis na decisão. */
export function TelaDePapeisNaDecisao() {
  return <ListaDeCadastro config={papeis} />
}
