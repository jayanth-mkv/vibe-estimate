import { inflateSync } from 'node:zlib';

/** Decode Chromium's 8-bit RGB/RGBA screenshots for actual illumination checks. */
export function pngPixels(buffer: Buffer) {
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Expected a PNG');
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20), depth = buffer[24], color = buffer[25], interlace = buffer[28];
  if (depth !== 8 || ![2, 6].includes(color) || interlace !== 0) throw new Error('Unsupported screenshot PNG');
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < buffer.length;) { const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8); if (type === 'IDAT') chunks.push(buffer.subarray(offset + 8, offset + 8 + length)); offset += length + 12; }
  const raw = inflateSync(Buffer.concat(chunks)), channels = color === 6 ? 4 : 3, stride = width * channels, pixels = Buffer.alloc(height * stride);
  const paeth = (a: number, b: number, c: number) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error('Unknown PNG row filter');
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x, left = x >= channels ? pixels[index - channels] : 0, above = y ? pixels[index - stride] : 0, upperLeft = y && x >= channels ? pixels[index - stride - channels] : 0;
      pixels[index] = (raw[y * (stride + 1) + x + 1] + (filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, upperLeft))) & 255;
    }
  }
  return { width, height, channels, pixels };
}
export function pixelDifference(a: Buffer, b: Buffer) {
  const left = pngPixels(a), right = pngPixels(b);
  if (left.width !== right.width || left.height !== right.height) throw new Error('Illumination captures must share a viewport');
  let difference = 0, before = 0, after = 0, count = 0;
  for (let y = Math.floor(left.height * .12); y < left.height * .9; y++) for (let x = Math.floor(left.width * .1); x < left.width * .9; x++) {
    for (let c = 0; c < 3; c++) { const a = left.pixels[(y * left.width + x) * left.channels + c], b = right.pixels[(y * right.width + x) * right.channels + c]; difference += Math.abs(a - b); before += a; after += b; count++; }
  }
  return { meanRgbDifference: difference / count, beforeBrightness: before / count, afterBrightness: after / count };
}
