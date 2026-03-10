import { createClient } from '@/lib/supabase/server'

export default async function TestConnectionPage() {
  let connectionStatus = {
    envVarsConfigured: false,
    clientCreated: false,
    databaseConnected: false,
    error: null as string | null,
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Variables de entorno no configuradas')
    }

    if (
      supabaseUrl === 'your_supabase_project_url' ||
      supabaseAnonKey === 'your_supabase_anon_key'
    ) {
      throw new Error(
        'Debes reemplazar los valores de ejemplo en .env.local con tus credenciales reales'
      )
    }

    connectionStatus.envVarsConfigured = true

    const supabase = await createClient()
    connectionStatus.clientCreated = true

    const { data, error } = await supabase.auth.getSession()

    if (error) {
      throw new Error(`Error de autenticación: ${error.message}`)
    }

    connectionStatus.databaseConnected = true
  } catch (error) {
    connectionStatus.error =
      error instanceof Error ? error.message : 'Error desconocido'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 to-black flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-zinc-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-zinc-700 p-8">
        <h1 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
          <span className="text-4xl">🔌</span>
          Test de Conexión Supabase
        </h1>

        <div className="space-y-4">
          <TestItem
            label="Variables de Entorno"
            status={connectionStatus.envVarsConfigured}
            successMessage="Configuradas correctamente"
            errorMessage="No configuradas o valores de ejemplo"
          />

          <TestItem
            label="Cliente de Supabase"
            status={connectionStatus.clientCreated}
            successMessage="Cliente creado exitosamente"
            errorMessage="Error al crear cliente"
          />

          <TestItem
            label="Conexión a Base de Datos"
            status={connectionStatus.databaseConnected}
            successMessage="Conectado a Supabase"
            errorMessage="No se pudo conectar"
          />
        </div>

        {connectionStatus.error && (
          <div className="mt-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
            <p className="text-red-400 font-medium mb-2">❌ Error:</p>
            <p className="text-red-300 text-sm font-mono">
              {connectionStatus.error}
            </p>
          </div>
        )}

        {!connectionStatus.error && connectionStatus.databaseConnected && (
          <div className="mt-6 p-4 bg-green-500/10 border border-green-500/50 rounded-lg">
            <p className="text-green-400 font-medium mb-2">
              ✅ ¡Todo funciona correctamente!
            </p>
            <p className="text-green-300 text-sm">
              Tu aplicación está conectada a Supabase. Ya puedes implementar el
              sistema de autenticación.
            </p>
          </div>
        )}

        <div className="mt-8 p-4 bg-zinc-700/30 rounded-lg border border-zinc-600">
          <p className="text-zinc-400 text-sm mb-2">
            <strong className="text-zinc-300">URL del Proyecto:</strong>
          </p>
          <p className="text-zinc-500 text-xs font-mono break-all">
            {process.env.NEXT_PUBLIC_SUPABASE_URL || 'No configurada'}
          </p>
        </div>

        <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-blue-300 text-sm">
            💡 <strong>Nota:</strong> Elimina esta página (
            <code className="bg-zinc-700 px-1 rounded">
              app/test-connection
            </code>
            ) antes de ir a producción.
          </p>
        </div>

        <div className="mt-6">
          <a
            href="/"
            className="inline-block px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
          >
            ← Volver al inicio
          </a>
        </div>
      </div>
    </div>
  )
}

function TestItem({
  label,
  status,
  successMessage,
  errorMessage,
}: {
  label: string
  status: boolean
  successMessage: string
  errorMessage: string
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-zinc-700/30 rounded-lg border border-zinc-600">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{status ? '✅' : '❌'}</span>
        <div>
          <p className="text-white font-medium">{label}</p>
          <p className="text-sm text-zinc-400">
            {status ? successMessage : errorMessage}
          </p>
        </div>
      </div>
    </div>
  )
}
