// URL firmada para probar un video a mano (VLC, Safari, hls-verify):
//   pnpm video:url movies/<slug>/master.m3u8 [minutos]
// Lee VIDEO_CDN_URL y VIDEO_TOKEN_SECRET de .env.local
import { config } from 'dotenv'
import { moviePrefix, signPlaybackToken } from '../workers/video/src/token.ts'

config({ path: '.env.local', quiet: true })
const [hlsPath, minutes = '60'] = process.argv.slice(2)
const cdn = process.env.VIDEO_CDN_URL?.replace(/\/+$/, '')
const secret = process.env.VIDEO_TOKEN_SECRET
if (!hlsPath || !cdn || !secret) {
  console.error('Uso: pnpm video:url <hls_path> [minutos]  (requiere VIDEO_CDN_URL y VIDEO_TOKEN_SECRET en .env.local)')
  process.exit(2)
}
const token = await signPlaybackToken({ prefix: moviePrefix(hlsPath), expiresAt: Date.now() / 1000 + Number(minutes) * 60, secret })
console.log(`${cdn}/t/${token}/${hlsPath}`)
