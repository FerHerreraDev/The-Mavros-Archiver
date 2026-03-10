/**
 * SCHEMAS DE VALIDACIÓN PARA AUTENTICACIÓN
 * 
 * ¿Qué es Zod?
 * - Librería de validación de datos con TypeScript
 * - Define la estructura y reglas de tus datos
 * - Genera tipos de TypeScript automáticamente
 * - Valida datos del usuario antes de procesarlos
 * 
 * ¿Por qué validar?
 * - SEGURIDAD: Previene inyecciones SQL, XSS, etc.
 * - CONSISTENCIA: Asegura que los datos tengan el formato correcto
 * - UX: Muestra errores claros al usuario
 * - TYPE-SAFETY: TypeScript conoce la estructura de los datos validados
 * 
 * Mejores prácticas de contraseñas 2026 (NIST SP800-63B):
 * - Mínimo 8 caracteres con MFA
 * - Mínimo 15 caracteres sin MFA
 * - Máximo 64 caracteres (permitir passphrases)
 * - NO forzar caracteres especiales
 * - NO forzar cambios periódicos
 * - SÍ verificar contra contraseñas comprometidas
 * 
 */

import { z } from 'zod'

/**
 * Schema para Login
 * - Email válido
 * - Password mínimo 8 caracteres (asumiendo que tienes MFA)
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'El email es requerido')
    .regex(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Email inválido'
    )
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(1, 'La contraseña es requerida')
    .min(8, 'La contraseña debe tener al menos 8 caracteres'),
})

/**
 * Schema para Registro
 * - Email válido
 * - Password entre 8-64 caracteres
 * - Confirmación de password debe coincidir
 */
export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, 'El email es requerido')
      .regex(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Email inválido'
      )
      .toLowerCase()
      .trim(),
    password: z
      .string()
      .min(8, 'La contraseña debe tener al menos 8 caracteres')
      .max(64, 'La contraseña no puede exceder 64 caracteres'),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

/**
 * Schema para Recuperación de Contraseña
 * - Solo requiere email válido
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'El email es requerido')
    .regex(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Email inválido'
    )
    .toLowerCase()
    .trim(),
})

/**
 * Schema para Restablecer Contraseña
 * - Nueva contraseña entre 8-64 caracteres
 * - Confirmación debe coincidir
 */
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'La contraseña debe tener al menos 8 caracteres')
      .max(64, 'La contraseña no puede exceder 64 caracteres'),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

/**
 * Tipos TypeScript generados automáticamente
 * Úsalos en tus componentes y funciones
 */
export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
