/** Textos dos e-mails da API (pt-BR). Só texto simples + HTML mínimo; nenhum recurso externo. */

export interface ModeloDeEmail {
  assunto: string
  texto: string
  html: string
}

const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function montar(
  assunto: string,
  saudacao: string,
  paragrafos: string[],
  botao: { texto: string; link: string },
  rodape: string,
  assinatura = 'Leadtogo',
): ModeloDeEmail {
  const texto = [
    saudacao,
    '',
    ...paragrafos,
    '',
    `${botao.texto}: ${botao.link}`,
    '',
    rodape,
    '',
    `— ${assinatura}`,
  ].join('\n')
  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:sans-serif;line-height:1.5;color:#1f2937">
<p>${escapar(saudacao)}</p>
${paragrafos.map((p) => `<p>${escapar(p)}</p>`).join('\n')}
<p><a href="${escapar(botao.link)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">${escapar(botao.texto)}</a></p>
<p style="font-size:13px;color:#6b7280">Se o botão não funcionar, copie este endereço: ${escapar(botao.link)}</p>
<p style="font-size:13px;color:#6b7280">${escapar(rodape)}</p>
<p style="font-size:13px;color:#6b7280">— ${escapar(assinatura)}</p></body></html>`
  return { assunto, texto, html }
}

export function emailRedefinirSenha(nome: string, link: string): ModeloDeEmail {
  return montar(
    'Redefinir sua senha no Leadtogo',
    `Olá, ${nome}.`,
    [
      'Recebemos um pedido para redefinir a senha da sua conta. O link vale por 1 hora e só pode ser usado uma vez.',
    ],
    { texto: 'Redefinir senha', link },
    'Se não foi você, ignore este e-mail: a sua senha continua a mesma.',
  )
}

export function emailVerificarEmail(nome: string, link: string): ModeloDeEmail {
  return montar(
    'Confirme seu e-mail no Leadtogo',
    `Olá, ${nome}.`,
    ['Confirme o seu e-mail para entrar no Leadtogo. O link vale por 1 hora.'],
    { texto: 'Confirmar e-mail', link },
    'Se você não criou uma conta no Leadtogo, ignore este e-mail.',
  )
}

const ROTULO_PAPEL: Record<string, string> = {
  admin: 'administrador',
  gestor: 'gestor',
  vendedor: 'vendedor',
}

export function emailConvite(dados: {
  empresa: string
  convidadoPor: string
  papel: string
  /** Nome do perfil de acesso; sem ele, vale o rótulo do papel (legado) */
  perfil?: string | null
  link: string
}): ModeloDeEmail {
  const como = dados.perfil
    ? `com o perfil ${dados.perfil}`
    : `como ${ROTULO_PAPEL[dados.papel] ?? dados.papel}`
  return montar(
    `Convite para a ${dados.empresa} no Leadtogo`,
    'Olá!',
    [
      `${dados.convidadoPor} convidou você para a equipe da empresa ${dados.empresa} no Leadtogo, ${como}.`,
      'O convite vale por 7 dias e só pode ser usado uma vez.',
    ],
    { texto: 'Aceitar convite', link: dados.link },
    'Se você não esperava este convite, ignore este e-mail: nada será criado sem o seu aceite.',
  )
}

/** Aviso de um chamado: o título, o assunto, a prévia da mensagem (se houver) e o link para abrir. */
export function emailChamado(p: {
  nome: string
  titulo: string
  assunto: string
  previa: string | null
  autor: string | null
  link: string
}): ModeloDeEmail {
  const paragrafos = [p.assunto]
  if (p.previa) paragrafos.push(`${p.autor ?? 'Alguém'} escreveu: ${p.previa}`)
  return montar(
    p.titulo,
    `Olá, ${p.nome}.`,
    paragrafos,
    { texto: 'Abrir o chamado', link: p.link },
    'Você recebe este aviso porque participa deste chamado no Leadtogo.',
  )
}

// ---- Portal do cliente: sem senha, o link é a chave (uso único, abre uma página com botão de confirmação) ----

export function emailPortalConvite(p: {
  nome: string
  portal: string
  empresa: string
  convidadoPor: string
  link: string
}): ModeloDeEmail {
  return montar(
    `Seu acesso ao ${p.portal}`,
    `Olá, ${p.nome}.`,
    [
      `${p.convidadoPor} deu a você acesso ao ${p.portal} da ${p.empresa}, onde você abre e acompanha chamados com a equipe.`,
      'O convite vale por 7 dias e só pode ser usado uma vez. Não há senha: na próxima vez, peça um novo link de entrada.',
    ],
    { texto: 'Confirmar acesso', link: p.link },
    'Se você não esperava este convite, ignore este e-mail: nada será ativado sem a sua confirmação.',
    p.portal,
  )
}

export function emailPortalEntrada(p: {
  nome: string
  portal: string
  link: string
}): ModeloDeEmail {
  return montar(
    `Seu link de entrada no ${p.portal}`,
    `Olá, ${p.nome}.`,
    ['Use o botão abaixo para entrar. O link vale por 15 minutos e só pode ser usado uma vez.'],
    { texto: 'Entrar no portal', link: p.link },
    'Se não foi você quem pediu, ignore este e-mail: ninguém entra sem este link.',
    p.portal,
  )
}

export function emailPortalTrocaDeEmail(p: {
  nome: string
  portal: string
  link: string
}): ModeloDeEmail {
  return montar(
    `Confirme o novo e-mail do ${p.portal}`,
    `Olá, ${p.nome}.`,
    [
      'Recebemos um pedido para usar este endereço no seu acesso ao portal. O link vale por 1 hora e só pode ser usado uma vez.',
    ],
    { texto: 'Confirmar novo e-mail', link: p.link },
    'Se não foi você, ignore este e-mail: o seu acesso continua no endereço anterior.',
    p.portal,
  )
}

/** Aviso de chamado para o CLIENTE do portal: sem senha, o link abre o chamado (pede o link de entrada se preciso). */
export function emailPortalChamado(p: {
  nome: string
  portal: string
  titulo: string
  assunto: string
  previa: string | null
  autor: string | null
  link: string
}): ModeloDeEmail {
  const paragrafos = [p.assunto]
  if (p.previa) paragrafos.push(`${p.autor ?? 'A equipe'} escreveu: ${p.previa}`)
  return montar(
    p.titulo,
    `Olá, ${p.nome}.`,
    paragrafos,
    { texto: 'Abrir o chamado', link: p.link },
    `Você recebe este aviso porque abriu ou acompanha este chamado no ${p.portal}.`,
    p.portal,
  )
}

/** Aviso ao cliente sobre um evento da agenda do portal (vaga confirmada, cancelamento, lembrete). */
export function emailPortalEvento(p: {
  nome: string
  portal: string
  titulo: string
  linhas: string[]
  link: string
}): ModeloDeEmail {
  return montar(
    p.titulo,
    `Olá, ${p.nome}.`,
    p.linhas,
    { texto: 'Abrir a agenda', link: p.link },
    `Você recebe este aviso porque tem presença ou lista de espera num evento da agenda do ${p.portal}.`,
    p.portal,
  )
}
