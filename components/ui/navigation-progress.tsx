'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Barra fina arriba mientras carga cualquier navegación interna (LOAD-06).
 *
 * El App Router no avisa cuándo empieza una navegación: se escucha el clic en cualquier <a> de
 * la app (fase de captura, antes de que <Link> lo cancele) y la barra queda ligada a la URL
 * desde la que se salió. En cuanto la URL cambia, deja de coincidir y la barra desaparece sola.
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const current = search ? `${pathname}?${search}` : pathname
  const [leaving, setLeaving] = useState<string | null>(null)

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest('a')
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return
      const url = new URL(link.href, location.href)
      if (url.origin !== location.origin) return
      // A la misma página (o solo a un #ancla): no hay navegación que esperar
      if (url.pathname === location.pathname && url.search === location.search) return
      setLeaving(location.pathname + location.search)
    }
    // Formularios GET (p. ej. el código de la TV en /link): también son navegaciones
    function onSubmit(event: SubmitEvent) {
      const form = event.target as HTMLFormElement
      if (form.method.toLowerCase() !== 'get' || typeof form.getAttribute('action') !== 'string') return
      if (new URL(form.action, location.href).origin !== location.origin) return
      setLeaving(location.pathname + location.search)
    }
    window.addEventListener('click', onClick, true)
    window.addEventListener('submit', onSubmit)
    return () => {
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('submit', onSubmit)
    }
  }, [])

  if (leaving === null || leaving !== current) return null

  return (
    <div
      role="progressbar"
      aria-label="Cargando página"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
    >
      <div className="nav-progress h-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
    </div>
  )
}
