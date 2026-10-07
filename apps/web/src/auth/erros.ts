import type { ErroDeAcesso } from './tipos'

/** Textos em pt-BR dos códigos do Better Auth (maiúsculos) e da API (minúsculos). */
const MENSAGENS: Record<string, string> = {
  // Better Auth
  INVALID_EMAIL_OR_PASSWORD: 'E-mail ou senha não conferem.',
  USER_NOT_FOUND: 'E-mail ou senha não conferem.',
  EMAIL_NOT_VERIFIED: 'Confirme seu e-mail para entrar. Enviamos um novo link.',
  INVALID_PASSWORD: 'Senha incorreta.',
  PASSWORD_TOO_SHORT: 'A senha deve ter pelo menos 10 caracteres.',
  PASSWORD_TOO_LONG: 'A senha deve ter no máximo 128 caracteres.',
  INVALID_TOKEN: 'Este link não vale mais. Peça um novo.',
  TOKEN_EXPIRED: 'Este link venceu. Peça um novo.',
  INVALID_CODE: 'Código incorreto ou vencido.',
  INVALID_BACKUP_CODE: 'Código de recuperação incorreto ou já usado.',
  OTP_HAS_EXPIRED: 'Código incorreto ou vencido.',
  DOIS_FATORES_OBRIGATORIO:
    'A verificação em duas etapas é obrigatória para você. Não dá para desativá-la.',
  CODIGO_OBRIGATORIO: 'Digite o código de 6 números do app autenticador.',
  TOTP_NOT_ENABLED: 'A verificação em duas etapas não está ativa nesta conta.',
  INVALID_TWO_FACTOR_COOKIE: 'A verificação venceu. Entre de novo para receber outra.',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'Muitas tentativas. Aguarde um minuto e tente de novo.',
  // API
  nao_autenticado: 'Sua sessão terminou. Entre de novo.',
  '2fa_obrigatorio': 'Ative a verificação em duas etapas para continuar.',
  convite_invalido: 'Este convite não vale mais. Peça um novo ao administrador.',
  login_necessario: 'Já existe uma conta com este e-mail. Entre nela para aceitar o convite.',
  convite_de_outro_email: 'Este convite é para outro e-mail. Entre com a conta convidada.',
  cadastro_necessario: 'Informe seu nome e uma senha para criar a conta.',
  ja_e_membro: 'Você já faz parte desta empresa.',
  primeiro_acesso_fechado:
    'O cadastro de novas contas está fechado. Peça um convite ao administrador.',
  email_ja_cadastrado: 'Já existe uma conta com este e-mail. Entre ou recupere a senha.',
  cnpj_ja_cadastrado: 'Já existe uma empresa com este CNPJ.',
  origem_nao_permitida:
    'Não foi possível concluir por este endereço. Abra o Leadtogo pelo link oficial.',
  servico_indisponivel: 'O serviço está indisponível agora. Tente de novo em alguns minutos.',
}

const GENERICA = 'Não foi possível concluir agora. Tente de novo em alguns minutos.'
const LIMITE = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
const SEM_REDE = 'Sem conexão com o servidor. Confira a internet e tente de novo.'

/** Corpo de erro do Better Auth (`{code, message}`) ou da API (`{erro, mensagem}`). */
interface CorpoDeErro {
  code?: string
  message?: string
  erro?: string
  mensagem?: string
}

/** Traduz a resposta de erro de qualquer das duas origens num erro de acesso em pt-BR. */
export function traduzirErro(status: number, corpo?: CorpoDeErro | null): ErroDeAcesso {
  const codigo = corpo?.code ?? corpo?.erro ?? `http_${status}`
  const conhecida = MENSAGENS[codigo]
  if (conhecida) return { codigo, mensagem: conhecida, status }
  if (status === 429) return { codigo: 'limite_de_tentativas', mensagem: LIMITE, status }
  // mensagens da API já são pt-BR e dizem o que fazer; as do Better Auth são em inglês e não passam
  if (corpo?.mensagem && corpo.erro) return { codigo, mensagem: corpo.mensagem, status }
  return { codigo, mensagem: GENERICA, status }
}

export function erroDeRede(): ErroDeAcesso {
  return { codigo: 'sem_rede', mensagem: SEM_REDE, status: 0 }
}
