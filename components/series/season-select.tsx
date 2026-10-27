'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/ui/spinner'

const seasonName = (season: number) => (season === 0 ? 'Especiales' : `Temporada ${season}`)

/** Selector de temporada; la temporada vive en la URL (?temporada=N) (SER-18) */
export function SeasonSelect({ slug, seasons, current }: { slug: string; seasons: number[]; current: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <div className="flex items-center gap-2">
      {isPending && <Spinner className="h-4 w-4" />}
      <select
        aria-label="Temporada"
        value={current}
        disabled={isPending}
        onChange={(e) => startTransition(() => router.push(`/dashboard/series/${slug}?temporada=${e.target.value}`, { scroll: false }))}
        className="rounded-lg border border-field bg-card px-3 py-2 text-sm [color-scheme:dark] focus-visible:outline-none focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/40"
      >
        {seasons.map((s) => (
          <option key={s} value={s}>
            {seasonName(s)}
          </option>
        ))}
      </select>
    </div>
  )
}
