'use client'

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { LazyMotion, MotionConfig, domAnimation, m } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = { id: string; title: string; subtitle?: string; className?: string; children: ReactNode }

const ARROW =
  'hidden h-9 w-9 items-center justify-center rounded-full border border-border bg-card/80 text-foreground transition-opacity hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-0 sm:inline-flex'

/**
 * Fila del catálogo que se desliza (CAT-08): scroll horizontal nativo con imán por tarjeta (dedo,
 * trackpad, rueda y Tab funcionan solos) y flechas para avanzar una pantalla en escritorio.
 * Entra con un desvanecido al llegar a la vista.
 */
export function CatalogRow({ id, title, subtitle, className, children }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  const update = useCallback(() => {
    const el = scroller.current
    if (!el) return
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }, [])

  useEffect(() => {
    update()
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [update])

  const scrollBy = (direction: 1 | -1) => {
    const el = scroller.current
    if (!el) return
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: smooth ? 'smooth' : 'auto' })
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <m.section
          aria-labelledby={`${id}-heading`}
          className={cn('space-y-3', className)}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <div className="flex items-end justify-between gap-3">
            <div className="space-y-1">
              <h2 id={`${id}-heading`} className="text-xl font-bold tracking-tight first-letter:uppercase sm:text-2xl">
                {title}
              </h2>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" className={ARROW} onClick={() => scrollBy(-1)} disabled={edges.start} aria-label={`Anteriores de ${title}`}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" className={ARROW} onClick={() => scrollBy(1)} disabled={edges.end} aria-label={`Más de ${title}`}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div
            ref={scroller}
            onScroll={update}
            data-testid="catalog-row"
            className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:gap-4 sm:px-6 [&::-webkit-scrollbar]:hidden"
          >
            {Children.map(children, (child) => (
              <div className="w-[42%] shrink-0 snap-start sm:w-[30%] md:w-[23%] lg:w-[18%]">{child}</div>
            ))}
          </div>
        </m.section>
      </MotionConfig>
    </LazyMotion>
  )
}
