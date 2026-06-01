// Generate PNG app icons from the anchor SVG.
// Run:  node scripts/generate-icons.mjs
// iOS/Android home-screen icons require PNG — an SVG-only manifest leaves the
// install icon blank (which is the bug this fixes). "any" icons keep the
// rounded-rect; maskable + apple-touch use a full-bleed square so the OS mask
// never reveals transparent corners.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pub = resolve(__dirname, '../public')

const rounded = readFileSync(resolve(pub, 'icon.svg'))
const fullBleed = Buffer.from(rounded.toString().replace('rx="112"', 'rx="0"'))

const jobs = [
  { src: rounded,   size: 192, out: 'icon-192.png' },
  { src: rounded,   size: 512, out: 'icon-512.png' },
  { src: fullBleed, size: 512, out: 'icon-maskable-512.png' },
  { src: fullBleed, size: 180, out: 'apple-touch-icon.png' },
]

for (const { src, size, out } of jobs) {
  await sharp(src, { density: 384 }).resize(size, size).png().toFile(resolve(pub, out))
  console.log(`✓ ${out} (${size}×${size})`)
}
