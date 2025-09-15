# KoCal - 72 Micro-saisons japonaises

Application web affichant la micro-saison japonaise actuelle avec notifications SMS.

## 🌸 Fonctionnalités

- **Affichage en temps réel** de la micro-saison actuelle
- **Notifications SMS** via Twilio
- **Interface élégante** et responsive
- **API REST** pour l'inscription/désinscription

## 🚀 Déploiement sur VPS

### Prérequis
- Node.js 18+
- npm
- Compte Twilio

### Installation

1. **Cloner le projet**
```bash
git clone <votre-repo>
cd KoCal-local
```

2. **Installer les dépendances**
```bash
cd backend
npm install
```

3. **Configurer Twilio**
```bash
cp env.example .env
# Éditer .env avec vos identifiants Twilio
```

4. **Démarrer le serveur**
```bash
npm start
```

### Configuration serveur

- **Frontend** : Port 80/443 (Nginx)
- **Backend** : Port 3001
- **Base de données** : SQLite (fichier local)

### Variables d'environnement

```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_twilio_number
PORT=3001
```

## 📱 API Endpoints

- `POST /api/subscribe` - Inscription SMS
- `POST /api/unsubscribe` - Désabonnement
- `POST /api/test-notification` - Test envoi
- `GET /api/health` - État du serveur

## ⏰ Notifications automatiques

Cron job quotidien à 8h pour détecter les changements de micro-saison.

## 🛠️ Développement

```bash
# Frontend (port 8000)
python3 -m http.server 8000

# Backend (port 3001)
cd backend && npm start
```
