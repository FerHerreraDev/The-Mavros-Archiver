'use client'

import { useState, useTransition, useCallback } from 'react'
import { Mail, Lock } from 'lucide-react'
import { loginAction } from '@/lib/actions/auth.actions'
import { loginSchema } from '@/lib/validations/auth.schema'
import { z } from 'zod'
import Link from 'next/link'

// 1. Importamos tus componentes base de Shadcn
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ICON_CLASSES = "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"

export function LoginForm({ initialError, redirectTo }: { initialError?: string; redirectTo?: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const [emailValue, setEmailValue] = useState('')
  const [passwordValue, setPasswordValue] = useState('')

  const handleSubmit = useCallback(async (formData: FormData) => {
    startTransition(async () => {
      setError(null)
      setFieldErrors({})

      const data = {
        email: formData.get('email'),
        password: formData.get('password'),
      }

      const validation = loginSchema.safeParse(data)
      if (!validation.success) {
        const flattened = z.flattenError(validation.error)
        setFieldErrors(flattened.fieldErrors)
        return 
      }

      try {
        const result = await loginAction(formData)
        if (result?.error) {
          setError(result.error)
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
          throw err; 
        }
        console.error('Login error:', err);
        setError('Network error. Please check your connection.')
      }
    })
  }, [])

  const clearError = useCallback(() => {
    setError(null)
    setFieldErrors({})
  }, [])

  const isButtonDisabled = isPending || emailValue.trim() === '' || passwordValue.trim() === ''

  return (
    <div className="space-y-6">
      <div className="text-center">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
          AUTHENTICATE
        </span>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3" role="alert">
          <p className="text-sm text-destructive text-center">{error}</p>
        </div>
      )}

      <form action={handleSubmit} className="space-y-4">
        {/* El servidor valida que sea una ruta interna */}
        {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
        <fieldset disabled={isPending} className="space-y-4">
          
          <div className="space-y-2">
            {/* Usamos <Label> de Shadcn */}
            <Label
              htmlFor="email"
              className="text-xs font-mono uppercase tracking-wide text-muted-foreground"
            >
              Email
            </Label>
            <div className="relative">
              <Mail className={ICON_CLASSES} />
              {/* Usamos <Input> de Shadcn */}
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="your@email.com"
                value={emailValue}
                required
                onChange={(e) => {
                  setEmailValue(e.target.value)
                  clearError()
                }}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                // Mantenemos solo las clases específicas para este diseño (el padding del ícono y el borde redondo)
                className="pl-10 pr-4 py-2 bg-card rounded-full h-auto" 
              />
            </div>
            {fieldErrors.email && (
              <p id="email-error" className="text-xs text-destructive" role="alert">
                {fieldErrors.email[0]}
              </p>
            )}
          </div>

          <div className="space-y-2">
            {/* Usamos <Label> de Shadcn */}
            <Label
              htmlFor="password"
              className="text-xs font-mono uppercase tracking-wide text-muted-foreground"
            >
              Password
            </Label>
            <div className="relative">
              <Lock className={ICON_CLASSES} />
              {/* Usamos <Input> de Shadcn */}
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={passwordValue}
                required
                onChange={(e) => {
                  setPasswordValue(e.target.value)
                  clearError()
                }}
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
                className="pl-10 pr-4 py-2 bg-card rounded-full h-auto"
              />
            </div>
            {fieldErrors.password && (
              <p id="password-error" className="text-xs text-destructive" role="alert">
                {fieldErrors.password[0]}
              </p>
            )}
          </div>

          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={isPending ? -1 : 0}
            >
              Forgot password?
            </Link>
          </div>

          {/* Usamos <Button> de Shadcn */}
          <Button
            type="submit"
            disabled={isButtonDisabled}
            className="w-full rounded-full font-semibold py-5" // py-5 para mantener la altura que tenías originalmente
          >
            {isPending ? 'Authenticating...' : 'Sign In'}
          </Button>
        </fieldset>
      </form>

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have access?{' '}
          <span className="text-foreground font-semibold">
            Contact your administrator
          </span>
        </p>
      </div>
    </div>
  )
}
