import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ratelimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/client-ip'
import { getSiteUrl } from '@/lib/site-url'
import { pollInterval } from '@/lib/device-config'
import {
  DEVICE_CODE_TTL_SECONDS,
  formatUserCode,
  generateDeviceCode,
  generateUserCode,
  hashDeviceCode,
  sanitizeClientName,
} from '@/lib/device-codes'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** POST /api/device/code → la tele pide un código para mostrar (DEV-01) */
export async function POST(request: NextRequest) {
  const { success } = await ratelimit.limit(`device-code:${clientIp(request.headers)}`)
  if (!success) return NextResponse.json({ error: 'slow_down' }, { status: 429, headers: NO_STORE })

  const body = await request.json().catch(() => ({}))
  const clientName = sanitizeClientName(body?.client_name)
  const deviceCode = generateDeviceCode()
  const deviceCodeHash = await hashDeviceCode(deviceCode)
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_SECONDS * 1000).toISOString()
  const admin = createAdminClient()

  // Choque de user_code (muy improbable): se reintenta con otro
  for (let attempt = 0; attempt < 5; attempt++) {
    const userCode = generateUserCode()
    const { error } = await admin.from('device_codes').insert({
      device_code_hash: deviceCodeHash,
      user_code: userCode,
      client_name: clientName,
      expires_at: expiresAt,
    })
    if (!error) {
      const site = await getSiteUrl()
      return NextResponse.json(
        {
          device_code: deviceCode,
          user_code: formatUserCode(userCode),
          verification_uri: `${site}/link`,
          verification_uri_complete: `${site}/link?code=${formatUserCode(userCode)}`,
          expires_in: DEVICE_CODE_TTL_SECONDS,
          interval: pollInterval(),
        },
        { headers: NO_STORE }
      )
    }
    if (error.code !== '23505') {
      console.error('[DEVICE] No se pudo crear el código:', error.message)
      break
    }
  }
  return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE })
}
