import { readLocalSupabase } from './local-supabase'

/**
 * Lee los correos que el Supabase local "envió" (Mailpit los captura, no salen a internet).
 */
type MailpitSummary = { ID: string; Subject: string; To: { Address: string }[] }
type MailpitMessage = { ID: string; Subject: string; HTML: string; Text: string }

function mailpitUrl() {
  return readLocalSupabase().mailpitUrl
}

export async function listEmailsTo(email: string): Promise<MailpitSummary[]> {
  const query = encodeURIComponent(`to:"${email}"`)
  const res = await fetch(`${mailpitUrl()}/api/v1/search?query=${query}`)
  if (!res.ok) throw new Error(`Mailpit search falló: ${res.status}`)
  const body = (await res.json()) as { messages: MailpitSummary[] }
  return body.messages
}

export async function waitForEmail(email: string, timeoutMs = 10_000): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const [latest] = await listEmailsTo(email)
    if (latest) {
      const res = await fetch(`${mailpitUrl()}/api/v1/message/${latest.ID}`)
      return (await res.json()) as MailpitMessage
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No llegó ningún correo a ${email} en ${timeoutMs}ms`)
}

/** Espera un rato y confirma que NO llegó correo (para pruebas de "no se envía nada") */
export async function expectNoEmail(email: string, waitMs = 1_500) {
  await new Promise((r) => setTimeout(r, waitMs))
  const messages = await listEmailsTo(email)
  if (messages.length > 0) {
    throw new Error(`Se esperaba 0 correos para ${email}, llegaron ${messages.length}`)
  }
}

/** Primer link del correo cuyo path empiece con `pathPrefix` */
export function extractLink(html: string, pathPrefix: string): string {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
  const link = hrefs.find((href) => {
    try {
      return new URL(href).pathname.startsWith(pathPrefix)
    } catch {
      return false
    }
  })
  if (!link) throw new Error(`No hay link a ${pathPrefix} en el correo. Links: ${hrefs.join(', ')}`)
  return link
}
