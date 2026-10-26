import type { Me } from '@leadtogo/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { registrarAoPerderAEmpresa } from '@/api/cliente'
import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'
import { toast } from '@leadtogo/ui/toast'

import { useTrocarEmpresa } from './empresas'
import { nomeDaEmpresa } from './utilidades'

/**
 * Acesso à empresa ativa encerrado (a pessoa foi desativada com a sessão aberta): avisa com clareza e leva
 * para outra empresa dela, se houver, ou para o login. Dispara por dois caminhos: o 403
 * `empresa_ativa_invalida` de qualquer chamada à API e o `/me` que já mostra a empresa ativa sem vínculo
 * (ao recarregar a página).
 */
export function useAcessoEncerrado(me: Me | null | undefined) {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const trocarEmpresa = useTrocarEmpresa()
  const ocupado = useRef(false)
  // o nome da empresa perdida vem da última sessão em que ela ainda era a ativa
  const nomeDaPerdida = useRef<string | undefined>(undefined)
  useEffect(() => {
    const ativa = me?.empresas.find((e) => e.ativa)
    if (ativa) nomeDaPerdida.current = nomeDaEmpresa(ativa)
  }, [me])

  const tratar = useRef(async () => {})
  useEffect(() => {
    tratar.current = async () => {
      if (ocupado.current) return
      ocupado.current = true
      try {
        const nome = nomeDaPerdida.current
        toast.warning(
          nome ? `Seu acesso a ${nome} foi encerrado` : 'Seu acesso a esta empresa foi encerrado',
          {
            description: 'Um administrador desativou o seu acesso a esta empresa.',
          },
        )
        const atual = await servicos.me()
        const outra = atual?.empresas[0]
        if (atual && outra) {
          if (await trocarEmpresa(outra.id, { avisar: false })) {
            toast.info(`Você está agora em ${nomeDaEmpresa(outra)}`)
            await navegar({ to: '/' })
          }
          return
        }
        // sem outra empresa: a sessão não leva a lugar nenhum
        await servicos.sair()
        await queryClient.invalidateQueries({ queryKey: chaveDoMe })
        await navegar({ to: '/login', search: { redirect: undefined } })
      } finally {
        ocupado.current = false
      }
    }
  })

  useEffect(() => {
    registrarAoPerderAEmpresa(() => tratar.current())
    return () => registrarAoPerderAEmpresa(null)
  }, [])

  const semVinculo = Boolean(me?.empresaAtivaId) && !me?.empresas.some((e) => e.ativa)
  useEffect(() => {
    if (semVinculo) void tratar.current()
  }, [semVinculo])
}
