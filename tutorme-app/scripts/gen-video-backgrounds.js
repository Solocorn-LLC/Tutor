#!/usr/bin/env node
/**
 * Generates the built-in virtual-background wallpapers for tutor video as real
 * PNG rasters (Daily's background-image processor needs a rasterizable, same-
 * origin image). Uses only Node built-ins (zlib) so there's no image dependency.
 *
 *   node scripts/gen-video-backgrounds.js
 *
 * Output: public/video-backgrounds/<id>.png  (1280x720 each)
 */
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const W = 1280
const H = 720

// CRC32 (PNG chunk checksums).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function encodePng(rgb) {
  // rgb: Buffer of W*H*3. Prefix each scanline with filter byte 0.
  const stride = W * 3
  const raw = Buffer.alloc((stride + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (stride + 1)] = 0
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const lerp = (a, b, t) => a + (b - a) * t
const hexToRgb = h => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]

/**
 * Diagonal two-stop gradient with a soft radial vignette, so faces sit against a
 * slightly darker, non-distracting field — reads well behind a webcam cutout.
 */
function gradient(from, to) {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  const buf = Buffer.alloc(W * H * 3)
  const cx = W / 2
  const cy = H * 0.42
  const maxD = Math.hypot(cx, cy)
  let i = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (x / W + y / H) / 2
      // vignette: darken toward the edges (0.82..1.0)
      const d = Math.hypot(x - cx, y - cy) / maxD
      const v = 1 - 0.18 * d * d
      buf[i++] = Math.round(lerp(a[0], b[0], t) * v)
      buf[i++] = Math.round(lerp(a[1], b[1], t) * v)
      buf[i++] = Math.round(lerp(a[2], b[2], t) * v)
    }
  }
  return buf
}

const BACKGROUNDS = [
  { id: 'slate', from: '#1f2937', to: '#0b1220' },
  { id: 'ocean', from: '#0ea5e9', to: '#0c4a6e' },
  { id: 'sunset', from: '#f97316', to: '#7c2d12' },
  { id: 'forest', from: '#22c55e', to: '#14532d' },
  { id: 'aurora', from: '#8b5cf6', to: '#1e1b4b' },
  { id: 'rose', from: '#f472b6', to: '#831843' },
]

const outDir = path.join(__dirname, '../public/video-backgrounds')
fs.mkdirSync(outDir, { recursive: true })
for (const bg of BACKGROUNDS) {
  const png = encodePng(gradient(bg.from, bg.to))
  fs.writeFileSync(path.join(outDir, `${bg.id}.png`), png)
  console.log(`wrote ${bg.id}.png (${png.length} bytes)`)
}
console.log('done:', outDir)
