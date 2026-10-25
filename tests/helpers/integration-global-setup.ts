import { readLocalSupabase } from './local-supabase'

// Falla rápido y claro si Supabase local no está arriba (en vez de 40 pruebas con timeout)
export default function setup() {
  readLocalSupabase()
}
