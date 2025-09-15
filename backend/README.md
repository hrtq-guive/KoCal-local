# Backend KoCal - Service SMS

## 🚀 Démarrage rapide

### 1. Installation des dépendances
```bash
npm install
```

### 2. Configuration Twilio
1. Créez un compte sur [Twilio](https://www.twilio.com/)
2. Copiez `env.example` vers `.env`
3. Remplissez vos identifiants Twilio dans `.env`

### 3. Démarrage du serveur
```bash
npm start
```

## 📱 API Endpoints

### POST /api/subscribe
Inscription aux notifications SMS
```json
{
  "phoneNumber": "+33 6 12 34 56 78"
}
```

### POST /api/unsubscribe
Désabonnement
```json
{
  "phoneNumber": "+33 6 12 34 56 78"
}
```

### POST /api/test-notification
Déclenche manuellement l'envoi des notifications (pour les tests)

### GET /api/health
Vérification de l'état du serveur

## 🗄️ Base de données

SQLite avec table `subscribers` :
- `id` : Identifiant unique
- `phone_number` : Numéro de téléphone (format international)
- `created_at` : Date d'inscription
- `active` : Statut actif/inactif

## ⏰ Notifications automatiques

- **Cron job** : Tous les jours à 8h
- **Vérification** : Changement de micro-saison
- **Envoi** : SMS à tous les abonnés actifs

## 🔧 Configuration

Variables d'environnement dans `.env` :
- `TWILIO_ACCOUNT_SID` : Identifiant compte Twilio
- `TWILIO_AUTH_TOKEN` : Token d'authentification Twilio
- `TWILIO_PHONE_NUMBER` : Numéro Twilio pour l'envoi
- `PORT` : Port du serveur (défaut: 3001)
