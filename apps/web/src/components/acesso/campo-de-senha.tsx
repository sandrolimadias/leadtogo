import { useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextField, type TextFieldProps } from '@leadtogo/ui/campos'

/** Campo de senha com "Mostrar/Ocultar". Mantém o tipo `password` por padrão (gerenciador de senhas). */
export function CampoDeSenha(props: Omit<TextFieldProps, 'type' | 'suffix'>) {
  const [visivel, setVisivel] = useState(false)
  return (
    <TextField
      {...props}
      type={visivel ? 'text' : 'password'}
      suffix={
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={visivel}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          onClick={() => setVisivel((v) => !v)}
        >
          {visivel ? 'Ocultar' : 'Mostrar'}
        </Button>
      }
    />
  )
}
