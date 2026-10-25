'use client'

import { useState, useTransition, useCallback } from 'react'
import { Mail, Send } from 'lucide-react'
import { inviteUserAction } from '@/lib/actions/admin.actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ICON_CLASSES = "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"

export function InviteUserForm() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [emailValue, setEmailValue] = useState('')

  const handleSubmit = useCallback(async (formData: FormData) => {
    startTransition(async () => {
      setError(null)
      setSuccess(null)

      try {
        const result = await inviteUserAction(formData)
        if (result.error) {
          setError(result.error)
        } else if (result.success) {
          setSuccess(result.success)
          setEmailValue('')
        }
      } catch (err) {
        console.error('Invite error:', err)
        setError('Error de red. Revisa tu conexión.')
      }
    })
  }, [])

  return (
    <section className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-6 space-y-4">
      <div>
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">Invite</span>
        <h3 className="text-lg font-semibold tracking-tight">Invitar usuario</h3>
        <p className="text-sm text-muted-foreground">
          Recibirá un correo para elegir su contraseña y entrar.
        </p>
      </div>

      <form action={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <fieldset disabled={isPending} className="flex-1 space-y-2">
          <Label
            htmlFor="invite-email"
            className="text-xs font-mono uppercase tracking-wide text-muted-foreground"
          >
            Email del invitado
          </Label>
          <div className="relative">
            <Mail className={ICON_CLASSES} />
            <Input
              id="invite-email"
              name="email"
              type="email"
              autoComplete="off"
              placeholder="invitado@email.com"
              value={emailValue}
              required
              onChange={(e) => {
                setEmailValue(e.target.value)
                setError(null)
                setSuccess(null)
              }}
              aria-invalid={!!error}
              aria-describedby={error ? 'invite-feedback' : undefined}
              className="pl-10 pr-4 py-2 bg-card rounded-full h-auto"
            />
          </div>
        </fieldset>

        <Button
          type="submit"
          disabled={isPending || emailValue.trim() === ''}
          className="rounded-full font-semibold py-5 px-6"
        >
          <Send className="h-4 w-4" />
          {isPending ? 'Enviando...' : 'Enviar invitación'}
        </Button>
      </form>

      {error && (
        <div id="invite-feedback" className="bg-destructive/10 border border-destructive/50 rounded-lg p-3" role="alert">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-lg p-3" role="status">
          <p className="text-sm text-emerald-400">{success}</p>
        </div>
      )}
    </section>
  )
}
