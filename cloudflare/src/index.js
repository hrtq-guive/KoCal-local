// KoCal sur Cloudflare : API d'inscription + envoi des SMS de micro-saison (Cron Trigger).
// Remplace backend/server.js (VPS). Base de données : D1 (binding DB). SMS : API REST Twilio.
import microSeasonsData from '../../data/micro-seasons.json';

const TIME_ZONE = 'Europe/Paris';
// Heure (Paris) à partir de laquelle on envoie le SMS le jour d'ouverture d'une saison
const SEND_HOUR = 8;
// Rattrapage si un envoi a été manqué, mais jamais pour une saison trop ancienne
const CATCH_UP_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

const SEASONS = microSeasonsData.microSeasons;

// ---------- Utilitaires ----------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

// Heure « murale » à Paris, exprimée comme un timestamp UTC (pour comparer des dates simplement)
function parisWallClock(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date).map(p => [p.type, p.value])
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
}

// Micro-saison en cours et sa date de début (heure de Paris)
export function getCurrentMicroSeason(nowWall) {
  const year = new Date(nowWall).getUTCFullYear();
  let current = null;
  for (const y of [year - 1, year, year + 1]) {
    for (const season of SEASONS) {
      const start = Date.UTC(y, season.month - 1, season.day);
      if (start <= nowWall && (!current || start > current.start)) {
        current = { season, start };
      }
    }
  }
  return current;
}

function normalizePhoneNumber(phone) {
  let cleaned = String(phone || '').replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
  if (cleaned.startsWith('0')) cleaned = '+33' + cleaned.slice(1);
  if (!cleaned.startsWith('+')) cleaned = '+33' + cleaned;
  return cleaned;
}

function isValidPhone(phone) {
  // France : exactement 9 chiffres après +33 (ex : +33612345678)
  if (phone.startsWith('+33')) return /^\+33[1-9]\d{8}$/.test(phone);
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

// Vérifie le mot de passe admin (secret ADMIN_PASSWORD) envoyé en « Authorization: Bearer … »
async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const header = request.headers.get('Authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!given) return false;
  const [a, b] = await Promise.all([sha256(given), sha256(env.ADMIN_PASSWORD)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

// ---------- SMS (Twilio) ----------

async function sendSMS(env, to, body) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    // En local uniquement (SIMULATE_SMS=1 dans .dev.vars) : SMS simulés dans les logs.
    // En production, on refuse : sinon un envoi « simulé » serait compté comme fait.
    if (env.SIMULATE_SMS === '1') {
      console.log(`[MODE DEV] SMS simulé à ${to}: ${body}`);
      return { sid: 'dev_' + Date.now() };
    }
    throw new Error('Twilio non configuré (secrets TWILIO_* manquants)');
  }
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: to, From: env.TWILIO_PHONE_NUMBER, Body: body })
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Twilio ${response.status}: ${result.message || 'erreur inconnue'}`);
  }
  return result;
}

function seasonMessage(season) {
  return `Aujourd'hui s'ouvre ${season.japanese.romaji}, la saison pendant laquelle ${season.translations.fr}. koyomi.heretique.fr`;
}

async function sendToAllActive(env, message) {
  const { results } = await env.DB.prepare('SELECT phone_number FROM subscribers WHERE active = 1').all();
  let sent = 0;
  let errors = 0;
  for (const row of results) {
    try {
      await sendSMS(env, row.phone_number, message);
      sent++;
    } catch (error) {
      errors++;
      console.error(`Erreur envoi à ${row.phone_number}: ${error.message}`);
    }
  }
  return { total: results.length, sent, errors };
}

// ---------- Envoi automatique (Cron Trigger) ----------

export async function checkMicroSeasonChange(env, now = new Date()) {
  const nowWall = parisWallClock(now);
  const { season, start } = getCurrentMicroSeason(nowWall);

  const sendFrom = start + SEND_HOUR * 60 * 60 * 1000;
  const sendUntil = start + (CATCH_UP_DAYS + 1) * DAY_MS;
  if (nowWall < sendFrom || nowWall >= sendUntil) {
    return { skipped: 'hors fenêtre d\'envoi', season: season.id };
  }

  // Réservation atomique : une seule exécution peut envoyer pour cette saison
  // La clé contient l'année : sans elle, l'envoi de l'an dernier bloquerait celui de cette année
  const seasonDate = `${new Date(start).getUTCFullYear()}-${season.month}-${season.day}`;
  const claim = await env.DB.prepare(
    'INSERT OR IGNORE INTO sent_notifications (season_id, season_date) VALUES (?, ?)'
  ).bind(season.id, seasonDate).run();
  if (claim.meta.changes === 0) {
    return { skipped: 'déjà envoyé', season: season.id };
  }

  const result = await sendToAllActive(env, seasonMessage(season));

  if (result.sent === 0) {
    // Personne n'a reçu le SMS (aucun abonné ou tout a échoué) : on libère la réservation
    // pour réessayer à la prochaine heure
    await env.DB.prepare('DELETE FROM sent_notifications WHERE season_id = ? AND season_date = ?')
      .bind(season.id, seasonDate).run();
    console.error(`Aucun SMS envoyé pour ${season.japanese.romaji}, nouvel essai dans une heure`);
  } else {
    console.log(`${result.sent}/${result.total} SMS envoyés pour ${season.japanese.romaji}`);
  }
  return { season: season.id, ...result };
}

// ---------- Routes API ----------

async function subscribe(request, env, ctx) {
  const { phoneNumber } = await request.json().catch(() => ({}));
  if (!phoneNumber) return json({ error: 'Numéro de téléphone requis' }, 400);

  const phone = normalizePhoneNumber(phoneNumber);
  if (!isValidPhone(phone)) return json({ error: 'Numéro de téléphone invalide' }, 400);

  const existing = await env.DB.prepare('SELECT active FROM subscribers WHERE phone_number = ?')
    .bind(phone).first();
  if (existing && existing.active) return json({ error: 'Ce numéro est déjà abonné' }, 400);

  if (existing) {
    await env.DB.prepare('UPDATE subscribers SET active = 1 WHERE phone_number = ?').bind(phone).run();
  } else {
    await env.DB.prepare('INSERT INTO subscribers (phone_number) VALUES (?)').bind(phone).run();
  }

  const { season } = getCurrentMicroSeason(parisWallClock());
  const welcome = `72 kō par an, 72 textos par an. Bienvenue dans l'aventure Koyomi.heretique.fr ! Pour l'instant profitons de ${season.japanese.romaji}, la saison pendant laquelle ${season.translations.fr}.`;
  ctx.waitUntil(sendSMS(env, phone, welcome).catch(e => console.error('Erreur SMS de bienvenue:', e.message)));

  return json({ success: true, message: 'Inscription réussie ! Vous devriez recevoir un SMS de bienvenue dans quelques instants.' });
}

async function unsubscribe(request, env) {
  const { phoneNumber } = await request.json().catch(() => ({}));
  if (!phoneNumber) return json({ error: 'Numéro de téléphone requis' }, 400);
  await env.DB.prepare('UPDATE subscribers SET active = 0 WHERE phone_number = ?')
    .bind(normalizePhoneNumber(phoneNumber)).run();
  return json({ success: true, message: 'Désabonnement réussi' });
}

async function handleAdmin(request, env, path) {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: 'Administration désactivée (ADMIN_PASSWORD non configuré)' }, 503);
  }
  if (!(await isAdmin(request, env))) return json({ error: 'Non autorisé' }, 401);

  const method = request.method;

  if (path === '/api/admin/subscribers' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM subscribers ORDER BY created_at DESC').all();
    return json({ subscribers: results });
  }
  if (path === '/api/admin/subscribers' && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM subscribers').run();
    return json({ success: true, message: 'Tous les abonnés supprimés' });
  }
  const one = path.match(/^\/api\/admin\/subscribers\/(\d+)$/);
  if (one && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM subscribers WHERE id = ?').bind(Number(one[1])).run();
    return json({ success: true, message: 'Abonné supprimé' });
  }
  if (path === '/api/admin/notifications' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM sent_notifications ORDER BY sent_at DESC').all();
    return json({ notifications: results });
  }
  if (path === '/api/admin/force-send-notification' && method === 'POST') {
    const { season, start } = getCurrentMicroSeason(parisWallClock());
    const seasonDate = `${new Date(start).getUTCFullYear()}-${season.month}-${season.day}`;
    const result = await sendToAllActive(env, seasonMessage(season));
    if (result.sent > 0) {
      await env.DB.prepare('INSERT OR IGNORE INTO sent_notifications (season_id, season_date) VALUES (?, ?)')
        .bind(season.id, seasonDate).run();
    }
    return json({
      success: true,
      message: `Envoi terminé : ${result.sent} SMS envoyés, ${result.errors} erreurs`,
      season: season.japanese.romaji,
      ...result
    });
  }
  return json({ error: 'Route inconnue' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/health') return json({ status: 'OK', timestamp: new Date().toISOString() });
      if (path === '/api/subscribe' && request.method === 'POST') return await subscribe(request, env, ctx);
      if (path === '/api/unsubscribe' && request.method === 'POST') return await unsubscribe(request, env);
      if (path.startsWith('/api/admin')) return await handleAdmin(request, env, path);
      if (path.startsWith('/api/')) return json({ error: 'Route inconnue' }, 404);
    } catch (error) {
      console.error('Erreur API:', error);
      return json({ error: 'Erreur serveur' }, 500);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      checkMicroSeasonChange(env, new Date(controller.scheduledTime))
        .then(result => console.log('Vérification micro-saison:', JSON.stringify(result)))
    );
  }
};
