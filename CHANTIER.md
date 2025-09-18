# 🚧 CHANTIER KoCal - Application des micro-saisons japonaises

## 📋 TODO LIST

### ✅ RÉSOLU (Septembre 2025)
- [x] **Correction de la logique d'envoi des SMS**
  - [x] Suppression des SMS quotidiens (envoyés tous les jours à 8h)
  - [x] Envoi uniquement le premier jour de chaque nouvelle micro-saison
  - [x] Élimination des doublons avec système de tracking
  - [x] Correction des dates des micro-saisons
  - [x] Nettoyage du code pour la production

- [x] **Suppression des références aux sekkis**
  - [x] Suppression de l'affichage des sekkis sur le site
  - [x] Réduction de la taille du nom des ko de 10%
  - [x] Mise à jour des textes explicatifs

- [x] **Amélioration de la robustesse du système**
  - [x] Rechargement dynamique du JSON (plus de cache Node.js)
  - [x] Élimination des problèmes de doublons SMS (PM2 vs systemd)
  - [x] Modifications des micro-saisons sans redémarrage serveur
  - [x] Système de monitoring automatique avec alertes personnalisées

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
│   ├── app.js              # JavaScript frontend
│   ├── health-check.sh     # Script de monitoring automatique
│   └── setup-monitoring.sh # Installation du monitoring
├── data/
│   └── micro-seasons.json  # Base de données des 72 micro-saisons
├── backend/
│   ├── server.js           # API Node.js + Express
│   ├── package.json        # Dépendances Node.js
│   ├── .env                # Configuration Twilio (PRODUCTION)
│   ├── env.example         # Template de configuration
│   └── subscribers.db      # Base SQLite (abonnés + notifications)
├── logs/                   # Logs de monitoring (local)
├── CHANTIER.md             # Ce fichier
└── MONITORING.md           # Documentation du monitoring
```

### 🌐 Déploiement
- **Frontend** : Nginx (port 80/443) → https://koyomi.heretique.fr
- **Backend** : Node.js (port 3001) → API REST
- **Base de données** : SQLite (fichier local)
- **SMS** : Twilio API
- **Monitoring** : Script automatique + Cron job (toutes les heures)

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

# Voir l'historique des notifications
sqlite3 subscribers.db "SELECT * FROM sent_notifications ORDER BY sent_at DESC;"

# Vider l'historique des notifications (si nécessaire)
sqlite3 subscribers.db "DELETE FROM sent_notifications;"
```

### Tests API
```bash
# Test de santé
curl http://localhost:3001/api/health

# Test inscription
curl -X POST http://localhost:3001/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+33627252432"}'

# Voir l'historique des notifications
curl http://localhost:3001/api/admin/notifications

# Test alerte SMS (monitoring)
curl -X POST http://localhost:3001/api/alert \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+33627252432","message":"Test alerte"}'
```

### Monitoring
```bash
# Test du script de monitoring
./scripts/health-check.sh

# Voir les logs de monitoring
tail -f /var/log/kocal-health.log

# Voir les erreurs uniquement
grep "ERROR" /var/log/kocal-health.log

# Configurer le monitoring sur le VPS
sudo ./scripts/setup-monitoring.sh
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
- **Format changement** : ✅ Fonctionne (corrigé en septembre 2025)
- **Twilio** : ✅ Configuré et opérationnel
- **Envoi automatique** : ✅ Corrigé (plus de doublons, envoi uniquement au changement)

## 📱 FONCTIONNALITÉS OPÉRATIONNELLES

### ✅ Ce qui marche
- Affichage des micro-saisons en temps réel (sans références aux sekkis)
- Inscription SMS avec validation
- Envoi de SMS via Twilio (logique corrigée)
- Messages personnalisés selon le format demandé
- Service systemd avec redémarrage automatique
- Interface responsive et élégante
- Système de tracking des notifications (plus de doublons)
- Envoi uniquement au changement de micro-saison
- Rechargement dynamique du JSON (plus de cache Node.js)
- Système de monitoring automatique avec alertes personnalisées

### ❌ Ce qui ne marche pas
- Interface d'administration (routes API non accessibles)
- Déploiement automatique GitHub → VPS

## 🎯 PROCHAINES ÉTAPES

1. **Diagnostiquer l'API admin** : Vérifier pourquoi les routes ne se chargent pas
2. **Corriger le problème** : Soit dans le code, soit dans la configuration
3. **Tester l'interface complète** : Vérifier toutes les fonctionnalités admin
4. **Configurer le déploiement automatique** : Webhook GitHub + script de déploiement
5. **Documenter le processus** : Pour les futurs déploiements

## 📝 CHANGELOG

### Septembre 2025
- ✅ **Correction majeure** : Logique d'envoi des SMS automatiques
- ✅ **Suppression** : Références aux sekkis sur le site
- ✅ **Amélioration** : Réduction de la taille du nom des ko de 10%
- ✅ **Ajout** : Système de tracking des notifications
- ✅ **Correction** : Calcul des dates des micro-saisons
- ✅ **Amélioration** : Rechargement dynamique du JSON (plus de cache Node.js)
- ✅ **Résolution** : Problème des doublons SMS (PM2 vs systemd)
- ✅ **Monitoring** : Système de surveillance automatique avec alertes personnalisées

---
*Dernière mise à jour : 18 septembre 2025*
*Statut : Application fonctionnelle, SMS corrigés, rechargement dynamique implémenté, monitoring automatique configuré, interface admin à corriger*
