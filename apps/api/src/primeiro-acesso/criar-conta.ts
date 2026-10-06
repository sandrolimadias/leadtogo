import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { parseArgs } from 'node:util'

import { primeiroAcessoSchema } from '@leadtogo/shared'
import { NestFactory } from '@nestjs/core'

import { AppModule } from '../app.module.js'
import { carregarConfiguracao, ErroConfiguracao } from '../configuracao/configuracao.js'
import { ErroApi } from '../http/erro-api.js'
import { PrimeiroAcessoService } from './primeiro-acesso.service.js'

export const AJUDA = `Cria a primeira conta: conta dona, empresa, configurações e administrador.
Faz o mesmo fluxo do POST /v1/primeiro-acesso, mas não depende de PRIMEIRO_ACESSO (serve para
criar a primeira conta em produção, com o endpoint fechado). O e-mail do administrador já nasce
confirmado.

Uso:
  node dist/criar-conta.js --nome "Ana Souza" --email ana@empresa.com.br \\
       --empresa "Empresa Exemplo Ltda" [--cnpj 12.ABC.345/01DE-35] \\
       [--nome-fantasia "Exemplo"] [--conta "Grupo Exemplo"]

A senha NÃO vai em argumento (ficaria no histórico do shell). Informe por:
  - prompt oculto (rodando num terminal);
  - CRIAR_CONTA_SENHA=... na linha de comando; ou
  - uma linha lida da entrada padrão (echo "$SENHA" | node dist/criar-conta.js ...).

Códigos de saída: 0 criada; 1 falha (ex.: e-mail ou CNPJ já cadastrado); 2 dados inválidos.`

export interface EntradaSaida {
  /** Escreve uma linha na saída padrão */
  imprimir: (linha: string) => void
  /** Escreve uma linha na saída de erro */
  imprimirErro: (linha: string) => void
  /** Lê a senha (prompt oculto no terminal, ou uma linha da entrada padrão) */
  lerSenha: () => Promise<string>
}

/** Pergunta a senha sem mostrá-la, ou lê uma linha da entrada padrão quando não é um terminal. */
export async function lerSenhaDoTerminal(): Promise<string> {
  const interativo = process.stdin.isTTY
  const mudo = new Writable({
    write(_pedaco, _codificacao, pronto) {
      pronto() // engole o que o readline escreveria (a senha digitada)
    },
  })
  const rl = createInterface({
    input: process.stdin,
    output: interativo ? mudo : undefined,
    terminal: Boolean(interativo),
  })
  try {
    if (interativo) process.stderr.write('Senha do administrador (não aparece): ')
    // Se a entrada acabar sem linha (pipe vazio), devolve vazio e a validação recusa
    const senha = await new Promise<string>((resolver) => {
      rl.once('line', resolver)
      rl.once('close', () => resolver(''))
    })
    if (interativo) process.stderr.write('\n')
    return senha
  } finally {
    rl.close()
  }
}

/** Executa o comando e devolve o código de saída. Recebe tudo por parâmetro para poder ser testado. */
export async function executarCriarConta(
  argv: string[],
  env: NodeJS.ProcessEnv,
  io: EntradaSaida,
): Promise<number> {
  let opcoes
  try {
    opcoes = parseArgs({
      args: argv,
      options: {
        nome: { type: 'string' },
        email: { type: 'string' },
        empresa: { type: 'string' },
        cnpj: { type: 'string' },
        'nome-fantasia': { type: 'string' },
        conta: { type: 'string' },
        ajuda: { type: 'boolean', short: 'h' },
      },
      strict: true,
    }).values
  } catch (erro) {
    io.imprimirErro(`${erro instanceof Error ? erro.message : String(erro)}\n\n${AJUDA}`)
    return 2
  }
  if (opcoes.ajuda) {
    io.imprimir(AJUDA)
    return 0
  }

  const senha = env['CRIAR_CONTA_SENHA'] ?? (await io.lerSenha())
  const dados = primeiroAcessoSchema.safeParse({
    nome: opcoes.nome,
    email: opcoes.email,
    senha,
    empresa: {
      razaoSocial: opcoes.empresa,
      nomeFantasia: opcoes['nome-fantasia'],
      cnpj: opcoes.cnpj,
    },
    contaNome: opcoes.conta,
  })
  if (!dados.success) {
    io.imprimirErro('Dados inválidos:')
    for (const problema of dados.error.issues) {
      // nunca ecoa a senha: só o nome do campo e o motivo
      io.imprimirErro(`  - ${problema.path.join('.') || '(geral)'}: ${problema.message}`)
    }
    return 2
  }

  let config
  try {
    config = carregarConfiguracao(env)
  } catch (erro) {
    io.imprimirErro(erro instanceof ErroConfiguracao ? erro.message : String(erro))
    return 1
  }

  const app = await NestFactory.createApplicationContext(AppModule.registrar(config), {
    logger: ['error', 'warn'],
  })
  try {
    const r = await app.get(PrimeiroAcessoService).criar(dados.data, { emailVerificado: true })
    io.imprimir('Conta criada.')
    io.imprimir(`  administrador: ${dados.data.nome} <${dados.data.email}> (e-mail já confirmado)`)
    io.imprimir(`  empresa:       ${dados.data.empresa.razaoSocial}`)
    io.imprimir(
      `  ids:           usuário ${r.usuarioId} · conta ${r.contaId} · empresa ${r.tenantId}`,
    )
    io.imprimir(
      'Entre com o e-mail e a senha informados; o administrador precisará ativar o 2FA no primeiro acesso.',
    )
    return 0
  } catch (erro) {
    io.imprimirErro(
      `Falha: ${erro instanceof ErroApi ? erro.message : 'erro inesperado (veja os logs)'}`,
    )
    if (!(erro instanceof ErroApi))
      io.imprimirErro(erro instanceof Error ? (erro.stack ?? erro.message) : String(erro))
    return 1
  } finally {
    await app.close()
  }
}
