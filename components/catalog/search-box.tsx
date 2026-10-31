'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/** Campo Buscar del catálogo: vive en la URL (?q=…) y se actualiza mientras escribes (SRCH-02) */
export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const go = (text: string) => {
    clearTimeout(timer.current)
    const q = text.trim()
    startTransition(() => router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, { scroll: false }))
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <form
      role="search"
      className="relative max-w-md"
      onSubmit={(e) => {
        e.preventDefault()
        go(value)
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          clearTimeout(timer.current)
          const text = e.target.value
          timer.current = setTimeout(() => go(text), 250)
        }}
        placeholder="Buscar películas y series"
        aria-label="Buscar"
        maxLength={100}
        className={cn(
          'h-10 w-full rounded-full border border-field bg-card/50 pl-9 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none',
          'focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/40 [&::-webkit-search-cancel-button]:hidden'
        )}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2">
        {isPending ? (
          <Spinner className="h-4 w-4" />
        ) : (
          value && (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                setValue('')
                go('')
              }}
            >
              <X className="h-4 w-4" />
            </button>
          )
        )}
      </span>
    </form>
  )
}
