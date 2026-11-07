/**
 * Mensaje para el admin cuando Supabase no manda un correo de invitación (INV-03, INV-07).
 * Supabase limita cuántos correos de Auth salen por hora; ese límite no es un error de la app.
 */
export function inviteErrorMessage(error: { code?: string; status?: number } | null | undefined, fallback: string) {
  if (!error) return fallback
  if (error.code === 'email_exists' || error.code === 'user_already_exists') {
    return 'Este correo ya pertenece a un usuario registrado. Si está pendiente, usa "Reenviar" en la tabla.'
  }
  if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit' || error.status === 429) {
    return 'Supabase ya mandó el máximo de correos por hora. Espera un rato e intenta de nuevo.'
  }
  return fallback
}
