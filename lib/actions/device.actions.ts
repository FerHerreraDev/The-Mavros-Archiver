'use server'

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { ratelimit } from '@/lib/rate-limit'
import { formatUserCode, normalizeUserCode } from '@/lib/device-codes'

export type LinkProblem = 'invalid' | 'expired' | 'used' | 'rate_limited'

/** Por qué no se pudo decidir un código (para mostrar el error correcto, DEV-06) */
async function diagnose(userCode: string): Promise<LinkProblem> {
  const { data } = await createAdminClient()
    .from('device_codes')
    .select('status, expires_at')
    .eq('user_code', userCode)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return 'invalid'
  if (data.status !== 'pending') return 'used'
  return 'expired'
}

/**
 * Aprobar o rechazar el código de una tele (DEV-04, DEV-05, DEV-06, DEV-11).
 * El cambio es condicional (solo si sigue pendiente y vigente), así que dos
 * personas no pueden decidir el mismo código.
 */
export async function decideDeviceAction(formData: FormData) {
  const session = await getSessionUser()
  if (!session) redirect('/login?redirectTo=/link')

  const userCode = normalizeUserCode(String(formData.get('code') ?? ''))
  const approve = formData.get('decision') === 'approve'
  if (!userCode) redirect('/link?error=invalid')

  const { success } = await ratelimit.limit(`device-decide:${session.user.id}`)
  if (!success) redirect(`/link?code=${formatUserCode(userCode)}&error=rate_limited`)

  const { data } = await createAdminClient()
    .from('device_codes')
    .update({
      status: approve ? 'approved' : 'denied',
      user_id: session.user.id,
      decided_at: new Date().toISOString(),
    })
    .eq('user_code', userCode)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .select('id')

  if (!data?.length) redirect(`/link?code=${formatUserCode(userCode)}&error=${await diagnose(userCode)}`)

  redirect(`/link?result=${approve ? 'approved' : 'denied'}`)
}
