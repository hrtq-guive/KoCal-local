# KoCal sur Cloudflare

Remplace le VPS Scaleway (Nginx + Node + SQLite + Certbot) par :

| Rôle | Cloudflare |
|---|---|
| Site (`index.html`, `admin.html`, `scripts/app.js`, `data/`) | Workers Static Assets |
| API `/api/*` | Worker (`src/index.js`) |
| Base de données | D1 (SQLite managé, même schéma) |
| SMS de micro-saison | Cron Trigger toutes les heures, envoi une fois par saison dès 7h (heure de Paris), rattrapage jusqu'à 2 jours |
| SMS | API REST Twilio |
| HTTPS | Automatique |

Seuls les fichiers publics sont copiés dans `public/` (`build.mjs`) : jamais `backend/`, `.env`, la base ou les `.md`.

## Mise en place (une fois)

Prérequis : un compte Cloudflare (gratuit) et Node 18+.

```bash
cd cloudflare
npm install
npx wrangler login
npx wrangler d1 create kocal          # copier le database_id affiché dans wrangler.toml
npm run db:init                       # crée les tables dans D1
```

Dans `wrangler.toml`, mettre le vrai `TWILIO_PHONE_NUMBER` (et `ALERT_PHONE_NUMBER` si besoin), puis les secrets :

```bash
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put ADMIN_PASSWORD
```

Déployer :

```bash
npm run deploy
```

Le site est alors en ligne sur `https://kocal.<compte>.workers.dev`.

## Migrer les abonnés depuis le VPS

Sur le VPS :

```bash
cd /opt/KoCal-local/backend && node export-subscribers.js > kocal-export.sql
```

Récupérer le fichier, puis :

```bash
npx wrangler d1 execute kocal --remote --file=kocal-export.sql
```

L'historique des envois est importé aussi, donc une saison déjà envoyée par le VPS ne sera pas renvoyée.

## Brancher le domaine

Dashboard Cloudflare → Workers → `kocal` → Settings → Domains & Routes → ajouter `koyomi.heretique.fr`
(le domaine `heretique.fr` doit être géré par Cloudflare DNS).

Ordre conseillé pour basculer sans doublon ni trou :
1. Déployer et tester sur l'URL `workers.dev` (inscription, page admin).
2. Arrêter le service sur le VPS (`systemctl stop kocal-backend`), exporter/importer les abonnés.
3. Brancher `koyomi.heretique.fr` sur le Worker.
4. Après un premier SMS de saison envoyé par Cloudflare, résilier le VPS.

## Page admin

`/admin` : le mot de passe est vérifié par le Worker (secret `ADMIN_PASSWORD`), il n'est plus dans la page.
Pour une protection supplémentaire, on peut mettre Cloudflare Access (gratuit) devant `/admin*` et `/api/admin/*`.

## Développement local

```bash
printf 'ADMIN_PASSWORD=test\n' > .dev.vars
npm run db:init:local
npx wrangler dev --test-scheduled     # sans identifiants Twilio, les SMS sont simulés dans les logs
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"   # déclenche la vérification
```
