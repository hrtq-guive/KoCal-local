// Exporte les abonnés et l'historique d'envoi de subscribers.db vers un fichier SQL pour D1.
// Usage (sur le VPS, dans backend/) : node export-subscribers.js > kocal-export.sql
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./subscribers.db', sqlite3.OPEN_READONLY);

const q = v => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;

db.all('SELECT id, phone_number, created_at, active FROM subscribers ORDER BY id', [], (err, subs) => {
  if (err) throw err;
  db.all('SELECT season_id, season_date, sent_at FROM sent_notifications ORDER BY id', [], (err2, notes) => {
    if (err2) throw err2;
    for (const s of subs) {
      console.log(`INSERT OR IGNORE INTO subscribers (id, phone_number, created_at, active) VALUES (${q(s.id)}, ${q(s.phone_number)}, ${q(s.created_at)}, ${s.active ? 1 : 0});`);
    }
    for (const n of notes) {
      console.log(`INSERT OR IGNORE INTO sent_notifications (season_id, season_date, sent_at) VALUES (${q(n.season_id)}, ${q(n.season_date)}, ${q(n.sent_at)});`);
    }
    console.error(`${subs.length} abonnés, ${notes.length} envois exportés`);
    db.close();
  });
});
