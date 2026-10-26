'use client'

import { useState, useTransition, useCallback } from 'react'
import { Mail } from 'lucide-react'
import { forgotPasswordAction } from '@/lib/actions/auth.actions'
import { forgotPasswordSchema } from '@/lib/validations/auth.schema'
import { z } from 'zod'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ICON_CLASSES = "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"

export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const [emailValue, setEmailValue] = useState('')

  const handleSubmit = useCallback(async (formData: FormData) => {
    startTransition(async () => {
      setError(null)
      setSuccess(null)
      setFieldErrors({})

      const validation = forgotPasswordSchema.safeParse({ email: formData.get('email') })
      if (!validation.success) {
        const flattened = z.flattenError(validation.error)
        setFieldErrors(flattened.fieldErrors)
        return
      }

      try {
        const result = await forgotPasswordAction(formData)
        if (result.error) {
          setError(result.error)
          if (result.fieldErrors) setFieldErrors(result.fieldErrors)
        } else if (result.success) {
          setSuccess(result.success)
        }
      } catch (err) {
        console.error('Forgot password error:', err)
        setError('Network error. Please check your connection.')
      }
    })
  }, [])

  return (
    <div className="space-y-6">
      <div className="text-center">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
          RECOVER ACCESS
        </span>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3" role="alert">
          <p className="text-sm text-destructive text-center">{error}</p>
        </div>
      )}

      {success ? (
        <div className="bg-card/50 border border-border rounded-lg p-4" role="status">
          <p className="text-sm text-foreground text-center">{success}</p>
        </div>
      ) : (
        <form action={handleSubmit} className="space-y-4">
          <fieldset disabled={isPending} className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-xs font-mono uppercase tracking-wide text-muted-foreground"
              >
                Email
              </Label>
              <div className="relative">
                <Mail className={ICON_CLASSES} />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="your@email.com"
                  value={emailValue}
                  required
                  onChange={(e) => {
                    setEmailValue(e.target.value)
                    setError(null)
                    setFieldErrors({})
                  }}
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  className="pl-10 pr-4 py-2 bg-card rounded-full h-auto"
                />
              </div>
              {fieldErrors.email && (
                <p id="email-error" className="text-xs text-destructive" role="alert">
                  {fieldErrors.email[0]}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isPending || emailValue.trim() === ''}
              className="w-full rounded-full font-semibold py-5"
            >
              {isPending && <Spinner className="h-4 w-4" />}
            {isPending ? 'Sending...' : 'Send reset link'}
            </Button>
          </fieldset>
        </form>
      )}

      <div className="text-center">
        <Link
          href="/login"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
