// Copie uniquement les fichiers publics du site dans public/ (jamais backend/, .env, .md...)
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const out = new URL('./public/', import.meta.url);

rmSync(out, { recursive: true, force: true });
mkdirSync(new URL('scripts/', out), { recursive: true });
for (const file of ['index.html', 'admin.html', 'scripts/app.js']) {
  cpSync(new URL(file, root), new URL(file, out));
}
cpSync(new URL('data/', root), new URL('data/', out), { recursive: true });
console.log('public/ prêt');
