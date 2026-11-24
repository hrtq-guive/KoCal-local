// Copie uniquement les fichiers publics du site dans dist/ (jamais backend/, .env, .md...)
// Utilisé par Netlify (voir netlify.toml).
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const root = new URL('./', import.meta.url);
const out = new URL('./dist/', import.meta.url);

rmSync(out, { recursive: true, force: true });
mkdirSync(new URL('scripts/', out), { recursive: true });
for (const file of ['index.html', 'admin.html', 'scripts/app.js']) {
  cpSync(new URL(file, root), new URL(file, out));
}
cpSync(new URL('data/', root), new URL('data/', out), { recursive: true });
console.log('dist/ prêt');
