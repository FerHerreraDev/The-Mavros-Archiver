import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SetPasswordForm } from '@/components/auth/set-password-form'

export default async function SetPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Se llega aquí desde /auth/confirm, que ya creó la sesión
  if (!user?.email) {
    redirect('/login?error=link_invalid')
  }

  return <SetPasswordForm email={user.email} />
}
