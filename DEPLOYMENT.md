# 🚀 Guide de Déploiement KoCal

## 📋 Vue d'ensemble

Ce guide vous explique comment déployer KoCal sur un VPS Scaleway avec déploiement automatique via GitHub Actions.

## 🔧 Prérequis

- VPS Scaleway avec Ubuntu 20.04+
- Compte GitHub
- Compte Twilio
- Domaine (optionnel, pour SSL)

## 📝 Étapes de déploiement

### 1. Créer le repository GitHub

```bash
# Sur votre machine locale
git remote add origin https://github.com/VOTRE_USERNAME/KoCal-local.git
git push -u origin main
```

### 2. Configurer le VPS

```bash
# Sur votre VPS Scaleway
wget https://raw.githubusercontent.com/VOTRE_USERNAME/KoCal-local/main/vps-setup.sh
chmod +x vps-setup.sh
./vps-setup.sh
```

### 3. Configurer les secrets GitHub Actions

Dans votre repository GitHub, allez dans **Settings > Secrets and variables > Actions** et ajoutez :

- `VPS_HOST` : L'IP de votre VPS
- `VPS_USERNAME` : Votre nom d'utilisateur VPS
- `VPS_SSH_KEY` : Votre clé SSH privée
- `VPS_PORT` : Port SSH (généralement 22)

### 4. Configurer Twilio

```bash
# Sur votre VPS
cd /var/www/kocal/backend
nano .env
```

Ajoutez vos identifiants Twilio :
```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
PORT=3001
```

### 5. Configurer SSL (optionnel)

```bash
# Sur votre VPS
wget https://raw.githubusercontent.com/VOTRE_USERNAME/KoCal-local/main/ssl-setup.sh
chmod +x ssl-setup.sh
./ssl-setup.sh votre-domaine.com
```

## 🔄 Déploiement automatique

Une fois configuré, chaque push sur la branche `main` déclenchera automatiquement :

1. ✅ Tests et validation
2. 🔄 Déploiement sur le VPS
3. 📱 Redémarrage du service
4. 🧪 Tests de fonctionnement

## 📊 Monitoring

### Vérifier le statut du service
```bash
sudo systemctl status kocal
```

### Voir les logs
```bash
sudo journalctl -u kocal -f
```

### Tester l'API
```bash
curl http://localhost:3001/api/health
```

## 🛠️ Commandes utiles

### Redémarrer le service
```bash
sudo systemctl restart kocal
```

### Mettre à jour manuellement
```bash
cd /var/www/kocal
git pull origin main
cd backend
npm install
sudo systemctl restart kocal
```

### Sauvegarder la base de données
```bash
cp /var/www/kocal/backend/subscribers.db /backup/subscribers-$(date +%Y%m%d).db
```

## 🔒 Sécurité

- ✅ Firewall configuré
- ✅ SSL avec Let's Encrypt
- ✅ Service systemd sécurisé
- ✅ Nginx avec proxy reverse
- ✅ Variables d'environnement protégées

## 📱 Fonctionnalités

- 🌸 Affichage des micro-saisons
- 📱 Notifications SMS automatiques
- 🔄 Déploiement continu
- 📊 Monitoring intégré
- 🔒 Sécurité renforcée

## 🆘 Dépannage

### Le service ne démarre pas
```bash
sudo journalctl -u kocal --no-pager
```

### L'API ne répond pas
```bash
curl -v http://localhost:3001/api/health
```

### Problème de permissions
```bash
sudo chown -R $USER:$USER /var/www/kocal
```

## 📞 Support

En cas de problème, vérifiez :
1. Les logs du service
2. La configuration Nginx
3. Les variables d'environnement
4. La connectivité réseau
