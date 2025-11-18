const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const twilio = require('twilio');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Servir les fichiers statiques du frontend
app.use(express.static('../'));

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

// Fonction pour normaliser le numéro de téléphone
function normalizePhoneNumber(phone) {
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

// Fonction pour vérifier le changement de micro-saison
async function checkMicroSeasonChange() {
  try {
    // Charger les données des micro-saisons (rechargement dynamique)
    const microSeasonsData = loadMicroSeasons();
    
    // Logique pour déterminer la micro-saison actuelle
    const now = new Date();
    const currentSeason = getCurrentMicroSeason(now, microSeasonsData.microSeasons);
    
    // Vérifier si c'est le premier jour de cette micro-saison
    const seasonStartDate = new Date(now.getFullYear(), currentSeason.month - 1, currentSeason.day);
    const isFirstDay = now.getDate() === seasonStartDate.getDate() && 
                      now.getMonth() === seasonStartDate.getMonth();
    
    if (!isFirstDay) {
      console.log(`Pas le premier jour de ${currentSeason.japanese.romaji} (${currentSeason.month}/${currentSeason.day}), pas d'envoi de SMS`);
      return;
    }
    
    // Vérifier si on a déjà envoyé un SMS pour cette micro-saison
    const seasonDate = `${currentSeason.month}-${currentSeason.day}`;
    db.get('SELECT * FROM sent_notifications WHERE season_id = ? AND season_date = ?', 
           [currentSeason.id, seasonDate], async (err, row) => {
      if (err) {
        console.error('Erreur vérification notification:', err);
        return;
      }
      
      if (row) {
        console.log(`SMS déjà envoyé pour ${currentSeason.japanese.romaji} (${seasonDate})`);
        return;
      }
      
      // Envoyer les SMS
      const message = `Aujourd'hui s'ouvre ${currentSeason.japanese.romaji}, la saison pendant laquelle ${currentSeason.translations.fr}. koyomi.heretique.fr`;
      
      // Récupérer tous les abonnés actifs
      db.all('SELECT phone_number FROM subscribers WHERE active = 1', [], async (err, rows) => {
        if (err) {
          console.error('Erreur récupération abonnés:', err);
          return;
        }
        
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
      });
    });
    
  } catch (error) {
    console.error('Erreur vérification micro-saison:', error);
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

// Cron job pour vérifier les changements de micro-saison (tous les jours à 8h)
cron.schedule('0 8 * * *', () => {
  console.log('Vérification des changements de micro-saison...');
  checkMicroSeasonChange();
});


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
    const seasonDate = `${currentSeason.month}-${currentSeason.day}`;
    
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

// Route pour envoyer des alertes SMS (utilisée par le monitoring)
app.post('/api/alert', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'Numéro de téléphone et message requis' });
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const alertMessage = `🚨 KoCal Alert: ${message}`;
    
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
