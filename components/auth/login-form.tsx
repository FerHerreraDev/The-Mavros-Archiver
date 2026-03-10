'use client'

import { useState, useTransition, useCallback } from 'react'
import { Mail, Lock } from 'lucide-react'
import { loginAction } from '@/lib/actions/auth.actions'
import { loginSchema } from '@/lib/validations/auth.schema'
import { z } from 'zod'
import Link from 'next/link'

// Constantes fuera del componente para evitar recreación
const ICON_CLASSES = "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"

export function LoginForm() {
  // useTransition da mejor control que useFormStatus
  const [isPending, startTransition] = useTransition()
  
  // Estados para errores
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  // useCallback evita recrear la función en cada render
  const handleSubmit = useCallback(async (formData: FormData) => {
    startTransition(async () => {
      // Limpiar errores previos
      setError(null)
      setFieldErrors({})

      // VALIDACIÓN CLIENT-SIDE (feedback inmediato)
      const data = {
        email: formData.get('email'),
        password: formData.get('password'),
      }

      const validation = loginSchema.safeParse(data)
      if (!validation.success) {
        const flattened = z.flattenError(validation.error)
        setFieldErrors(flattened.fieldErrors)
        return // Detener aquí si la validación falla
      }

      // VALIDACIÓN SERVER-SIDE + autenticación
      try {
        const result = await loginAction(formData)
        if (result?.error) {
          setError(result.error)
        }
        // Si no hay error, redirect() se ejecuta en el server action
      } catch (err) {
        // Manejo de errores de red
        setError('Network error. Please check your connection.')
      }
    })
  }, [])

  // Limpiar errores cuando el usuario empieza a editar
  const clearError = useCallback(() => {
    setError(null)
    setFieldErrors({})
  }, [])

  return (
    <div className="space-y-6">
      {/* Label */}
      <div className="text-center">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
          AUTHENTICATE
        </span>
      </div>

      {/* Error message global */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3" role="alert">
          <p className="text-sm text-destructive text-center">{error}</p>
        </div>
      )}

      {/* Form - fieldset deshabilita todos los inputs durante pending */}
      <form action={handleSubmit} className="space-y-4">
        <fieldset disabled={isPending} className="space-y-4">
          {/* Email field */}
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-xs font-mono text-muted-foreground uppercase tracking-wide"
            >
              Email
            </label>
            <div className="relative">
              <Mail className={ICON_CLASSES} />
              <input
                id="email"
                name="email"
                type="email"
                placeholder="your@email.com"
                required
                onChange={clearError}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                className="w-full bg-card border border-border rounded-full pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            {fieldErrors.email && (
              <p id="email-error" className="text-xs text-destructive" role="alert">
                {fieldErrors.email[0]}
              </p>
            )}
          </div>

          {/* Password field */}
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-xs font-mono text-muted-foreground uppercase tracking-wide"
            >
              Password
            </label>
            <div className="relative">
              <Lock className={ICON_CLASSES} />
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                onChange={clearError}
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
                className="w-full bg-card border border-border rounded-full pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            {fieldErrors.password && (
              <p id="password-error" className="text-xs text-destructive" role="alert">
                {fieldErrors.password[0]}
              </p>
            )}
          </div>

          {/* Forgot password link */}
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={isPending ? -1 : 0}
            >
              Forgot password?
            </Link>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-primary text-primary-foreground rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Authenticating...' : 'Sign In'}
          </button>
        </fieldset>
      </form>

      {/* Access info */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Don't have access?{' '}
          <span className="text-foreground font-semibold">
            Contact your administrator
          </span>
        </p>
      </div>
    </div>
  )
}
