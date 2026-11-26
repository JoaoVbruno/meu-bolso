// 1) Empacota o módulo de IA (SDK da Anthropic) em vendor/ai.js.
// 2) Copia os arquivos do app para www/, que é a pasta que o Capacitor põe no APK.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [join(root, 'tools/ai-entry.mjs')],
  outfile: join(root, 'vendor/ai.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
});

const out = join(root, 'www');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'sw.js', 'icons', 'vendor']) {
  cpSync(join(root, f), join(out, f), { recursive: true });
}
console.log('vendor/ai.js e www/ prontos');
