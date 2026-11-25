// Copia os arquivos do app para www/, que é a pasta que o Capacitor empacota no APK.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'sw.js', 'icons']) {
  cpSync(join(root, f), join(out, f), { recursive: true });
}
console.log('www/ pronto');
