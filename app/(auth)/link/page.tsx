import 'server-only'
import { redirect } from 'next/navigation'
import { Tv, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react'
import { getSessionUser } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { decideDeviceAction, type LinkProblem } from '@/lib/actions/device.actions'
import { formatUserCode, normalizeUserCode } from '@/lib/device-codes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const metadata = { title: 'Conectar TV - The Mavros Archiver' }

const PROBLEMS: Record<LinkProblem, string> = {
  invalid: 'Ese código no existe. Revisa que esté igual que en tu tele.',
  expired: 'Ese código caducó. Pide uno nuevo en la tele.',
  used: 'Ese código ya se usó. Pide uno nuevo en la tele.',
  rate_limited: 'Demasiados intentos. Espera un minuto.',
}

function minutesAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  return minutes === 0 ? 'hace un momento' : `hace ${minutes} min`
}

/** Busca un código vivo para mostrar qué dispositivo lo pide (DEV-10) */
async function lookup(userCode: string) {
  const { data } = await createAdminClient()
    .from('device_codes')
    .select('client_name, created_at, expires_at, status')
    .eq('user_code', userCode)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return { problem: 'invalid' as const }
  if (data.status !== 'pending') return { problem: 'used' as const }
  if (Date.parse(data.expires_at) <= Date.now()) return { problem: 'expired' as const }
  return { device: data }
}

const LABEL = 'text-xs font-mono uppercase tracking-wide text-muted-foreground'

export default async function LinkPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string; result?: string }>
}) {
  // El proxy ya exige sesión; esto es la segunda verificación (DEV-03)
  const session = await getSessionUser()
  if (!session) redirect('/login?redirectTo=/link')

  const { code, error, result } = await searchParams

  if (result === 'approved' || result === 'denied') {
    const approved = result === 'approved'
    return (
      <div className="space-y-4 text-center" role="status">
        {approved ? <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-400" /> : <XCircle className="h-10 w-10 mx-auto text-muted-foreground" />}
        <h2 className="text-lg font-semibold">{approved ? 'Tele conectada' : 'Solicitud rechazada'}</h2>
        <p className="text-sm text-muted-foreground">
          {approved ? 'En unos segundos tu tele entrará a la bóveda.' : 'La tele no recibió acceso.'}
        </p>
      </div>
    )
  }

  const userCode = normalizeUserCode(code)
  const found = userCode ? await lookup(userCode) : null
  const problem = (error as LinkProblem | undefined) ?? (code && !userCode ? 'invalid' : found?.problem)

  if (userCode && found?.device && !problem) {
    const { device } = found
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <span className={LABEL}>Conectar dispositivo</span>
          <p className="font-mono text-2xl tracking-[0.2em]">{formatUserCode(userCode)}</p>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-card/50 p-4">
          <Tv className="h-8 w-8 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium" data-testid="device-name">{device.client_name}</p>
            <p className="text-xs text-muted-foreground">Lo pidió {minutesAgo(device.created_at)}</p>
          </div>
        </div>

        <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3" role="note">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-200">
            Aprueba solo si este código aparece en <strong>tu propia pantalla</strong>. Si alguien te lo envió, recházalo: le darías acceso a tu cuenta.
          </p>
        </div>

        <p className="text-sm text-muted-foreground text-center">
          Se conectará como <span className="text-foreground">{session.user.email}</span>
        </p>

        <form action={decideDeviceAction} className="flex gap-3">
          <input type="hidden" name="code" value={userCode} />
          <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1 rounded-full py-5">
            Rechazar
          </Button>
          <Button type="submit" name="decision" value="approve" className="flex-1 rounded-full font-semibold py-5">
            Aprobar
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <span className={LABEL}>Conectar TV</span>
        <p className="text-sm text-muted-foreground">Escribe el código que aparece en tu tele.</p>
      </div>

      {problem && (
        <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3" role="alert">
          <p className="text-sm text-destructive text-center">{PROBLEMS[problem as LinkProblem] ?? PROBLEMS.invalid}</p>
        </div>
      )}

      <form action="/link" method="get" className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code" className={LABEL}>Código</Label>
          <Input
            id="code"
            name="code"
            defaultValue={code ?? ''}
            placeholder="XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            className="font-mono text-center text-lg tracking-[0.2em] uppercase bg-card rounded-full h-auto py-2"
          />
        </div>
        <Button type="submit" className="w-full rounded-full font-semibold py-5">Continuar</Button>
      </form>
    </div>
  )
}
