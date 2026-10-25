'use client'

import '@videojs/react/video/skin.css'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { VideoPlayer, VideoSkin } from '@videojs/react/video'
import { HlsJsVideo, type HlsJsAdapter, type HlsSource } from '@videojs/react/media/hlsjs-video'
import { createClient } from '@/lib/supabase/client'
import { swapToken } from '@/lib/video/swap-token'

const SAVE_EVERY_SECONDS = 10
// Renovar el token 5 min antes de que caduque (WATCH-03)
const REFRESH_BEFORE_MS = 5 * 60 * 1000

type Props = {
  movieId: string
  title: string
  poster: string | null
  initialUrl: string
  initialExpiresAt: string
  startAt: number
}

type HlsErrorData = { fatal?: boolean; response?: { code?: number }; networkDetails?: { status?: number } }

export function MoviePlayer({ movieId, title, poster, initialUrl, initialExpiresAt, startAt }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRef = useRef<HlsJsAdapter>(null)
  const latestUrl = useRef(initialUrl)
  const refreshing = useRef<Promise<boolean> | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastSaved = useRef<number | null>(null)
  const resumed = useRef(false)
  const supabase = useMemo(() => createClient(), [])

  // --- Token --------------------------------------------------------------
  const scheduleRefresh = useCallback((expiresAt: string) => {
    clearTimeout(refreshTimer.current)
    const wait = Math.max(0, Date.parse(expiresAt) - Date.now() - REFRESH_BEFORE_MS)
    refreshTimer.current = setTimeout(() => void refresh(), wait)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(async () => {
    // Una sola renovación a la vez aunque fallen varios segmentos juntos
    refreshing.current ??= (async () => {
      try {
        const res = await fetch(`/api/playback/${movieId}`, { cache: 'no-store' })
        if (!res.ok) return false
        const { url, expires_at } = (await res.json()) as { url: string; expires_at: string }
        latestUrl.current = url
        scheduleRefresh(expires_at)
        return true
      } catch {
        return false
      } finally {
        setTimeout(() => (refreshing.current = null), 0)
      }
    })()
    return refreshing.current
  }, [movieId, scheduleRefresh])

  useEffect(() => {
    scheduleRefresh(initialExpiresAt)
    return () => clearTimeout(refreshTimer.current)
  }, [initialExpiresAt, scheduleRefresh])

  // hls.js pide cada playlist/segmento por XHR: se reescribe la URL con el token vigente,
  // así renovar no obliga a recargar el video
  const source = useMemo<HlsSource>(
    () => ({
      src: initialUrl,
      engine: {
        hlsJs: {
          xhrSetup: (xhr: XMLHttpRequest, url: string) => {
            xhr.open('GET', swapToken(url, latestUrl.current), true)
          },
        },
      },
    }),
    [initialUrl]
  )

  // Si el Worker responde 403 (token caducado/rotado): renovar y retomar desde el mismo punto
  useEffect(() => {
    let attached: { off: (e: string, fn: (...a: unknown[]) => void) => void } | null = null
    const onError = async (_event: unknown, data: HlsErrorData) => {
      const status = data?.response?.code ?? data?.networkDetails?.status
      if (status !== 403) return
      if (await refresh()) {
        mediaRef.current?.engine?.startLoad(videoRef.current?.currentTime ?? -1)
      }
    }
    const handler = onError as unknown as (...a: unknown[]) => void
    const timer = setInterval(() => {
      const engine = mediaRef.current?.engine as unknown as typeof attached & { on: (e: string, fn: (...a: unknown[]) => void) => void } | null
      if (engine && engine !== attached) {
        attached?.off('hlsError', handler)
        engine.on('hlsError', handler)
        attached = engine
      }
    }, 250)
    return () => {
      clearInterval(timer)
      attached?.off('hlsError', handler)
    }
  }, [refresh])

  // --- Progreso (PRG-01) --------------------------------------------------
  const save = useCallback(
    async (position: number) => {
      if (!Number.isFinite(position) || position < 0) return
      lastSaved.current = position
      await supabase
        .from('watch_progress')
        .upsert({ movie_id: movieId, position_seconds: Math.round(position * 1000) / 1000 }, { onConflict: 'user_id,movie_id' })
    },
    [movieId, supabase]
  )

  useEffect(() => {
    const flush = () => {
      const t = videoRef.current?.currentTime
      if (t !== undefined && t !== lastSaved.current && t > 0) void save(t)
    }
    const onVisibility = () => document.visibilityState === 'hidden' && flush()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      flush()
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [save])

  return (
    <VideoPlayer title={title} poster={poster ?? undefined}>
      <VideoSkin className="w-full overflow-hidden rounded-2xl border border-border bg-black" style={{ aspectRatio: '16 / 9' }}>
        <HlsJsVideo
          ref={videoRef}
          mediaRef={mediaRef}
          source={source}
          playsInline
          preload="metadata"
          data-testid="movie-video"
          onLoadedMetadata={() => {
            // PRG-02: retomar una sola vez, al cargar
            if (!resumed.current && startAt > 0 && videoRef.current) {
              videoRef.current.currentTime = startAt
            }
            resumed.current = true
          }}
          onTimeUpdate={() => {
            const t = videoRef.current?.currentTime ?? 0
            if (lastSaved.current === null || Math.abs(t - lastSaved.current) >= SAVE_EVERY_SECONDS) void save(t)
          }}
          onPause={() => void save(videoRef.current?.currentTime ?? 0)}
          onEnded={() => void save(videoRef.current?.duration ?? 0)}
        />
      </VideoSkin>
    </VideoPlayer>
  )
}
