import { useQuery } from '@tanstack/react-query'

import { useServicos } from '@/auth/contexto'
import { type ApoioDasVisitas, apoioOffline, guardarApoio } from '@/lib/offline/visitas'

export const chaveDoApoio = ['visitas', 'apoio'] as const

/**
 * Resultados, modelos, configuração do check-in, tipos de atividade e verticais: o que o relatório
 * precisa. Com sinal, vem da API e fica guardado no aparelho (cifrado, 7 dias); sem sinal, vem de lá.
 */
export function useApoioDasVisitas() {
  const servicos = useServicos()
  return useQuery({
    queryKey: chaveDoApoio,
    retry: false,
    networkMode: 'always',
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ApoioDasVisitas> => {
      const [resultados, modelos, configuracao] = await Promise.all([
        servicos.visitas.resultados.listar(),
        servicos.visitas.modelos.listar(),
        servicos.visitas.configuracao(),
      ])
      if (resultados.ok && modelos.ok && configuracao.ok) {
        // tipos e verticais só quando algum modelo tem "próximo passo" ou "dados da empresa: vertical"
        const campos = modelos.dados.flatMap((m) => m.versaoAtual.campos)
        const [tipos, verticais] = await Promise.all([
          campos.some((c) => c.tipo === 'proximo_passo')
            ? servicos.cadastros.tiposAtividade.listar()
            : null,
          campos.some((c) => c.tipo === 'dados_empresa' && c.campoEmpresa === 'vertical_id')
            ? servicos.cadastros.verticais.listar()
            : null,
        ])
        const apoio: ApoioDasVisitas = {
          resultados: resultados.dados.filter((r) => r.ativo),
          modelos: modelos.dados,
          configuracao: configuracao.dados,
          tiposAtividade: tipos?.ok
            ? tipos.dados.filter((t) => t.ativo).map((t) => ({ id: t.id, nome: t.nome }))
            : [],
          verticais: verticais?.ok
            ? verticais.dados.filter((v) => v.ativo).map((v) => ({ id: v.id, nome: v.nome }))
            : [],
        }
        await guardarApoio(apoio).catch(() => undefined)
        return apoio
      }
      const guardado = await apoioOffline().catch(() => null)
      if (guardado) return guardado
      const erro = [resultados, modelos, configuracao].find((r) => !r.ok)
      throw new Error(
        erro && !erro.ok ? erro.erro.mensagem : 'Não consegui carregar os resultados da visita.',
      )
    },
  })
}
