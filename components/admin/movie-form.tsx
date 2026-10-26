'use client'

import { useState, useTransition, useCallback } from 'react'
import Link from 'next/link'
import { Save } from 'lucide-react'
import type { MovieActionResult } from '@/lib/actions/movie.actions'
import type { Movie } from '@/lib/movies'

import { Button } from '@/components/ui/button'
import { LinkPendingIcon } from '@/components/ui/link-pending'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const LABEL = 'text-xs font-mono uppercase tracking-wide text-muted-foreground'
const FIELD = 'bg-card rounded-lg h-auto py-2'

type Props = {
  action: (formData: FormData) => Promise<MovieActionResult>
  movie?: Movie
  submitLabel: string
}

export function MovieForm({ action, movie, submitLabel }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<MovieActionResult['fieldErrors']>({})

  const handleSubmit = useCallback(
    async (formData: FormData) => {
      startTransition(async () => {
        setError(null)
        setFieldErrors({})
        try {
          const result = await action(formData)
          if (result?.error) {
            setError(result.error)
            setFieldErrors(result.fieldErrors ?? {})
          }
        } catch (err) {
          if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
          console.error('Movie form error:', err)
          setError('Error de red. Revisa tu conexión.')
        }
      })
    },
    [action]
  )

  const field = (name: string, label: string, input: React.ReactNode, hint?: string) => {
    const errors = fieldErrors?.[name]
    return (
      <div className="space-y-2">
        <Label htmlFor={name} className={LABEL}>{label}</Label>
        {input}
        {errors?.length ? (
          <p id={`${name}-error`} className="text-xs text-destructive" role="alert">{errors[0]}</p>
        ) : hint ? (
          <p className="text-xs font-mono text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    )
  }

  const inputProps = (name: string) => ({
    id: name,
    name,
    'aria-invalid': !!fieldErrors?.[name]?.length,
    'aria-describedby': fieldErrors?.[name]?.length ? `${name}-error` : undefined,
  })

  return (
    <form action={handleSubmit} className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-6 space-y-6">
      {error && (
        <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3" role="alert">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <fieldset disabled={isPending} className="grid gap-6 md:grid-cols-2">
        {field('title', 'Título', <Input {...inputProps('title')} defaultValue={movie?.title} required className={FIELD} />)}
        {field(
          'slug',
          'Slug',
          <Input {...inputProps('slug')} defaultValue={movie?.slug} placeholder="se genera del título" className={`${FIELD} font-mono`} />,
          'Identificador en la URL. Vacío = se genera del título.'
        )}
        {field('original_title', 'Título original', <Input {...inputProps('original_title')} defaultValue={movie?.original_title ?? ''} className={FIELD} />)}
        {field(
          'release_year',
          'Año',
          <Input {...inputProps('release_year')} type="number" inputMode="numeric" defaultValue={movie?.release_year ?? ''} className={FIELD} />
        )}
        <div className="md:col-span-2">
          {field(
            'synopsis',
            'Sinopsis',
            <textarea
              {...inputProps('synopsis')}
              defaultValue={movie?.synopsis ?? ''}
              rows={4}
              maxLength={2000}
              className="w-full rounded-lg border border-field bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/40"
            />
          )}
        </div>
        {field(
          'genres',
          'Géneros',
          <Input {...inputProps('genres')} defaultValue={movie?.genres.join(', ')} placeholder="anime, acción, romance" className={FIELD} />,
          'Separados por comas.'
        )}
        {field(
          'poster_url',
          'Póster (URL)',
          <Input {...inputProps('poster_url')} type="url" defaultValue={movie?.poster_url ?? ''} placeholder="https://…" className={FIELD} />
        )}
        <div className="md:col-span-2">
          {field(
            'hls_path',
            'Video (ruta en R2)',
            <Input
              {...inputProps('hls_path')}
              defaultValue={movie?.hls_path}
              required
              placeholder="movies/mi-pelicula/master.m3u8"
              className={`${FIELD} font-mono`}
            />,
            'Ruta del master.m3u8 dentro del bucket. Se verifica antes de guardar y la duración se toma de ahí.'
          )}
        </div>
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        <Link href="/dashboard/admin/movies" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <LinkPendingIcon>{null}</LinkPendingIcon>
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending} className="rounded-full font-semibold py-5 px-6">
          {isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {isPending ? 'Verificando video…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
