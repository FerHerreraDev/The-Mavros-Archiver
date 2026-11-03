'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, useReducedMotion } from 'motion/react'
import { Pause, Play } from 'lucide-react'
import type { FeaturedItem } from '@/lib/data/catalog'
import { AddToList } from '@/components/lists/add-to-list'
import { PosterImage } from './poster-image'
import { cn } from '@/lib/utils'

type ListOption = { id: string; name: string; contains: boolean }
type Props = { items: FeaturedItem[]; lists: Record<string, ListOption[]> }

/** Cada cuánto cambia la destacada (CAT-07) */
export const FEATURED_INTERVAL_MS = 8000

/**
 * Portada (CAT-07): la imagen horizontal de las destacadas a todo lo ancho, con su logo (o el
 * título), datos, sinopsis, "Reproducir" y "Agregar a lista". Rota sola cada 8 s; se detiene con
 * el mouse o el foco encima, con el botón de pausa y con "reducir movimiento".
 */
export function FeaturedHero({ items, lists }: Props) {
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const reduceMotion = useReducedMotion()
  const paused = hovered || userPaused || !!reduceMotion
  const item = items[Math.min(index, items.length - 1)]

  useEffect(() => {
    if (paused || items.length < 2) return
    const timer = setTimeout(() => setIndex((i) => (i + 1) % items.length), FEATURED_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [index, paused, items.length])

  if (!item) return null

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <section
          aria-roledescription="carrusel"
          aria-label="Destacadas"
          data-testid="featured-hero"
          className="relative isolate"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHovered(false)}
        >
          {/* Fondo: solo esta capa recorta las esquinas (el menú de "Agregar a lista" puede salir) */}
          <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl border border-border bg-card">
            <AnimatePresence initial={false}>
              <m.div
                key={item.id}
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: 'easeInOut' }}
              >
                {/* Ken Burns: se aleja despacio. Animación CSS de transform: la mueve el compositor, no el hilo principal */}
                <div className="ken-burns absolute inset-0">
                  <PosterImage src={item.backdrop} thumbhash={item.backdropThumbhash} title="" sizes="(min-width: 1280px) 1232px, 100vw" />
                </div>
                {/* El color de la película tiñe la esquina del texto (TMDB-07) */}
                {item.accent && (
                  <div
                    aria-hidden
                    data-testid="featured-accent"
                    className="absolute inset-0 mix-blend-soft-light"
                    style={{ background: `radial-gradient(120% 100% at 0% 100%, ${item.accent} 0%, transparent 65%)` }}
                  />
                )}
              </m.div>
            </AnimatePresence>
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
            <div aria-hidden className="absolute inset-0 hidden bg-gradient-to-r from-background/90 via-background/40 to-transparent sm:block" />
          </div>

          <div className="flex min-h-[460px] flex-col justify-end gap-6 px-5 pb-6 pt-40 sm:min-h-[min(68vh,600px)] sm:px-10 sm:pb-10">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={item.id}
                aria-roledescription="destacada"
                aria-label={`${index + 1} de ${items.length}: ${item.title}`}
                className="max-w-xl space-y-4"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              >
                <h2 className="text-4xl font-black tracking-tight sm:text-6xl">
                  <Logo item={item} />
                </h2>
                <p className="text-xs font-mono uppercase tracking-wide text-foreground/80">{item.meta.join(' · ')}</p>
                {item.synopsis && <p className="line-clamp-2 text-sm leading-relaxed text-foreground/90 sm:line-clamp-3 sm:text-base">{item.synopsis}</p>}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Link
                    href={item.href}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    {item.kind === 'movie' ? 'Reproducir' : 'Ver serie'}
                  </Link>
                  {lists[item.id] && <AddToList target={item.kind === 'movie' ? { movieId: item.id } : { seriesId: item.id }} lists={lists[item.id]} />}
                </div>
              </m.div>
            </AnimatePresence>

            {items.length > 1 && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2" role="group" aria-label="Elegir destacada">
                  {items.map((it, i) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Ver destacada ${i + 1}: ${it.title}`}
                      aria-current={i === index ? 'true' : undefined}
                      className={cn(
                        'relative h-1.5 overflow-hidden rounded-full bg-foreground/25 transition-[width] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        i === index ? 'w-10' : 'w-4 hover:bg-foreground/50'
                      )}
                    >
                      {i === index && (
                        <m.span
                          key={`${index}-${paused}`}
                          className="absolute inset-0 origin-left rounded-full bg-foreground"
                          initial={{ scaleX: paused ? 1 : 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: paused ? 0 : FEATURED_INTERVAL_MS / 1000, ease: 'linear' }}
                        />
                      )}
                    </button>
                  ))}
                </div>
                {!reduceMotion && (
                  <button
                    type="button"
                    onClick={() => setUserPaused((v) => !v)}
                    aria-label={userPaused ? 'Reanudar destacadas' : 'Pausar destacadas'}
                    className="rounded-full p-1.5 text-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {userPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </MotionConfig>
    </LazyMotion>
  )
}

/** Logo del título (TMDB-06); sin logo o si no carga, el título en texto */
function Logo({ item }: { item: FeaturedItem }) {
  const [failed, setFailed] = useState(false)
  if (!item.logo || failed) return <span className="line-clamp-2 drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)]">{item.title}</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element -- logo con transparencia, tamaño natural acotado
    <img
      src={item.logo}
      alt={item.title}
      onError={() => setFailed(true)}
      className="max-h-24 w-auto max-w-[85%] object-contain object-left drop-shadow-[0_4px_24px_rgba(0,0,0,0.65)] sm:max-h-32"
    />
  )
}
