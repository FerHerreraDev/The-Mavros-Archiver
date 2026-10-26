#!/usr/bin/env node
// Escalera de calidades para HLS (VID-06, VID-08 de tests/SPEC.md). La usa scripts/encode-hls.sh:
//
//   node scripts/hls-ladder.mjs <ancho del original>   → una línea por calidad: "ancho nombre crf tope_kbps"
//
// - La primera calidad es el original, con el tope de SU resolución (un 4K no queda limitado a 1080p).
// - Debajo: 1080p, 720p, 480p y 360p, solo las menores que el original.
// - CRF manda la calidad; el tope (maxrate, búfer 2×) evita picos que la conexión no aguante.

// Por ancho (como se conocen las calidades: 1920×800 en 2.39:1 sigue siendo "1080p")
const TIERS = [
  { minWidth: 3840, name: '2160p', crf: 18, maxrateKbps: 16000 },
  { minWidth: 2560, name: '1440p', crf: 18, maxrateKbps: 9000 },
  { minWidth: 1920, name: '1080p', crf: 18, maxrateKbps: 6000 },
  { minWidth: 1280, name: '720p', crf: 20, maxrateKbps: 3000 },
  { minWidth: 854, name: '480p', crf: 21, maxrateKbps: 1400 },
  { minWidth: 0, name: '360p', crf: 22, maxrateKbps: 800 },
]
const BELOW = [1920, 1280, 854, 640]

const tier = (width) => TIERS.find((t) => width >= t.minWidth)

export const label = (width) => tier(width).name

export function ladder(sourceWidth) {
  const rung = (width) => {
    const { name, crf, maxrateKbps } = tier(width)
    return { width, name, crf, maxrateKbps }
  }
  return [rung(sourceWidth), ...BELOW.filter((w) => w < sourceWidth).map(rung)]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const width = Number(process.argv[2])
  if (!Number.isInteger(width) || width <= 0) {
    console.error('Uso: hls-ladder.mjs <ancho del original>')
    process.exit(1)
  }
  for (const r of ladder(width)) console.log(`${r.width} ${r.name} ${r.crf} ${r.maxrateKbps}`)
}
