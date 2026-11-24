# KoCal : Netlify + Worker Cloudflare

| Rôle | Où |
|---|---|
| Site (`index.html`, `admin.html`, `scripts/app.js`, `data/`) | **Netlify**, mis à jour automatiquement à chaque push sur `main` (voir `netlify.toml` et `build-site.mjs` à la racine) |
| API `/api/*` (inscription, désinscription, admin) | **Worker Cloudflare** (`src/index.js`). Netlify lui transfère les requêtes `/api/*` |
| Base de données | **D1** (SQLite managé, Union européenne) |
| SMS de micro-saison | Cron Trigger du Worker, toutes les heures : envoi une fois par saison dès 8h (heure de Paris), rattrapage jusqu'à 2 jours |
| SMS | API REST Twilio |

Netlify ne publie que les fichiers publics (copiés dans `dist/` par `build-site.mjs`) : jamais `backend/`, `.env`, la base ou les `.md`.

## Mettre à jour le Worker

Le site se met à jour tout seul (Netlify). Pour le Worker, après un changement dans `cloudflare/` :

```bash
cd cloudflare
git pull
npm run deploy
```

## Secrets du Worker

À définir une fois (déjà fait) ; pour en changer un :

```bash
npx wrangler secret put ADMIN_PASSWORD
```

Secrets utilisés : `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `ADMIN_PASSWORD`.

## Consulter la base

```bash
npx wrangler d1 execute kocal --remote --command "SELECT COUNT(*) FROM subscribers WHERE active = 1"
npx wrangler d1 execute kocal --remote --command "SELECT * FROM sent_notifications ORDER BY sent_at DESC LIMIT 5"
```

## Installation depuis zéro (pour mémoire)

```bash
cd cloudflare
npm install
npx wrangler login
npx wrangler d1 create kocal --jurisdiction eu   # mettre le database_id dans wrangler.toml
npm run db:init
npm run deploy
npx wrangler secret put TWILIO_ACCOUNT_SID       # idem pour les 3 autres secrets
```

Puis, sur Netlify : importer le dépôt GitHub (la configuration est lue dans `netlify.toml`), et adapter
l'adresse du Worker dans `netlify.toml` si elle change.

Les abonnés de l'ancien serveur ont été importés avec `backend/export-subscribers.js`.

## Développement local

```bash
printf 'ADMIN_PASSWORD=test\nSIMULATE_SMS=1\n' > .dev.vars
npm run db:init:local
npx wrangler dev --test-scheduled     # avec SIMULATE_SMS=1, les SMS sont simulés dans les logs
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"   # déclenche la vérification
```
