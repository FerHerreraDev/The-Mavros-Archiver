// Genera tests/fixtures/thumbhash/cases.json con la librería de referencia (thumbhash de Evan Wallace).
// Android (LOAD-04) debe decodificar cada hash a exactamente los mismos píxeles (±1 por redondeo).
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { rgbaToThumbHash, thumbHashToRGBA, thumbHashToAverageRGBA, thumbHashToApproximateAspectRatio } from 'thumbhash'

const root = path.resolve(import.meta.dirname, '..')
const posters = path.join(root, 'tests/fixtures/posters')

async function fromFile(name) {
  const { data, info } = await sharp(path.join(posters, name)).resize(100, 100, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return rgbaToThumbHash(info.width, info.height, data)
}

function synthetic(w, h, pixel) {
  const rgba = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set(pixel(x / (w - 1 || 1), y / (h - 1 || 1)), (y * w + x) * 4)
  return rgbaToThumbHash(w, h, rgba)
}

const inputs = {
  'poster-red-blue-png': await fromFile('red-blue-2x3.png'),
  'poster-red-blue-jpg': await fromFile('red-blue-2x3.jpg'),
  'landscape-gradient': synthetic(100, 50, (x, y) => [255 * x, 128, 255 * y, 255]),
  'portrait-diagonal': synthetic(40, 100, (x, y) => [40 + 200 * ((x + y) / 2), 200 - 150 * x, 90, 255]),
  'alpha-circle': synthetic(64, 64, (x, y) => [250, 200, 20, Math.hypot(x - 0.5, y - 0.5) < 0.35 ? 255 : 0]),
  'gray-flat': synthetic(32, 48, () => [128, 128, 128, 255]),
  'tiny-1x1': synthetic(1, 1, () => [10, 220, 140, 255]),
}

const cases = Object.entries(inputs).map(([name, hash]) => {
  const { w, h, rgba } = thumbHashToRGBA(hash)
  return {
    name,
    hash: Buffer.from(hash).toString('base64'),
    w,
    h,
    rgba: Buffer.from(rgba).toString('base64'),
    average: thumbHashToAverageRGBA(hash),
    aspectRatio: thumbHashToApproximateAspectRatio(hash),
  }
})
writeFileSync(path.join(root, 'tests/fixtures/thumbhash/cases.json'), JSON.stringify({ generatedBy: 'thumbhash@0.1.1', cases }, null, 2) + '\n')
console.log(cases.map((c) => `${c.name}: ${c.hash} (${c.w}x${c.h})`).join('\n'))
