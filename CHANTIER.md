# 🚧 CHANTIER KoCal - Interface d'administration

## 📋 TODO LIST

### 🔧 À faire
- [ ] **Faire fonctionner la page admin**
  - [ ] Diagnostiquer pourquoi `/api/admin/subscribers` ne répond pas
  - [ ] Corriger les routes d'administration sur le VPS
  - [ ] Tester l'interface d'administration complète

- [ ] **Automatiser le déploiement GitHub → Scaleway**
  - [ ] Configurer un webhook GitHub
  - [ ] Créer un script de déploiement automatique
  - [ ] Tester le pipeline de déploiement

## 🏗️ ARCHITECTURE DE L'APPLICATION

### 📁 Structure du projet
```
KoCal-local/
├── index.html              # Page principale (micro-saisons)
├── admin.html              # Interface d'administration
├── scripts/
│   └── app.js              # JavaScript frontend
├── data/
│   └── micro-seasons.json  # Base de données des 72 micro-saisons
├── backend/
│   ├── server.js           # API Node.js + Express
│   ├── package.json        # Dépendances Node.js
│   ├── .env                # Configuration Twilio (PRODUCTION)
│   ├── env.example         # Template de configuration
│   └── subscribers.db      # Base SQLite des abonnés
└── CHANTIER.md             # Ce fichier
```

### 🌐 Déploiement
- **Frontend** : Nginx (port 80/443) → https://koyomi.heretique.fr
- **Backend** : Node.js (port 3001) → API REST
- **Base de données** : SQLite (fichier local)
- **SMS** : Twilio API

### 🔗 URLs et accès
- **Site principal** : https://koyomi.heretique.fr
- **Interface admin** : https://koyomi.heretique.fr/admin.html
- **API Backend** : http://localhost:3001/api (interne)
- **VPS IP** : 51.159.154.243

### 🔐 Identifiants et configuration

#### VPS Scaleway
- **IP** : 51.159.154.243
- **Utilisateur** : root
- **Connexion** : `ssh root@51.159.154.243`
- **Dossier app** : `/opt/KoCal-local`

#### GitHub
- **Repository** : https://github.com/hrtq-guive/KoCal-local
- **Branche principale** : main

#### Interface d'administration
- **Mot de passe** : `Heretique!2020`

#### Twilio (PRODUCTION)
- **Configuration** : `/opt/KoCal-local/backend/.env`
- **Variables** :
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`

## 🚀 COMMANDES UTILES

### Déploiement manuel
```bash
# Sur le VPS
cd /opt/KoCal-local
git pull origin main
sudo systemctl restart kocal-backend
sudo systemctl restart nginx
```

### Gestion des services
```bash
# Vérifier le statut
sudo systemctl status kocal-backend
sudo systemctl status nginx

# Redémarrer
sudo systemctl restart kocal-backend
sudo systemctl restart nginx

# Voir les logs
sudo journalctl -u kocal-backend -f
```

### Base de données
```bash
# Vider la base de données
cd /opt/KoCal-local/backend
sqlite3 subscribers.db "DELETE FROM subscribers;"

# Voir les abonnés
sqlite3 subscribers.db "SELECT * FROM subscribers;"
```

### Tests API
```bash
# Test de santé
curl http://localhost:3001/api/health

# Test inscription
curl -X POST http://localhost:3001/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+33627252432"}'

# Test notification
curl -X POST http://localhost:3001/api/test-notification
```

## 🐛 PROBLÈMES CONNUS

### Interface d'administration
- **Problème** : `/api/admin/subscribers` retourne "Cannot GET"
- **Symptôme** : L'API de base fonctionne (`/api/health`) mais pas les routes admin
- **Diagnostic** : Les routes sont présentes dans le code mais ne se chargent pas
- **Hypothèses** :
  - Erreur de syntaxe silencieuse
  - Problème de configuration Nginx
  - Routes ajoutées après `app.listen()`

### Messages SMS
- **Format bienvenue** : ✅ Fonctionne
- **Format changement** : ✅ Fonctionne
- **Twilio** : ✅ Configuré et opérationnel

## 📱 FONCTIONNALITÉS OPÉRATIONNELLES

### ✅ Ce qui marche
- Affichage des micro-saisons en temps réel
- Inscription SMS avec validation
- Envoi de SMS via Twilio
- Messages personnalisés selon le format demandé
- Service systemd avec redémarrage automatique
- Interface responsive et élégante

### ❌ Ce qui ne marche pas
- Interface d'administration (routes API non accessibles)
- Déploiement automatique GitHub → VPS

## 🎯 PROCHAINES ÉTAPES

1. **Diagnostiquer l'API admin** : Vérifier pourquoi les routes ne se chargent pas
2. **Corriger le problème** : Soit dans le code, soit dans la configuration
3. **Tester l'interface complète** : Vérifier toutes les fonctionnalités admin
4. **Configurer le déploiement automatique** : Webhook GitHub + script de déploiement
5. **Documenter le processus** : Pour les futurs déploiements

---
*Dernière mise à jour : 16 septembre 2025*
*Statut : Application fonctionnelle, interface admin à corriger*
