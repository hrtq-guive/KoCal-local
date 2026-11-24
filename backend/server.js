const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const twilio = require('twilio');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

// Toutes les dates et heures du serveur sont en heure de Paris (le VPS est en UTC)
process.env.TZ = 'Europe/Paris';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Protection des routes d'administration : mot de passe vérifié côté serveur
// (ADMIN_PASSWORD dans backend/.env, jamais dans le code du site)
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return res.status(503).json({ error: 'Administration désactivée (ADMIN_PASSWORD non configuré)' });
  }
  const header = req.get('authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!given || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  next();
}
app.use('/api/admin', requireAdmin);
app.use('/api/alert', requireAdmin);

// Servir les fichiers statiques du frontend
// Seulement les fichiers publics (jamais backend/, .env, la base de données ou les .md)
const publicRoot = path.join(__dirname, '..');
app.get(['/', '/index.html', '/admin.html'], (req, res) => {
  res.sendFile(req.path === '/admin.html' ? 'admin.html' : 'index.html', { root: publicRoot });
});
app.use('/scripts/app.js', (req, res) => res.sendFile('scripts/app.js', { root: publicRoot }));
app.use('/data', express.static(path.join(publicRoot, 'data')));

// Configuration Twilio (mode développement si pas configuré)
let client = null;
let devMode = false;

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID !== 'your_twilio_account_sid_here') {
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log('✅ Twilio configuré');
} else {
  console.log('⚠️  Twilio non configuré - mode développement');
  devMode = true;
}

// Base de données SQLite
const db = new sqlite3.Database('./subscribers.db');

// Fonction pour recharger les données des micro-saisons
function loadMicroSeasons() {
  try {
    const filePath = path.join(__dirname, '../data/micro-seasons.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erreur chargement micro-seasons.json:', error);
    throw error;
  }
}

// Créer les tables
db.serialize(() => {
  // Table des abonnés
  db.run(`CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT 1
  )`);
  
  // Table de tracking des SMS envoyés (pour éviter les doublons)
  db.run(`CREATE TABLE IF NOT EXISTS sent_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id TEXT NOT NULL,
    season_date TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(season_id, season_date)
  )`);
});

// Route pour l'inscription SMS
app.post('/api/subscribe', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Numéro de téléphone requis' });
    }

    // Normaliser le numéro (format international)
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!isValidPhone(normalizedPhone)) {
      return res.status(400).json({ error: 'Numéro de téléphone invalide' });
    }
    
    // Vérifier si déjà abonné
    db.get('SELECT * FROM subscribers WHERE phone_number = ?', [normalizedPhone], (err, row) => {
      if (err) {
        console.error('Erreur base de données:', err);
        return res.status(500).json({ error: 'Erreur serveur' });
      }
      
      if (row) {
        return res.status(400).json({ error: 'Ce numéro est déjà abonné' });
      }
      
      // Ajouter l'abonné
      db.run('INSERT INTO subscribers (phone_number) VALUES (?)', [normalizedPhone], async function(err) {
        if (err) {
          console.error('Erreur insertion:', err);
          return res.status(500).json({ error: 'Erreur serveur' });
        }
        
        console.log(`Nouvel abonné: ${normalizedPhone}`);
        
        // Envoyer un SMS de bienvenue
        try {
          const microSeasonsData = loadMicroSeasons();
          const currentSeason = getCurrentMicroSeason(new Date(), microSeasonsData.microSeasons);
          const welcomeMessage = `72 kō par an, 72 textos par an. Bienvenue dans l'aventure Koyomi.heretique.fr ! Pour l'instant profitons de ${currentSeason.japanese.romaji}, la saison pendant laquelle ${currentSeason.translations.fr}.`;
          
          await sendSMS(normalizedPhone, welcomeMessage);
          console.log(`SMS de bienvenue envoyé à ${normalizedPhone}`);
        } catch (error) {
          console.error('Erreur envoi SMS de bienvenue:', error);
          // On continue même si le SMS de bienvenue échoue
        }
        
        res.json({ success: true, message: 'Inscription réussie ! Vous devriez recevoir un SMS de bienvenue dans quelques instants.' });
      });
    });
    
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour se désabonner
app.post('/api/unsubscribe', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Numéro de téléphone requis' });
    }
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    db.run('UPDATE subscribers SET active = 0 WHERE phone_number = ?', [normalizedPhone], function(err) {
      if (err) {
        console.error('Erreur désabonnement:', err);
        return res.status(500).json({ error: 'Erreur serveur' });
      }
      
      res.json({ success: true, message: 'Désabonnement réussi' });
    });
    
  } catch (error) {
    console.error('Erreur désabonnement:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Format international E.164 : + suivi de 8 à 15 chiffres
function isValidPhone(phone) {
  // France : exactement 9 chiffres après +33 (ex : +33612345678)
  if (phone.startsWith('+33')) return /^\+33[1-9]\d{8}$/.test(phone);
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

// Fonction pour normaliser le numéro de téléphone
function normalizePhoneNumber(phone) {
  phone = String(phone || '');
  // Supprimer tous les espaces et caractères spéciaux
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  
  // Si commence par 0, remplacer par +33
  if (cleaned.startsWith('0')) {
    cleaned = '+33' + cleaned.substring(1);
  }
  
  // Si ne commence pas par +, ajouter +33
  if (!cleaned.startsWith('+')) {
    cleaned = '+33' + cleaned;
  }
  
  return cleaned;
}

// Fonction pour envoyer un SMS
async function sendSMS(phoneNumber, message) {
  if (!client) {
    console.log(`📱 [MODE DEV] SMS simulé à ${phoneNumber}: ${message}`);
    return { sid: 'dev_' + Date.now() };
  }
  
  try {
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });
    
    console.log(`SMS envoyé à ${phoneNumber}: ${result.sid}`);
    return result;
  } catch (error) {
    console.error(`Erreur envoi SMS à ${phoneNumber}:`, error.message);
    throw error;
  }
}

// Helpers SQLite en promesses
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

// Heure (Paris) à partir de laquelle on envoie les SMS
const SEND_HOUR = 8;
// Fenêtre de rattrapage : si le serveur était arrêté le jour J, on envoie quand même
// dans les jours suivants (mais pas au-delà, pour ne pas envoyer une vieille saison)
const CATCH_UP_DAYS = 2;

let checkInProgress = false;

// Fonction pour vérifier le changement de micro-saison.
// Appelée régulièrement : elle envoie les SMS une seule fois par micro-saison,
// dès qu'il est SEND_HOUR passé, et rattrape un envoi manqué (serveur arrêté, etc.).
async function checkMicroSeasonChange() {
  if (checkInProgress) return;
  checkInProgress = true;

  try {
    // Charger les données des micro-saisons (rechargement dynamique)
    const microSeasonsData = loadMicroSeasons();

    const now = new Date();
    const currentSeason = getCurrentMicroSeason(now, microSeasonsData.microSeasons);

    // Date de début de la saison actuelle (peut être l'année précédente début janvier)
    let seasonStart = new Date(now.getFullYear(), currentSeason.month - 1, currentSeason.day);
    if (seasonStart > now) {
      seasonStart = new Date(now.getFullYear() - 1, currentSeason.month - 1, currentSeason.day);
    }
    const sendFrom = new Date(seasonStart);
    sendFrom.setHours(SEND_HOUR, 0, 0, 0);
    const sendUntil = new Date(seasonStart);
    sendUntil.setDate(sendUntil.getDate() + CATCH_UP_DAYS + 1);

    if (now < sendFrom || now >= sendUntil) {
      return;
    }

    // Réserver l'envoi de façon atomique (évite les doublons si deux vérifications se chevauchent)
    // La clé contient l'année : sans elle, l'envoi de l'an dernier bloquait celui de cette année
    const seasonDate = `${seasonStart.getFullYear()}-${currentSeason.month}-${currentSeason.day}`;
    const claim = await dbRun(
      'INSERT OR IGNORE INTO sent_notifications (season_id, season_date) VALUES (?, ?)',
      [currentSeason.id, seasonDate]
    );
    if (claim.changes === 0) {
      return; // Déjà envoyé pour cette micro-saison
    }

    const message = `Aujourd'hui s'ouvre ${currentSeason.japanese.romaji}, la saison pendant laquelle ${currentSeason.translations.fr}. koyomi.heretique.fr`;
    const rows = await dbAll('SELECT phone_number FROM subscribers WHERE active = 1');

    console.log(`Envoi de ${rows.length} SMS pour ${currentSeason.japanese.romaji}...`);

    let successCount = 0;
    for (const row of rows) {
      try {
        await sendSMS(row.phone_number, message);
        successCount++;
        // Petite pause entre les envois pour éviter les limites de taux
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Erreur envoi à ${row.phone_number}:`, error.message);
      }
    }

    if (rows.length > 0 && successCount === 0) {
      // Tout a échoué (ex : problème Twilio) : on libère la réservation pour réessayer plus tard
      await dbRun('DELETE FROM sent_notifications WHERE season_id = ? AND season_date = ?',
                  [currentSeason.id, seasonDate]);
      console.error(`❌ Aucun SMS envoyé pour ${currentSeason.japanese.romaji}, nouvel essai à la prochaine vérification`);
    } else {
      console.log(`✅ ${successCount}/${rows.length} SMS envoyés pour ${currentSeason.japanese.romaji}`);
    }
  } catch (error) {
    console.error('Erreur vérification micro-saison:', error);
  } finally {
    checkInProgress = false;
  }
}

// Fonction pour obtenir la micro-saison actuelle (copiée du frontend)
function getCurrentMicroSeason(now, microSeasons) {
  const buildStarts = (year) => {
    const list = [];
    const years = [year - 1, year, year + 1];
    
    years.forEach(year => {
      microSeasons.forEach((season, idx) => {
        list.push({
          season,
          idx,
          start: new Date(year, season.month - 1, season.day)
        });
      });
    });
    
    list.sort((a, b) => a.start - b.start);
    return list;
  };

  const starts = buildStarts(now.getFullYear());
  let current = starts[0];
  
  for (const item of starts) {
    if (item.start <= now) {
      current = item;
    } else {
      break;
    }
  }
  
  return current.season;
}

// Vérification des changements de micro-saison toutes les 10 minutes (et au démarrage).
// On n'utilise plus un cron unique à 8h00 : node-cron v4 saute silencieusement
// l'exécution si son minuteur se déclenche ne serait-ce qu'une seconde en retard,
// et un redémarrage du serveur à ce moment-là faisait aussi rater l'envoi.
setInterval(checkMicroSeasonChange, 10 * 60 * 1000);
setTimeout(checkMicroSeasonChange, 5000);


// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes d'administration
app.get('/api/admin/subscribers', (req, res) => {
  console.log('🔍 Requête GET /api/admin/subscribers reçue');
  db.all('SELECT * FROM subscribers ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error('Erreur récupération abonnés:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    console.log(`📊 ${rows.length} abonnés trouvés`);
    res.json({ subscribers: rows });
  });
});

app.delete('/api/admin/subscribers/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM subscribers WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Erreur suppression abonné:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    res.json({ success: true, message: 'Abonné supprimé' });
  });
});

app.delete('/api/admin/subscribers', (req, res) => {
  db.run('DELETE FROM subscribers', [], function(err) {
    if (err) {
      console.error('Erreur suppression tous les abonnés:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    res.json({ success: true, message: 'Tous les abonnés supprimés' });
  });
});

// Route pour voir l'historique des notifications
app.get('/api/admin/notifications', (req, res) => {
  db.all('SELECT * FROM sent_notifications ORDER BY sent_at DESC', [], (err, rows) => {
    if (err) {
      console.error('Erreur récupération notifications:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    res.json({ notifications: rows });
  });
});

// Route pour forcer l'envoi de la notification de la micro-saison actuelle
app.post('/api/admin/force-send-notification', async (req, res) => {
  try {
    // Charger les données des micro-saisons
    const microSeasonsData = loadMicroSeasons();
    const now = new Date();
    const currentSeason = getCurrentMicroSeason(now, microSeasonsData.microSeasons);
    let startYear = now.getFullYear();
    if (new Date(startYear, currentSeason.month - 1, currentSeason.day) > now) startYear--;
    const seasonDate = `${startYear}-${currentSeason.month}-${currentSeason.day}`;
    
    // Supprimer l'entrée dans sent_notifications si elle existe (pour permettre le ré-envoi)
    db.run('DELETE FROM sent_notifications WHERE season_id = ? AND season_date = ?', 
           [currentSeason.id, seasonDate], (err) => {
      if (err) {
        console.error('Erreur suppression notification:', err);
      }
    });
    
    // Préparer le message
    const message = `Aujourd'hui s'ouvre ${currentSeason.japanese.romaji}, la saison pendant laquelle ${currentSeason.translations.fr}. koyomi.heretique.fr`;
    
    // Récupérer tous les abonnés actifs
    db.all('SELECT phone_number FROM subscribers WHERE active = 1', [], async (err, rows) => {
      if (err) {
        console.error('Erreur récupération abonnés:', err);
        return res.status(500).json({ error: 'Erreur serveur' });
      }
      
      if (rows.length === 0) {
        return res.json({ success: true, message: 'Aucun abonné actif', sent: 0 });
      }
      
      console.log(`📤 Envoi forcé de ${rows.length} SMS pour ${currentSeason.japanese.romaji}...`);
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const row of rows) {
        try {
          await sendSMS(row.phone_number, message);
          successCount++;
          // Petite pause entre les envois pour éviter les limites de taux
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Erreur envoi à ${row.phone_number}:`, error.message);
          errorCount++;
        }
      }
      
      // Enregistrer que les SMS ont été envoyés pour cette micro-saison
      if (successCount > 0) {
        db.run('INSERT INTO sent_notifications (season_id, season_date) VALUES (?, ?)', 
               [currentSeason.id, seasonDate], function(err) {
          if (err) {
            console.error('Erreur enregistrement notification:', err);
          } else {
            console.log(`✅ ${successCount} SMS envoyés pour ${currentSeason.japanese.romaji}`);
          }
        });
      }
      
      res.json({ 
        success: true, 
        message: `Envoi terminé : ${successCount} SMS envoyés, ${errorCount} erreurs`,
        season: currentSeason.japanese.romaji,
        sent: successCount,
        errors: errorCount
      });
    });
    
  } catch (error) {
    console.error('Erreur envoi forcé:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour envoyer des alertes SMS (utilisée par le monitoring, protégée par ADMIN_PASSWORD)
// Le destinataire est fixé par ALERT_PHONE_NUMBER : la route ne peut pas écrire à n'importe qui.
app.post('/api/alert', async (req, res) => {
  try {
    const { message } = req.body;
    const alertPhone = process.env.ALERT_PHONE_NUMBER;

    if (!message) {
      return res.status(400).json({ error: 'Message requis' });
    }
    if (!alertPhone) {
      return res.status(503).json({ error: 'ALERT_PHONE_NUMBER non configuré' });
    }

    const normalizedPhone = normalizePhoneNumber(alertPhone);
    const alertMessage = `🚨 KoCal Alert: ${String(message).slice(0, 300)}`;
    
    await sendSMS(normalizedPhone, alertMessage);
    console.log(`Alerte SMS envoyée à ${normalizedPhone}: ${message}`);
    
    res.json({ success: true, message: 'Alerte SMS envoyée' });
  } catch (error) {
    console.error('Erreur envoi alerte SMS:', error);
    res.status(500).json({ error: 'Erreur envoi alerte' });
  }
});


// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📱 API SMS disponible sur http://localhost:${PORT}/api`);
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt du serveur...');
  db.close((err) => {
    if (err) {
      console.error('Erreur fermeture base de données:', err);
    } else {
      console.log('✅ Base de données fermée');
    }
    process.exit(0);
  });
});
