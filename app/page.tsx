import { redirect } from 'next/navigation'

// No hay landing pública: el middleware manda a /login si no hay sesión
export default function Home() {
  redirect('/dashboard')
}
