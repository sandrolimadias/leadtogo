#!/usr/bin/env node
// Gera os arquivos de seeds/dados/*.json a partir das fontes oficiais. Uso MANUAL, só para
// atualizar os dados (os arquivos gerados são versionados); o `pnpm db:seed` nunca baixa nada.
//   node packages/db/seeds/gerar-dados.mjs [estados] [paises] [portes] [qualificacoes]
// Sem argumentos, gera tudo. Fontes, URLs e datas: seeds/dados/README.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const DESTINO = fileURLToPath(new URL('./dados/', import.meta.url))
const IBGE = 'https://servicodados.ibge.gov.br/api'

async function buscar(url, tipo = 'json') {
  const resposta = await fetch(url)
  if (!resposta.ok) throw new Error(`${url}: HTTP ${resposta.status}`)
  return tipo === 'json' ? resposta.json() : resposta.text()
}

async function gravar(nome, dados) {
  await mkdir(DESTINO, { recursive: true })
  await writeFile(`${DESTINO}${nome}.json`, `${JSON.stringify(dados, null, 2)}\n`)
  console.log(`${nome}.json: ${dados.length} registros`)
}

const geradores = {
  async estados() {
    const lista = await buscar(`${IBGE}/v1/localidades/estados`)
    await gravar(
      'estados',
      lista
        .map((e) => ({ uf: e.sigla, nome: e.nome, regiao: e.regiao.nome }))
        .sort((a, b) => a.uf.localeCompare(b.uf)),
    )
  },

  async paises() {
    const lista = await buscar(`${IBGE}/v1/localidades/paises`)
    await gravar(
      'paises',
      lista
        .map((p) => ({ codigo: p.id['ISO-ALPHA-2'], nome: p.nome }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo)),
    )
  },

  // Layout dos dados abertos do CNPJ (Receita Federal): campo "porte da empresa"
  async portes() {
    await gravar('portes', [
      { codigo: 0, descricao: 'Não informado' },
      { codigo: 1, descricao: 'Micro Empresa' },
      { codigo: 3, descricao: 'Empresa de Pequeno Porte' },
      { codigo: 5, descricao: 'Demais' },
    ])
  },

  // Tabela de qualificações do responsável/sócio da Receita, no CSV do projeto socios-brasil
  async qualificacoes() {
    const csv = await buscar(
      'https://raw.githubusercontent.com/turicas/socios-brasil/HEAD/qualificacao-socio.csv',
      'texto',
    )
    const linhas = csv.trim().split('\n').slice(1)
    await gravar(
      'qualificacoes_socio',
      linhas.map((l) => {
        const [codigo, ...resto] = l.trim().split(',')
        // a descrição pode ter vírgula; a última coluna é "coletado_atualmente"
        const descricao = resto.slice(0, -1).join(',')
        return { codigo: Number(codigo), descricao }
      }),
    )
  },
}

const pedidos = process.argv.slice(2)
const alvos = pedidos.length > 0 ? pedidos : Object.keys(geradores)
for (const alvo of alvos) {
  const gerar = geradores[alvo]
  if (!gerar)
    throw new Error(`Alvo desconhecido: ${alvo}. Opções: ${Object.keys(geradores).join(', ')}`)
  await gerar()
}
