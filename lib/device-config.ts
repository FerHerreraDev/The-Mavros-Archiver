import { DEVICE_POLL_INTERVAL_SECONDS } from '@/lib/device-codes'

/** Intervalo de sondeo anunciado a la tele. Las pruebas pueden bajarlo con DEVICE_POLL_INTERVAL_SECONDS. */
export function pollInterval() {
  const fromEnv = Number(process.env.DEVICE_POLL_INTERVAL_SECONDS)
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : DEVICE_POLL_INTERVAL_SECONDS
}
