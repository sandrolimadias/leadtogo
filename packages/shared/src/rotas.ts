import { z } from 'zod'

// Rotas (G4; docs/funcionalidades.md, seção 3D, e docs/plano_geolocalizacao.md, seção 10).

/** No máximo 30 paradas por rota (decisão do Ale, 23/10/2026); a API lê `ROTA_MAX_PARADAS` (padrão 30). */
export const MAX_PARADAS_POR_ROTA = 30
export const MINUTOS_POR_VISITA_PADRAO = 40

/** Código exibido da rota: R-0151. */
export const codigoDaRota = (codigo: number): string => `R-${String(codigo).padStart(4, '0')}`

const dataSchema = z.iso.date()

export const coordenadaSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict()
  .meta({ id: 'Coordenada' })
export type Coordenada = z.infer<typeof coordenadaSchema>

export const PARTIDAS_DE_ROTA = ['posicao_atual', 'ponto'] as const
export const partidaDeRotaSchema = z.enum(PARTIDAS_DE_ROTA)
export type PartidaDeRota = z.infer<typeof partidaDeRotaSchema>

export const SITUACOES_DE_ROTA = ['planejada', 'em_andamento', 'concluida', 'cancelada'] as const
export const situacaoDeRotaSchema = z.enum(SITUACOES_DE_ROTA)
export type SituacaoDeRota = z.infer<typeof situacaoDeRotaSchema>

export const ROTULO_DA_SITUACAO_DE_ROTA: Record<SituacaoDeRota, string> = {
  planejada: 'Planejada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

export const situacaoDeParadaSchema = z.enum(['pendente', 'visitada', 'pulada'])
export type SituacaoDeParada = z.infer<typeof situacaoDeParadaSchema>

/** Como saíram as distâncias e os tempos: pelas ruas (OSRM) ou estimados em linha reta. */
export const estimativaDeRotaSchema = z.enum(['ruas', 'linha_reta'])
export type EstimativaDeRota = z.infer<typeof estimativaDeRotaSchema>

// ---- Pontos de partida e configuração ----

export const pontoDePartidaSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    endereco: z.string().nullable(),
    latitude: z.number(),
    longitude: z.number(),
    padrao: z.boolean(),
    ativo: z.boolean(),
    ordem: z.number().int(),
  })
  .meta({ id: 'PontoDePartida' })
export type PontoDePartida = z.infer<typeof pontoDePartidaSchema>

export const criarPontoDePartidaSchema = z
  .object({
    nome: z.string().trim().min(1, 'informe o nome').max(120),
    endereco: z.string().trim().max(300).nullable().optional(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    padrao: z.boolean().optional(),
  })
  .strict()
  .meta({ id: 'CriarPontoDePartidaEntrada' })
export type CriarPontoDePartidaEntrada = z.infer<typeof criarPontoDePartidaSchema>

export const alterarPontoDePartidaSchema = criarPontoDePartidaSchema
  .partial()
  .extend({ ativo: z.boolean().optional() })
  .strict()
  .meta({ id: 'AlterarPontoDePartidaEntrada' })
export type AlterarPontoDePartidaEntrada = z.infer<typeof alterarPontoDePartidaSchema>

export const configuracaoDeRotasSchema = z
  .object({
    minutosPorVisita: z.number().int().min(0).max(480),
    /** Limite de paradas por rota (`ROTA_MAX_PARADAS`) */
    maxParadas: z.number().int(),
    /** VROOM e OSRM configurados na API; sem eles, a otimização fica desligada */
    otimizacaoConfigurada: z.boolean(),
  })
  .meta({ id: 'ConfiguracaoDeRotas' })
export type ConfiguracaoDeRotas = z.infer<typeof configuracaoDeRotasSchema>

export const alterarConfiguracaoDeRotasSchema = z
  .object({ minutosPorVisita: z.number().int().min(0).max(480) })
  .strict()
  .meta({ id: 'AlterarConfiguracaoDeRotasEntrada' })
export type AlterarConfiguracaoDeRotasEntrada = z.infer<typeof alterarConfiguracaoDeRotasSchema>

// ---- Rota ----

const empresaIdsSchema = z
  .array(z.uuid())
  .max(MAX_PARADAS_POR_ROTA, `no máximo ${MAX_PARADAS_POR_ROTA} paradas por rota`)
  .refine((ids) => new Set(ids).size === ids.length, 'a mesma empresa aparece duas vezes')

const partidaRefinada = <
  T extends { partida: PartidaDeRota; pontoPartidaId?: string | null | undefined },
>(
  v: T,
  ctx: z.RefinementCtx,
) => {
  if (v.partida === 'ponto' && !v.pontoPartidaId)
    ctx.addIssue({
      code: 'custom',
      path: ['pontoPartidaId'],
      message: 'escolha o ponto de partida',
    })
}

/** Criar ou salvar a rota inteira: as paradas vêm na ordem de visita. */
export const salvarRotaSchema = z
  .object({
    nome: z.string().trim().min(1, 'informe o nome da rota').max(120),
    data: dataSchema,
    /** Sem ele, a própria pessoa; outro vendedor exige `rotas.atribuir` */
    responsavelId: z.uuid().optional(),
    partida: partidaDeRotaSchema,
    pontoPartidaId: z.uuid().nullable().optional(),
    voltarAoInicio: z.boolean(),
    minutosPorVisita: z.number().int().min(0).max(480).optional(),
    empresaIds: empresaIdsSchema,
    /** Posição do aparelho, usada SÓ no cálculo das estimativas com `posicao_atual`; nunca é gravada */
    posicaoAtual: coordenadaSchema.optional(),
    /** A ordem veio de "Otimizar ordem" (grava `otimizada_em`) */
    otimizada: z.boolean().optional(),
  })
  .strict()
  .superRefine(partidaRefinada)
  .meta({ id: 'SalvarRotaEntrada' })
export type SalvarRotaEntrada = z.infer<typeof salvarRotaSchema>

export const otimizarRotaSchema = z
  .object({
    partida: partidaDeRotaSchema,
    pontoPartidaId: z.uuid().nullable().optional(),
    voltarAoInicio: z.boolean(),
    empresaIds: empresaIdsSchema.refine(
      (ids) => ids.length >= 2,
      'são precisas ao menos 2 paradas',
    ),
    /** Usada só no cálculo; nunca é gravada */
    posicaoAtual: coordenadaSchema.optional(),
    /** Responsável da rota (para conferir que ele vê as empresas); sem ele, a própria pessoa */
    responsavelId: z.uuid().optional(),
  })
  .strict()
  .superRefine(partidaRefinada)
  .meta({ id: 'OtimizarRotaEntrada' })
export type OtimizarRotaEntrada = z.infer<typeof otimizarRotaSchema>

export const AVISOS_DA_OTIMIZACAO = ['nao_configurada', 'indisponivel', 'sem_partida'] as const
export const avisoDaOtimizacaoSchema = z.enum(AVISOS_DA_OTIMIZACAO)
export type AvisoDaOtimizacao = z.infer<typeof avisoDaOtimizacaoSchema>

export const MENSAGEM_DO_AVISO_DA_OTIMIZACAO: Record<AvisoDaOtimizacao, string> = {
  nao_configurada: 'Otimização de rotas ainda não configurada',
  indisponivel: 'Serviço de rotas indisponível: ordem estimada em linha reta',
  sem_partida: 'Sem a posição atual: a ordem começa na primeira parada',
}

export const ordemOtimizadaSchema = z
  .object({
    empresaIds: z.array(z.uuid()),
    estimativa: estimativaDeRotaSchema,
    distanciaM: z.number().int(),
    duracaoS: z.number().int(),
    aviso: avisoDaOtimizacaoSchema.nullable(),
  })
  .meta({ id: 'OrdemOtimizada' })
export type OrdemOtimizada = z.infer<typeof ordemOtimizadaSchema>

export const paradaDaRotaSchema = z
  .object({
    id: z.uuid(),
    empresaId: z.uuid(),
    empresaNome: z.string(),
    bairro: z.string().nullable(),
    cidade: z.string().nullable(),
    uf: z.string().nullable(),
    /** Telefone principal em E.164 (para Ligar) */
    telefone: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    precisao: z.enum(['exata', 'aproximada']).nullable(),
    ordem: z.number().int(),
    distanciaTrechoM: z.number().int().nullable(),
    duracaoTrechoS: z.number().int().nullable(),
    situacao: situacaoDeParadaSchema,
    motivoPulo: z.string().nullable(),
    atividadeId: z.uuid().nullable(),
    resolvidaEm: z.string().nullable(),
  })
  .meta({ id: 'ParadaDaRota' })
export type ParadaDaRota = z.infer<typeof paradaDaRotaSchema>

const pessoaSchema = z.object({ id: z.uuid(), nome: z.string() })

export const rotaSchema = z
  .object({
    id: z.uuid(),
    codigo: z.number().int(),
    nome: z.string(),
    data: z.string(),
    responsavel: pessoaSchema,
    partida: partidaDeRotaSchema,
    pontoPartida: z
      .object({ id: z.uuid(), nome: z.string(), latitude: z.number(), longitude: z.number() })
      .nullable(),
    voltarAoInicio: z.boolean(),
    minutosPorVisita: z.number().int(),
    situacao: situacaoDeRotaSchema,
    distanciaM: z.number().int().nullable(),
    duracaoS: z.number().int().nullable(),
    estimativa: estimativaDeRotaSchema.nullable(),
    otimizadaEm: z.string().nullable(),
    /** Trajeto pelas ruas, `[longitude, latitude]`; nulo em linha reta */
    trajeto: z.array(z.tuple([z.number(), z.number()])).nullable(),
    iniciadaEm: z.string().nullable(),
    concluidaEm: z.string().nullable(),
    paradas: z.array(paradaDaRotaSchema),
    /** A pessoa pode alterar, executar e cancelar (alcance de `rotas.editar`) */
    podeEditar: z.boolean(),
  })
  .meta({ id: 'Rota' })
export type Rota = z.infer<typeof rotaSchema>

export const itemDeRotaSchema = z
  .object({
    id: z.uuid(),
    codigo: z.number().int(),
    nome: z.string(),
    data: z.string(),
    responsavel: pessoaSchema,
    situacao: situacaoDeRotaSchema,
    paradas: z.number().int(),
    visitadas: z.number().int(),
    puladas: z.number().int(),
    pendentes: z.number().int(),
    distanciaM: z.number().int().nullable(),
    duracaoS: z.number().int().nullable(),
    minutosPorVisita: z.number().int(),
    estimativa: estimativaDeRotaSchema.nullable(),
  })
  .meta({ id: 'ItemDeRota' })
export type ItemDeRota = z.infer<typeof itemDeRotaSchema>

export const consultaDeRotasSchema = z
  .object({
    de: dataSchema.optional(),
    ate: dataSchema.optional(),
    responsavelId: z.uuid().optional(),
    situacao: situacaoDeRotaSchema.optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
export type ConsultaDeRotas = z.infer<typeof consultaDeRotasSchema>

export const listaDeRotasSchema = z
  .object({ itens: z.array(itemDeRotaSchema), total: z.number().int() })
  .meta({ id: 'ListaDeRotas' })
export type ListaDeRotas = z.infer<typeof listaDeRotasSchema>

export const adicionarParadasSchema = z
  .object({ empresaIds: z.array(z.uuid()).min(1).max(500) })
  .strict()
  .meta({ id: 'AdicionarParadasEntrada' })
export type AdicionarParadasEntrada = z.infer<typeof adicionarParadasSchema>

export const paradasAdicionadasSchema = z
  .object({
    rota: rotaSchema,
    adicionadas: z.number().int(),
    /** Já estavam na rota */
    jaNaRota: z.number().int(),
    /** Sem coordenada, ou que o responsável da rota não vê */
    ignoradas: z.number().int(),
    /** Passaram do limite de paradas */
    excedentes: z.number().int(),
  })
  .meta({ id: 'ParadasAdicionadas' })
export type ParadasAdicionadas = z.infer<typeof paradasAdicionadasSchema>

export const pularParadaSchema = z
  .object({ motivo: z.string().trim().min(1, 'diga por que a parada foi pulada').max(200) })
  .strict()
  .meta({ id: 'PularParadaEntrada' })
export type PularParadaEntrada = z.infer<typeof pularParadaSchema>

/** As rotas em aberto em que a empresa é parada (o "Na rota · parada N" do mapa). */
export const rotaDaEmpresaSchema = z
  .object({
    rotaId: z.uuid(),
    codigo: z.number().int(),
    nome: z.string(),
    data: z.string(),
    ordem: z.number().int(),
    situacaoParada: situacaoDeParadaSchema,
  })
  .meta({ id: 'RotaDaEmpresa' })
export type RotaDaEmpresa = z.infer<typeof rotaDaEmpresaSchema>

// ---- Estimativa em linha reta (sem o serviço de rotas) ----

/** Desvio médio das ruas sobre a linha reta e velocidade média urbana: só para a estimativa sem o OSRM. */
export const FATOR_DE_DESVIO = 1.3
export const VELOCIDADE_MEDIA_KMH = 40

export function distanciaEmLinhaRetaM(a: Coordenada, b: Coordenada): number {
  const r = 6_371_000
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Um trecho estimado: distância com o desvio médio e o tempo pela velocidade média. */
export function trechoEstimado(
  a: Coordenada,
  b: Coordenada,
): { distanciaM: number; duracaoS: number } {
  const distanciaM = Math.round(distanciaEmLinhaRetaM(a, b) * FATOR_DE_DESVIO)
  return { distanciaM, duracaoS: Math.round(distanciaM / ((VELOCIDADE_MEDIA_KMH * 1000) / 3600)) }
}

/**
 * Ordem em linha reta: vizinho mais próximo a partir do início (ou da primeira parada, sem início) e depois
 * 2-opt até não melhorar. Devolve os índices de `paradas` na ordem de visita. Com 30 paradas é instantâneo.
 */
export function ordemEmLinhaReta(
  inicio: Coordenada | null,
  paradas: readonly Coordenada[],
  voltar: boolean,
): number[] {
  const n = paradas.length
  if (n <= 1) return paradas.map((_, i) => i)
  const d = (i: number, j: number) => distanciaEmLinhaRetaM(paradas[i]!, paradas[j]!)
  const doInicio = (i: number) => (inicio ? distanciaEmLinhaRetaM(inicio, paradas[i]!) : 0)
  const custo = (ordem: number[]) => {
    let total = doInicio(ordem[0]!)
    for (let k = 1; k < ordem.length; k++) total += d(ordem[k - 1]!, ordem[k]!)
    if (voltar && inicio) total += doInicio(ordem[ordem.length - 1]!)
    return total
  }
  const restantes = new Set(paradas.map((_, i) => i))
  const ordem: number[] = []
  let atual: number | null = null
  if (!inicio) {
    ordem.push(0)
    restantes.delete(0)
    atual = 0
  }
  while (restantes.size > 0) {
    let melhor = -1
    let melhorD = Infinity
    for (const i of restantes) {
      const di = atual === null ? doInicio(i) : d(atual, i)
      if (di < melhorD) {
        melhorD = di
        melhor = i
      }
    }
    ordem.push(melhor)
    restantes.delete(melhor)
    atual = melhor
  }
  // 2-opt: inverte trechos enquanto encurtar (sem início, a primeira parada fica fixa)
  const primeiro = inicio ? 0 : 1
  let melhorou = true
  let melhorCusto = custo(ordem)
  while (melhorou) {
    melhorou = false
    for (let i = primeiro; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const candidata = [
          ...ordem.slice(0, i),
          ...ordem.slice(i, j + 1).reverse(),
          ...ordem.slice(j + 1),
        ]
        const c = custo(candidata)
        if (c < melhorCusto - 1) {
          ordem.splice(0, n, ...candidata)
          melhorCusto = c
          melhorou = true
        }
      }
    }
  }
  return ordem
}

// ---- Navegação (links) ----

/** Paradas intermediárias por link do Google Maps: 3 no navegador do celular, 9 nos demais (G0, seção 7). */
export const PARADAS_INTERMEDIARIAS_DO_GOOGLE = { celular: 3, computador: 9 } as const

const latLon = (c: Coordenada) => `${c.latitude},${c.longitude}`

export interface TrechoDeNavegacao {
  rotulo: string
  url: string
  /** Paradas do trecho, numeradas a partir de 1 (a volta ao início não conta) */
  primeiraParada: number
  ultimaParada: number
}

/**
 * Links de direções do Google Maps em trechos. Sem `origem`, o primeiro trecho começa onde o aparelho está
 * (o Google usa a posição atual). Com `destinoFinal`, o último trecho termina nele (a volta ao início).
 */
export function trechosDoGoogleMaps(entrada: {
  origem: Coordenada | null
  paradas: readonly Coordenada[]
  destinoFinal: Coordenada | null
  celular: boolean
}): TrechoDeNavegacao[] {
  const { origem, paradas, destinoFinal, celular } = entrada
  if (paradas.length === 0) return []
  const porTrecho = PARADAS_INTERMEDIARIAS_DO_GOOGLE[celular ? 'celular' : 'computador'] + 1 // intermediárias + destino
  const pontos = paradas.map((c, i) => ({ c, numero: i + 1 }))
  const alvos: { c: Coordenada; numero: number | null }[] = [...pontos]
  if (destinoFinal) alvos.push({ c: destinoFinal, numero: null })
  const trechos: TrechoDeNavegacao[] = []
  let de: Coordenada | null = origem
  for (let i = 0; i < alvos.length; i += porTrecho) {
    const fatia = alvos.slice(i, i + porTrecho)
    const destino = fatia[fatia.length - 1]!
    const intermediarias = fatia.slice(0, -1)
    const p = new URLSearchParams({
      api: '1',
      travelmode: 'driving',
      destination: latLon(destino.c),
    })
    if (de) p.set('origin', latLon(de))
    if (intermediarias.length) p.set('waypoints', intermediarias.map((x) => latLon(x.c)).join('|'))
    const numeros = fatia.map((x) => x.numero).filter((x): x is number => x !== null)
    const primeira = numeros[0] ?? paradas.length
    const ultima = numeros[numeros.length - 1] ?? paradas.length
    trechos.push({
      rotulo:
        numeros.length === 0
          ? `Trecho ${trechos.length + 1} (volta ao início)`
          : `Trecho ${trechos.length + 1} (paradas ${primeira}${ultima !== primeira ? `–${ultima}` : ''}${destino.numero === null ? ' e volta' : ''})`,
      url: `https://www.google.com/maps/dir/?${p.toString().replaceAll('%2C', ',').replaceAll('%7C', '|')}`,
      primeiraParada: primeira,
      ultimaParada: ultima,
    })
    de = destino.c
  }
  return trechos
}

/** Waze: um destino por vez (não há paradas intermediárias documentadas). */
export const linkDoWaze = (c: Coordenada): string =>
  `https://waze.com/ul?ll=${latLon(c)}&navigate=yes`

/** "199 km" / "850 m" */
export function formatarDistancia(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: m < 10_000 ? 1 : 0 })} km`
}

/** "14 h 20 min" / "35 min" */
export function formatarDuracao(s: number | null | undefined): string {
  if (s === null || s === undefined) return '—'
  const min = Math.round(s / 60)
  const h = Math.floor(min / 60)
  const resto = min % 60
  if (h === 0) return `${resto} min`
  return resto === 0 ? `${h} h` : `${h} h ${resto} min`
}

/** Tempo total da rota: deslocamento + paradas × minutos por visita. */
export const duracaoTotalS = (
  deslocamentoS: number | null,
  paradas: number,
  minutosPorVisita: number,
) => (deslocamentoS ?? 0) + paradas * minutosPorVisita * 60
