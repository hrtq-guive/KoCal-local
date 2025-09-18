# 📊 Monitoring KoCal - Guide de Surveillance

## 🎯 Objectif

Système de monitoring automatique pour détecter et prévenir les problèmes avant qu'ils n'affectent les utilisateurs.

## 🔧 Installation

### Sur le VPS (Linux)

```bash
# Se connecter au VPS
ssh root@51.159.154.243

# Aller dans le dossier de l'application
cd /opt/KoCal-local

# Récupérer les dernières modifications
git pull origin main

# Configurer le monitoring
sudo ./scripts/setup-monitoring.sh
```

### En local (macOS/Windows)

```bash
# Tester le script
./scripts/health-check.sh

# Voir les logs
tail -f logs/kocal-health.log
```

## 📋 Vérifications Effectuées

### ✅ Vérifications Critiques

1. **Processus Node.js**
   - Détecte s'il y a 0, 1 ou plusieurs processus
   - Alerte si doublons détectés

2. **Service systemd** (Linux uniquement)
   - Vérifie que le service est actif
   - Alerte si le service est arrêté

3. **API Accessible**
   - Teste `http://localhost:3001/api/health`
   - Alerte si l'API ne répond pas

4. **Base de données**
   - Vérifie l'accès au fichier SQLite
   - Alerte si la DB est inaccessible

5. **Port 3001**
   - Vérifie que le port est en écoute
   - Alerte si le port n'est pas ouvert

### ⚠️ Vérifications d'Attention

6. **Espace disque**
   - Alerte si > 80% utilisé
   - Critique si > 90% utilisé

7. **Mémoire** (Linux uniquement)
   - Alerte si > 80% utilisée
   - Critique si > 90% utilisée

8. **Processus PM2**
   - Détecte les processus PM2 orphelins
   - Alerte en cas de conflit avec systemd

## ⏰ Exécution Automatique

### Cron Job (Linux)

```bash
# Voir le cron configuré
crontab -l

# Éditer le cron
crontab -e

# Le job configuré :
0 * * * * /opt/KoCal-local/scripts/health-check.sh >> /var/log/kocal-health.log 2>&1
```

**Fréquences possibles :**
- `0 * * * *` : Toutes les heures (recommandé)
- `*/30 * * * *` : Toutes les 30 minutes
- `0 */6 * * * *` : Toutes les 6 heures
- `0 8 * * *` : Quotidien à 8h

## 📧 Alertes

### Types d'Alertes

1. **CRITIQUE** : Problème majeur nécessitant une intervention immédiate
2. **ATTENTION** : Problème mineur à surveiller
3. **INFO** : Information normale

### Méthodes d'Alerte

- **Logs** : `/var/log/kocal-health.log` (Linux) ou `./logs/kocal-health.log` (local)
- **Email** : Via `mail` (si configuré)
- **Syslog** : Via `logger` (Linux)

## 🛠️ Commandes Utiles

### Vérifications Manuelles

```bash
# Test complet
./scripts/health-check.sh

# Voir les logs en temps réel
tail -f /var/log/kocal-health.log

# Voir les dernières vérifications
tail -20 /var/log/kocal-health.log

# Voir les erreurs uniquement
grep "ERROR" /var/log/kocal-health.log
```

### Gestion du Cron

```bash
# Voir les jobs configurés
crontab -l

# Éditer les jobs
crontab -e

# Supprimer tous les jobs
crontab -r

# Tester le cron
sudo run-parts /etc/cron.hourly
```

### Diagnostic Rapide

```bash
# Vérifier les processus Node.js
ps aux | grep "node server.js" | grep -v grep

# Vérifier le service systemd
sudo systemctl status kocal-backend

# Tester l'API
curl http://localhost:3001/api/health

# Vérifier le port
netstat -tlnp | grep :3001
```

## 🚨 Résolution des Problèmes

### Processus Multiples

```bash
# Voir tous les processus Node.js
ps aux | grep "node server.js"

# Arrêter un processus spécifique
kill <PID>

# Arrêter tous les processus Node.js
pkill -f "node server.js"

# Redémarrer le service
sudo systemctl restart kocal-backend
```

### Service Arrêté

```bash
# Redémarrer le service
sudo systemctl restart kocal-backend

# Voir les logs du service
sudo journalctl -u kocal-backend -f

# Vérifier la configuration
sudo systemctl status kocal-backend
```

### API Inaccessible

```bash
# Vérifier que le serveur tourne
ps aux | grep "node server.js"

# Vérifier le port
netstat -tlnp | grep :3001

# Tester manuellement
curl -v http://localhost:3001/api/health

# Redémarrer si nécessaire
sudo systemctl restart kocal-backend
```

## 📊 Exemple de Logs

```
[2025-09-18 11:18:19] 🔍 Début des vérifications de santé KoCal
[2025-09-18 11:18:19] ✅ Processus Node.js: 1 (OK)
[2025-09-18 11:18:19] ✅ Service systemd: Actif (OK)
[2025-09-18 11:18:19] ✅ API: Accessible (OK)
[2025-09-18 11:18:19] ✅ Base de données: Accessible (OK)
[2025-09-18 11:18:19] ✅ Espace disque: 4% utilisé (OK)
[2025-09-18 11:18:19] ✅ Mémoire: 45% utilisée (OK)
[2025-09-18 11:18:19] ✅ PM2: Aucun processus détecté (OK)
[2025-09-18 11:18:19] ✅ Port 3001: En écoute (OK)
[2025-09-18 11:18:19] 🎉 Toutes les vérifications sont OK - Système en bonne santé
[2025-09-18 11:18:19] 🔍 Fin des vérifications de santé KoCal
```

## 🔄 Maintenance

### Nettoyage des Logs

```bash
# Rotation automatique (à configurer)
logrotate /etc/logrotate.d/kocal-health

# Nettoyage manuel
find /var/log -name "kocal-health.log*" -mtime +30 -delete
```

### Mise à Jour

```bash
# Récupérer les dernières modifications
git pull origin main

# Redémarrer le service
sudo systemctl restart kocal-backend

# Tester le monitoring
./scripts/health-check.sh
```

---

**Dernière mise à jour : 18 septembre 2025**
