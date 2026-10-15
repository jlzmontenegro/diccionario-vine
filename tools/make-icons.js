// Genera los iconos PNG de la app (sin dependencias): node tools/make-icons.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..', 'webapp', 'icons');
const BG = [0x2c, 0x61, 0x24];   // verde de la portada
const LEFT = [0xdc, 0xbe, 0x7e]; // dorado
const RIGHT = [0xff, 0xf7, 0xe6]; // crema

const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => {
  const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(t), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([l, td, c]);
};

// Coordenadas en el espacio 512x512 del icon.svg
function sample(x, y, maskable) {
  if (maskable) { x = (x - 51.2) / 0.8; y = (y - 51.2) / 0.8; }
  const r = 112;
  const inBg = maskable || (() => { const cx = Math.min(Math.max(x, r), 512 - r), cy = Math.min(Math.max(y, r), 512 - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; })();
  if (x >= 256 && x <= 416 && y >= 128 && y <= 400 - (x - 256) * 36 / 160) return RIGHT;
  if (x >= 96 && x < 256 && y >= 128 && y <= 400 - (256 - x) * 36 / 160) return LEFT;
  return inBg ? BG : null;
}

function png(size, file, maskable = false) {
  const SS = 4; // supermuestreo para bordes suaves
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = sample(((x + (sx + 0.5) / SS) / size) * 512, ((y + (sy + 0.5) / SS) / size) * 512, maskable);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = a ? r / a : 0; raw[i + 1] = a ? g / a : 0; raw[i + 2] = a ? b / a : 0; raw[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(size, 0); ih.writeUInt32BE(size, 4); ih[8] = 8; ih[9] = 6;
  fs.writeFileSync(path.join(OUT, file), Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

png(192, 'icon-192.png');
png(512, 'icon-512.png');
png(512, 'icon-maskable.png', true);
console.log('Iconos generados en', OUT);
