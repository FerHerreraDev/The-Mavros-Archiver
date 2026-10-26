'use client'

import { useState, useTransition, useCallback } from 'react'
import { Lock } from 'lucide-react'
import { setPasswordAction } from '@/lib/actions/auth.actions'
import { resetPasswordSchema } from '@/lib/validations/auth.schema'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ICON_CLASSES = "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"

export function SetPasswordForm({ email }: { email: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const [passwordValue, setPasswordValue] = useState('')
  const [confirmValue, setConfirmValue] = useState('')

  const handleSubmit = useCallback(async (formData: FormData) => {
    startTransition(async () => {
      setError(null)
      setFieldErrors({})

      const validation = resetPasswordSchema.safeParse({
        password: formData.get('password'),
        confirmPassword: formData.get('confirmPassword'),
      })
      if (!validation.success) {
        const flattened = z.flattenError(validation.error)
        setFieldErrors(flattened.fieldErrors)
        return
      }

      try {
        const result = await setPasswordAction(formData)
        if (result?.error) {
          setError(result.error)
          if (result.fieldErrors) setFieldErrors(result.fieldErrors)
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
          throw err
        }
        console.error('Set password error:', err)
        setError('Network error. Please check your connection.')
      }
    })
  }, [])

  const clearError = useCallback(() => {
    setError(null)
    setFieldErrors({})
  }, [])

  const isButtonDisabled = isPending || passwordValue === '' || confirmValue === ''

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
          SET YOUR PASSWORD
        </span>
        <p className="text-sm text-muted-foreground">
          Access granted for{' '}
          <span className="font-mono text-foreground">{email}</span>
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3" role="alert">
          <p className="text-sm text-destructive text-center">{error}</p>
        </div>
      )}

      <form action={handleSubmit} className="space-y-4">
        <fieldset disabled={isPending} className="space-y-4">
          <div className="space-y-2">
            <Label
              htmlFor="password"
              className="text-xs font-mono uppercase tracking-wide text-muted-foreground"
            >
              New password
            </Label>
            <div className="relative">
              <Lock className={ICON_CLASSES} />
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={passwordValue}
                required
                onChange={(e) => {
                  setPasswordValue(e.target.value)
                  clearError()
                }}
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? "password-error" : "password-hint"}
                className="pl-10 pr-4 py-2 bg-card rounded-full h-auto"
              />
            </div>
            {fieldErrors.password ? (
              <p id="password-error" className="text-xs text-destructive" role="alert">
                {fieldErrors.password[0]}
              </p>
            ) : (
              <p id="password-hint" className="text-xs font-mono text-muted-foreground">
                8–64 characters. A long passphrase works best.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="confirmPassword"
              className="text-xs font-mono uppercase tracking-wide text-muted-foreground"
            >
              Confirm password
            </Label>
            <div className="relative">
              <Lock className={ICON_CLASSES} />
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmValue}
                required
                onChange={(e) => {
                  setConfirmValue(e.target.value)
                  clearError()
                }}
                aria-invalid={!!fieldErrors.confirmPassword}
                aria-describedby={fieldErrors.confirmPassword ? "confirm-error" : undefined}
                className="pl-10 pr-4 py-2 bg-card rounded-full h-auto"
              />
            </div>
            {fieldErrors.confirmPassword && (
              <p id="confirm-error" className="text-xs text-destructive" role="alert">
                {fieldErrors.confirmPassword[0]}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isButtonDisabled}
            className="w-full rounded-full font-semibold py-5"
          >
            {isPending && <Spinner className="h-4 w-4" />}
            {isPending ? 'Saving...' : 'Save and enter'}
          </Button>
        </fieldset>
      </form>
    </div>
  )
}
