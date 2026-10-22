import {
  type Alcance,
  type ChaveDeSistema,
  PERMISSOES_DE_VER,
  PERMISSOES_PADRAO,
  type PermissoesDoPerfil,
  exige2faDaPoliticaAntiga,
} from '@leadtogo/shared'
import { describe, expect, it } from 'vitest'

/**
 * Equivalência: os três perfis de sistema reproduzem as decisões por papel que existiam antes da
 * Fase 1 (o levantamento de `papel` em apps/api/src). Cada linha é a regra antiga, escrita como
 * estava no código, e a permissão que a substitui. A suíte de integração (carteira, importação, geo)
 * confere o mesmo ponta a ponta quando cada módulo passa a ler o perfil.
 */
type Papel = ChaveDeSistema

/** As permissões do perfil de sistema, depois do backfill (com o interruptor antigo convertido) */
function perfil(papel: Papel, veTodas: boolean): PermissoesDoPerfil {
  const base = { ...PERMISSOES_PADRAO[papel] }
  if (papel === 'vendedor' && veTodas) for (const c of PERMISSOES_DE_VER) base[c] = 'todas'
  return base
}
const tem = (p: PermissoesDoPerfil, chave: string) => p[chave] !== undefined
const alcance = (p: PermissoesDoPerfil, chave: string): Alcance | undefined => {
  const v = p[chave]
  return v === undefined || v === true ? undefined : v
}

const regras: {
  regra: string
  antiga: (papel: Papel, veTodas: boolean) => boolean
  nova: (p: PermissoesDoPerfil) => boolean
}[] = [
  // carteira/regras-de-carteira.ts
  {
    regra: 'vê empresas de outros (veTodas)',
    antiga: (papel, veTodas) => papel !== 'vendedor' || veTodas,
    nova: (p) => alcance(p, 'empresas.ver') === 'todas',
  },
  {
    regra: 'edita empresa de outro (podeEditar)',
    antiga: (papel) => papel !== 'vendedor',
    nova: (p) => alcance(p, 'empresas.editar') === 'todas',
  },
  {
    regra: 'edita a própria empresa',
    antiga: () => true,
    nova: (p) => tem(p, 'empresas.editar'),
  },
  {
    regra: 'exclui empresa (podeExcluir)',
    antiga: (papel) => papel !== 'vendedor',
    nova: (p) => alcance(p, 'empresas.excluir') === 'todas',
  },
  {
    regra: 'transfere carteira (podeTransferir)',
    antiga: (papel) => papel !== 'vendedor',
    nova: (p) => tem(p, 'empresas.transferir'),
  },
  // carteira/regras-de-contato.ts e contatos.service.ts
  {
    regra: 'vê todos os contatos',
    antiga: (papel, veTodas) => papel !== 'vendedor' || veTodas,
    nova: (p) => alcance(p, 'contatos.ver') === 'todas',
  },
  {
    regra: 'edita contato de outra carteira',
    antiga: (papel) => papel !== 'vendedor',
    nova: (p) => alcance(p, 'contatos.editar') === 'todas',
  },
  {
    regra: 'exclui contato (podeExcluirContato)',
    antiga: (papel) => papel !== 'vendedor',
    nova: (p) => tem(p, 'contatos.excluir'),
  },
  {
    regra: 'cadastra contato sem empresa vinculada',
    antiga: (papel) => papel !== 'vendedor',
    nova: (p) => tem(p, 'contatos.criar_sem_empresa'),
  },
  // carteira/oportunidades-leitura.ts e oportunidades.service.ts
  {
    regra: 'vê oportunidades de outros',
    antiga: (papel, veTodas) => papel !== 'vendedor' || veTodas,
    nova: (p) => alcance(p, 'oportunidades.ver') === 'todas',
  },
  {
    regra: 'oportunidade excluível',
    antiga: (papel) => papel !== 'vendedor',
    nova: (p) => tem(p, 'oportunidades.excluir'),
  },
  {
    regra: 'escolhe outro responsável na oportunidade',
    antiga: (papel) => papel !== 'vendedor',
    nova: (p) => tem(p, 'oportunidades.atribuir_responsavel'),
  },
  // carteira/atividades-leitura.ts e atividades.service.ts
  {
    regra: 'vê atividades de outros',
    antiga: (papel, veTodas) => papel !== 'vendedor' || veTodas,
    nova: (p) => alcance(p, 'atividades.ver') === 'todas',
  },
  {
    regra: 'escolhe outro responsável na atividade',
    antiga: (papel) => papel !== 'vendedor',
    nova: (p) => tem(p, 'atividades.atribuir_responsavel'),
  },
  // importacao/* (previa, execucao, lotes, relatorio, executor-base)
  {
    regra: 'importa planilhas',
    antiga: (papel) => papel === 'admin' || papel === 'gestor',
    nova: (p) => tem(p, 'importacao.executar'),
  },
  // geolocalizacao/lotes-geo.service.ts, regioes.service.ts e mapa/mapa.service.ts
  {
    regra: 'geocodificação em lote',
    antiga: (papel) => papel === 'admin' || papel === 'gestor',
    nova: (p) => tem(p, 'geolocalizacao.lotes'),
  },
  {
    regra: 'regiões',
    antiga: (papel) => papel === 'admin',
    nova: (p) => tem(p, 'geolocalizacao.regioes'),
  },
  {
    regra: 'legenda do mapa',
    antiga: (papel) => papel === 'admin',
    nova: (p) => tem(p, 'geolocalizacao.legenda'),
  },
  // cadastros/cadastros.base.ts
  {
    regra: 'cadastros auxiliares',
    antiga: (papel) => papel === 'admin',
    nova: (p) => tem(p, 'cadastros.gerir'),
  },
  // convites/*
  {
    regra: 'vê o e-mail da equipe',
    antiga: (papel) => papel === 'admin' || papel === 'gestor',
    nova: (p) => tem(p, 'equipe.ver_emails'),
  },
  {
    regra: 'gere a equipe e vê o acesso',
    antiga: (papel) => papel === 'admin',
    nova: (p) => tem(p, 'equipe.gerir'),
  },
  {
    regra: 'troca o papel (agora o perfil) dos membros',
    antiga: (papel) => papel === 'admin',
    nova: (p) => tem(p, 'perfis.gerir'),
  },
  // configuracoes/*
  {
    regra: 'política de 2FA',
    antiga: (papel) => papel === 'admin',
    nova: (p) => tem(p, 'seguranca.gerir'),
  },
  {
    regra: 'regras da carteira',
    antiga: (papel) => papel === 'admin',
    nova: (p) => tem(p, 'carteira.configurar'),
  },
]

describe('equivalência: perfis de sistema × papéis antigos', () => {
  for (const papel of ['admin', 'gestor', 'vendedor'] as const) {
    for (const veTodas of [false, true]) {
      it(`${papel}, "vendedores veem todas" ${veTodas ? 'ligado' : 'desligado'}`, () => {
        const p = perfil(papel, veTodas)
        const divergentes = regras
          .filter((r) => r.antiga(papel, veTodas) !== r.nova(p))
          .map((r) => r.regra)
        expect(divergentes).toEqual([])
      })
    }
  }

  it('2FA: a política antiga por papel e o flag do perfil exigem as mesmas pessoas', () => {
    const antiga = {
      admin: ['admin'],
      admin_gestor: ['admin', 'gestor'],
      todos: ['admin', 'gestor', 'vendedor'],
    }
    for (const [politica, papeis] of Object.entries(antiga)) {
      const flags = exige2faDaPoliticaAntiga(politica as keyof typeof antiga)
      for (const papel of ['admin', 'gestor', 'vendedor'] as const) {
        expect(flags[papel]).toBe(papeis.includes(papel))
      }
    }
  })
})
