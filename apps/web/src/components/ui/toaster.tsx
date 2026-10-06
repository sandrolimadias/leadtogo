import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { Toaster as Sonner } from 'sonner'

/**
 * Avisos temporários (Sonner) no visual do design system. Desktop: canto inferior direito, 380 px;
 * celular: acima da barra inferior, largura total − 24 px (a casca passa `mobileOffset`).
 */
export function Toaster({ celular = false }: { celular?: boolean }) {
  return (
    <Sonner
      position={celular ? 'bottom-center' : 'bottom-right'}
      duration={4500}
      visibleToasts={3}
      offset={16}
      mobileOffset={{ bottom: celular ? 84 : 16, left: 12, right: 12 }}
      icons={{
        success: <CircleCheck size={18} strokeWidth={1.75} className="text-success" />,
        error: <CircleAlert size={18} strokeWidth={1.75} className="text-danger" />,
        info: <Info size={18} strokeWidth={1.75} className="text-info" />,
        warning: <TriangleAlert size={18} strokeWidth={1.75} className="text-warning" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            '!w-[380px] max-w-full !rounded-md !border !border-border !bg-surface !p-3 !pl-4 !text-ink !shadow-lg',
          title: '!font-semibold !text-ink',
          description: '!text-[13px] !leading-[18px] !text-ink-muted',
        },
      }}
    />
  )
}
