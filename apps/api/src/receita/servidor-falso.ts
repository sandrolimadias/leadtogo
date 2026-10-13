import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

/** Servidor HTTP de teste que faz o papel da Minha Receita ou da BrasilAPI. */
export interface ServidorFalso {
  url: string
  /** Quantas consultas chegaram (o caminho de cada uma, ex.: "/12345678000195") */
  chamadas: string[]
  /** Troca o comportamento: `(caminho) => { status, corpo?, atrasoMs? }` */
  responder: (resposta: RespostaFalsa | ((caminho: string) => RespostaFalsa)) => void
  fechar: () => Promise<void>
}

export interface RespostaFalsa {
  status: number
  corpo?: unknown
  /** Texto cru (para testar resposta que não é JSON) */
  texto?: string
  /** Segura a resposta por este tempo (tempo esgotado) */
  atrasoMs?: number
}

export async function subirServidorFalso(
  inicial: RespostaFalsa | ((caminho: string) => RespostaFalsa),
): Promise<ServidorFalso> {
  let atual = inicial
  const chamadas: string[] = []
  const pendentes = new Set<ReturnType<typeof setTimeout>>()
  const servidor: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const caminho = req.url ?? ''
    chamadas.push(caminho)
    const r = typeof atual === 'function' ? atual(caminho) : atual
    const enviar = () => {
      res.statusCode = r.status
      if (r.texto !== undefined) {
        res.setHeader('content-type', 'text/html')
        res.end(r.texto)
        return
      }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(r.corpo ?? {}))
    }
    if (r.atrasoMs) {
      const t = setTimeout(enviar, r.atrasoMs)
      pendentes.add(t)
    } else {
      enviar()
    }
  })
  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver))
  const porta = (servidor.address() as { port: number }).port
  return {
    url: `http://127.0.0.1:${porta}`,
    chamadas,
    responder: (r) => {
      atual = r
    },
    fechar: () =>
      new Promise<void>((resolver) => {
        for (const t of pendentes) clearTimeout(t)
        servidor.closeAllConnections()
        servidor.close(() => resolver())
      }),
  }
}

/** Resposta FALSA no formato da Minha Receita (nada de empresa real). */
export function respostaDaReceita(
  cnpj: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    cnpj,
    razao_social: 'METALURGICA EXEMPLO LTDA',
    nome_fantasia: 'EXEMPLO USINAGEM',
    situacao_cadastral: 2,
    descricao_situacao_cadastral: 'ATIVA',
    descricao_motivo_situacao_cadastral: 'SEM MOTIVO',
    data_situacao_cadastral: '2015-03-10',
    identificador_matriz_filial: cnpj.slice(8, 12) === '0001' ? 1 : 2,
    opcao_pelo_mei: false,
    opcao_pelo_simples: true,
    codigo_porte: 3,
    data_inicio_atividade: '2015-03-10',
    cep: '29100001',
    descricao_tipo_de_logradouro: 'RUA',
    logradouro: 'DAS FLORES',
    numero: '567',
    complemento: 'GALPAO 2',
    bairro: 'CENTRO',
    codigo_municipio_ibge: 3205309,
    municipio: 'VITORIA',
    uf: 'ES',
    codigo_pais: null,
    ddd_telefone_1: '2730643021',
    ddd_telefone_2: '',
    cnae_fiscal: 2539001,
    cnae_fiscal_descricao: 'Serviços de usinagem, tornearia e solda',
    cnaes_secundarios: [{ codigo: 2543800, descricao: 'Fabricação de ferramentas' }],
    qsa: [
      {
        nome_socio: 'FULANO DE TAL',
        cnpj_cpf_do_socio: '***123456**',
        codigo_qualificacao_socio: 49,
        qualificacao_socio: 'Sócio-Administrador',
      },
    ],
    ...extra,
  }
}
