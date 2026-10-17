import type { FaltaNoEndereco } from '@leadtogo/shared'

/** Quem deu a posição (enum `geo_origem`). */
export type OrigemGeo = 'cnefe' | 'nominatim' | 'cep' | 'manual' | 'checkin'
/** Provedores consultados (enum `provedor_geo`). */
export type ProvedorGeo = 'cnefe' | 'nominatim' | 'cep'
export type PrecisaoGeo = 'exata' | 'aproximada'
export type AproximacaoGeo = 'interpolada' | 'rua' | 'cep_cidade'

/** O endereço que o geocodificador recebe: o da empresa, com o nome do município já resolvido. */
export interface EnderecoParaGeocodificar {
  cep: string | null
  tipoLogradouro: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  municipioCodigo: number | null
  municipioNome: string | null
}

/** Uma consulta feita a um provedor, para o registro de auditoria (`geo_consultas`). */
export interface ConsultaFeita {
  provedor: ProvedorGeo
  /** Texto normalizado que foi consultado */
  consulta: string
  resultado: 'achou' | 'nao_achou' | 'erro'
  precisao: PrecisaoGeo | null
  aproximacao: AproximacaoGeo | null
  latitude: number | null
  longitude: number | null
  /** Resposta resumida (só o que a decisão usou) */
  resposta: Record<string, unknown> | null
  /** Veio do cache de `geo_consultas`, não do provedor */
  doCache: boolean
}

export interface PosicaoGeo {
  latitude: number
  longitude: number
  precisao: PrecisaoGeo
  /** Nulo quando exata */
  aproximacao: AproximacaoGeo | null
  origem: OrigemGeo
  /** Texto normalizado consultado (vai para `geo_endereco_consultado`) */
  consultado: string
  detalhe: string
}

export type ResultadoDaGeocodificacao =
  | {
      situacao: 'posicionada'
      posicao: PosicaoGeo
      consultas: ConsultaFeita[]
      /** Rua e bairro vieram (em parte) do CEP; o cadastro da empresa não muda */
      completouPeloCep: boolean
    }
  | {
      situacao: 'a_confirmar'
      /** O que continua faltando depois de tentar o CEP */
      faltas: FaltaNoEndereco[]
      consultas: ConsultaFeita[]
      completouPeloCep: boolean
    }
  | {
      /** Todos os provedores falharam (rede, tempo): tenta de novo depois, sem marcar a empresa */
      situacao: 'indisponivel'
      consultas: ConsultaFeita[]
      completouPeloCep: boolean
    }
