import { z } from 'zod'

import { alcanceSchema } from './permissoes.js'

/** Papel do membro em uma empresa. */
export const papelMembroSchema = z.enum(['admin', 'gestor', 'vendedor'])
export type PapelMembro = z.infer<typeof papelMembroSchema>

/** Situação da empresa (`situacao_tenant`). Só `teste` e `ativo` podem ser usadas. */
export const situacaoEmpresaSchema = z.enum(['teste', 'ativo', 'suspenso', 'cancelado'])
export type SituacaoEmpresa = z.infer<typeof situacaoEmpresaSchema>

/** Uma empresa em que o usuário é membro, com o papel dele nela (GET /v1/me). */
export const empresaDoUsuarioSchema = z
  .object({
    id: z.uuid(),
    razaoSocial: z.string(),
    nomeFantasia: z.string().nullable(),
    /** Legado até a contração dos perfis de acesso: use `perfil` e `permissoes` */
    papel: papelMembroSchema,
    /** Perfil de acesso nesta empresa (null = nenhum: nenhuma permissão) */
    perfil: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    /** Permissões do perfil: `chave → alcance` (propria, equipe, todas) ou `true` */
    permissoes: z.record(z.string(), z.union([alcanceSchema, z.literal(true)])),
    situacao: situacaoEmpresaSchema,
    /** É a empresa ativa da sessão */
    ativa: z.boolean(),
  })
  .meta({ id: 'EmpresaDoUsuario' })
export type EmpresaDoUsuario = z.infer<typeof empresaDoUsuarioSchema>

/** Resposta de GET /v1/me. */
export const meRespostaSchema = z
  .object({
    usuario: z.object({
      id: z.uuid(),
      nome: z.string(),
      email: z.string(),
      emailVerificado: z.boolean(),
      twoFactorEnabled: z.boolean(),
    }),
    empresas: z.array(empresaDoUsuarioSchema),
    /**
     * Há empresas, mas nenhuma está ativa (várias e nenhuma usada antes, ou perdeu o vínculo com a
     * ativa): o front mostra o seletor de empresa.
     */
    precisaEscolherEmpresa: z.boolean(),
    /** Empresa ativa da sessão; null até o usuário escolher (POST /v1/sessao/empresa-ativa) */
    empresaAtivaId: z.uuid().nullable(),
    /** Dono ou administrador de alguma conta: tem o painel consolidado */
    administradorDeConta: z.boolean(),
    /**
     * Quem ainda não ativou o 2FA e a regra o exige agora (administrador de conta, ou a política da
     * empresa ativa para o papel dele): até ativar, a API só deixa passar este endpoint, a troca de
     * empresa, as rotas de 2FA e o logout.
     */
    doisFatoresPendente: z.boolean(),
    /**
     * Alguma regra (administrador de conta ou a política de qualquer empresa dele) exige 2FA dele:
     * enquanto for `true`, não pode desativar o 2FA.
     */
    doisFatoresObrigatorio: z.boolean(),
    /**
     * Por que o 2FA é obrigatório (null se não é): `conta` = é administrador da conta (sempre exigido);
     * `empresa` = a política de segurança de `empresaId` exige 2FA de quem tem o papel `papel` nela.
     */
    doisFatoresMotivo: z
      .object({
        origem: z.enum(['conta', 'empresa']),
        empresaId: z.uuid().nullable(),
        papel: papelMembroSchema.nullable(),
      })
      .nullable(),
  })
  .meta({ id: 'MeResposta' })
export type MeResposta = z.infer<typeof meRespostaSchema>

/** Corpo de POST /v1/sessao/empresa-ativa. */
export const empresaAtivaSchema = z
  .object({ empresaId: z.uuid('empresa inválida') })
  .strict()
  .meta({ id: 'EmpresaAtivaEntrada' })
export type EmpresaAtivaEntrada = z.infer<typeof empresaAtivaSchema>

/** Resposta de POST /v1/sessao/empresa-ativa. */
export const empresaAtivaRespostaSchema = z
  .object({ empresaAtivaId: z.uuid(), empresa: empresaDoUsuarioSchema })
  .meta({ id: 'EmpresaAtivaResposta' })
export type EmpresaAtivaResposta = z.infer<typeof empresaAtivaRespostaSchema>
