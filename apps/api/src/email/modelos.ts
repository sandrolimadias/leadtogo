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
    '— Leadtogo',
  ].join('\n')
  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:sans-serif;line-height:1.5;color:#1f2937">
<p>${escapar(saudacao)}</p>
${paragrafos.map((p) => `<p>${escapar(p)}</p>`).join('\n')}
<p><a href="${escapar(botao.link)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">${escapar(botao.texto)}</a></p>
<p style="font-size:13px;color:#6b7280">Se o botão não funcionar, copie este endereço: ${escapar(botao.link)}</p>
<p style="font-size:13px;color:#6b7280">${escapar(rodape)}</p>
<p style="font-size:13px;color:#6b7280">— Leadtogo</p></body></html>`
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
