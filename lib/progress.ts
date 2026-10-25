// Reglas de progreso de reproducción (PRG-02, CAT-06). Funciones puras.

export const RESUME_MIN_SECONDS = 10
export const FINISHED_RATIO = 0.95
export const CONTINUE_MIN_RATIO = 0.05

/** Desde dónde arrancar al abrir la película (PRG-02) */
export function resumePosition(positionSeconds: number | null | undefined, durationSeconds: number) {
  if (!positionSeconds || durationSeconds <= 0) return 0
  if (positionSeconds < RESUME_MIN_SECONDS) return 0
  if (positionSeconds / durationSeconds >= FINISHED_RATIO) return 0
  return Math.min(positionSeconds, durationSeconds)
}

/** ¿Va en "Seguir viendo"? Entre 5 % y 95 % (CAT-06) */
export function isInProgress(positionSeconds: number, durationSeconds: number) {
  if (durationSeconds <= 0) return false
  const ratio = positionSeconds / durationSeconds
  return ratio >= CONTINUE_MIN_RATIO && ratio < FINISHED_RATIO
}

export function progressRatio(positionSeconds: number, durationSeconds: number) {
  if (durationSeconds <= 0) return 0
  return Math.min(1, Math.max(0, positionSeconds / durationSeconds))
}
