// Cambia el token de una URL del Worker por el de la URL firmada más reciente (WATCH-03).
//   https://cdn/t/<viejo>/movies/x/720p/seg_1.ts + https://cdn/t/<nuevo>/movies/x/master.m3u8
//   -> https://cdn/t/<nuevo>/movies/x/720p/seg_1.ts
// Solo toca URLs del mismo origen con forma /t/<token>/…; cualquier otra se deja igual.

const TOKEN_PATH = /^\/t\/[^/]+\//

export function swapToken(requestUrl: string, latestSignedUrl: string) {
  let request: URL
  let latest: URL
  try {
    request = new URL(requestUrl)
    latest = new URL(latestSignedUrl)
  } catch {
    return requestUrl
  }
  if (request.origin !== latest.origin) return requestUrl

  const latestToken = latest.pathname.match(TOKEN_PATH)?.[0]
  if (!latestToken || !TOKEN_PATH.test(request.pathname)) return requestUrl

  request.pathname = request.pathname.replace(TOKEN_PATH, latestToken)
  return request.href
}
