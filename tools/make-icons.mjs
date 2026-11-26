// Gera os ícones PNG do app (192, 512 e maskable) sem dependências externas.
// Uso: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'icons'), { recursive: true });

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function icon(size, { maskable, noBg = false, onlyBg = false, mono = false }) {
  const px = Buffer.alloc(size * size * 4);
  const bg = [15, 118, 110], fg = [255, 255, 255], accent = mono ? fg : [250, 204, 21];
  const r = maskable ? 0 : size * 0.22; // cantos arredondados só no ícone normal
  const inRounded = (x, y) => {
    const cx = Math.min(Math.max(x, r), size - r), cy = Math.min(Math.max(y, r), size - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  // conteúdo dentro da zona segura (60% central)
  const s = size * (maskable ? 0.5 : 0.6), ox = (size - s) / 2, oy = (size - s) / 2;
  const bars = [[0.05, 0.55], [0.38, 0.32], [0.71, 0.08]]; // [x, topo] relativos
  const bw = 0.24;
  const coin = { x: ox + s * 0.83, y: oy + s * 0.0, rr: s * 0.11 };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (!inRounded(x, y)) { px[i + 3] = 0; continue; }
    let c = noBg ? null : bg;
    const u = (x - ox) / s, v = (y - oy) / s;
    if (!onlyBg) {
      for (const [bx, top] of bars) if (u >= bx && u <= bx + bw && v >= top && v <= 1) c = fg;
      if ((x - coin.x) ** 2 + (y - coin.y) ** 2 <= coin.rr ** 2) c = accent;
    }
    if (!c) { px[i + 3] = 0; continue; }
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA 8 bits
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(join(root, 'icons/icon-192.png'), icon(192, { maskable: false }));
writeFileSync(join(root, 'icons/icon-512.png'), icon(512, { maskable: false }));
writeFileSync(join(root, 'icons/maskable-512.png'), icon(512, { maskable: true }));
console.log('ícones gerados em icons/');

// Com --android: grava os ícones do APK no projeto gerado pelo Capacitor (android/).
if (process.argv.includes('--android')) {
  const res = join(root, 'android/app/src/main/res');
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const dir = join(res, `mipmap-${d}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ic_launcher.png'), icon(Math.round(48 * k), { maskable: false }));
    writeFileSync(join(dir, 'ic_launcher_round.png'), icon(Math.round(48 * k), { maskable: false }));
    // Ícone adaptativo: camada da frente sem fundo, 108dp.
    writeFileSync(join(dir, 'ic_launcher_foreground.png'), icon(Math.round(108 * k), { maskable: true, noBg: true }));
    // Ícone pequeno das notificações: só branco sobre transparente, 24dp.
    const ddir = join(res, `drawable-${d}`);
    mkdirSync(ddir, { recursive: true });
    writeFileSync(join(ddir, 'ic_stat_meubolso.png'), icon(Math.round(24 * k), { maskable: true, noBg: true, mono: true }));
  }
  mkdirSync(join(res, 'values'), { recursive: true });
  writeFileSync(join(res, 'values/ic_launcher_background.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0F766E</color>\n</resources>\n');
  console.log('ícones do Android gravados em android/app/src/main/res');
}
