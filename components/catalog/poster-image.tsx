'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Film } from 'lucide-react'
import { thumbhashDataUrl } from '@/lib/poster/placeholder'
import { cn } from '@/lib/utils'

type Props = { src: string | null; thumbhash: string | null; title: string; sizes: string }

/**
 * Póster con vista previa instantánea (LOAD-02): ThumbHash borroso de fondo y la imagen real
 * fundiéndose encima al cargar. Si la imagen falla queda la tarjeta con el título.
 */
export function PosterImage({ src, thumbhash, title, sizes }: Props) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')
  // El hash viaja en las props (~30 caracteres) y la imagen se arma aquí: el data URL no se duplica en el payload RSC
  const placeholder = useMemo(() => thumbhashDataUrl(thumbhash), [thumbhash])

  if (!src || state === 'error') return <PosterFallback title={title} />

  return (
    <>
      {placeholder && (
        <div
          aria-hidden
          data-testid="poster-placeholder"
          className="absolute inset-0 scale-110 bg-cover bg-center blur-md"
          style={{ backgroundImage: `url(${placeholder})` }}
        />
      )}
      <Image
        src={src}
        alt=""
        fill
        unoptimized
        sizes={sizes}
        data-loaded={state === 'loaded'}
        onLoad={() => setState('loaded')}
        onError={() => setState('error')}
        className={cn(
          'object-cover transition-opacity duration-300 ease-out motion-reduce:transition-none',
          state === 'loaded' ? 'opacity-100' : 'opacity-0'
        )}
      />
    </>
  )
}

export function PosterFallback({ title }: { title: string }) {
  return (
    <div
      data-testid="poster-fallback"
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center bg-gradient-to-b from-card to-background"
    >
      <Film className="h-8 w-8 text-muted-foreground" />
      <span className="text-sm font-semibold leading-tight text-foreground">{title}</span>
    </div>
  )
}
