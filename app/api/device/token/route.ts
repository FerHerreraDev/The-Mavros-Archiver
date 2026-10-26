import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashDeviceCode } from '@/lib/device-codes'
import { mintSessionFor } from '@/lib/device-auth'
import { pollInterval } from '@/lib/device-config'

const NO_STORE = { 'Cache-Control': 'no-store' }
const oauthError = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE })

/** Acepta JSON o form-urlencoded (este último es lo que dice el RFC 8628) */
async function readDeviceCode(request: NextRequest) {
  const type = request.headers.get('content-type') ?? ''
  try {
    if (type.includes('application/x-www-form-urlencoded')) return (await request.formData()).get('device_code')
    return (await request.json())?.device_code
  } catch {
    return null
  }
}

/** POST /api/device/token → la tele sondea hasta que el usuario aprueba (DEV-02, DEV-04, DEV-05, DEV-08) */
export async function POST(request: NextRequest) {
  const deviceCode = await readDeviceCode(request)
  if (typeof deviceCode !== 'string' || deviceCode.length < 20 || deviceCode.length > 128) return oauthError('invalid_grant')

  // Se tolera 1 s de diferencia con el intervalo anunciado
  const minInterval = Math.max(pollInterval() - 1, 0)
  const { data, error } = await createAdminClient()
    .rpc('device_code_poll', { p_hash: await hashDeviceCode(deviceCode), p_min_interval_seconds: minInterval })
    .single<{ result: string; user_id: string | null }>()

  if (error || !data) {
    console.error('[DEVICE] device_code_poll falló:', error?.message)
    return oauthError('server_error', 500)
  }

  if (data.result !== 'approved') return oauthError(data.result)

  // Ya quedó consumido: si no se puede emitir la sesión, la tele tendrá que pedir otro código
  const session = data.user_id ? await mintSessionFor(data.user_id) : null
  if (!session) return oauthError('access_denied')

  return NextResponse.json(session, { headers: NO_STORE })
}
