#!/bin/bash

# Script de configuration du monitoring KoCal
# Usage: ./setup-monitoring.sh

set -e

echo "🔧 Configuration du monitoring KoCal..."

# Vérifier si on est root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Ce script doit être exécuté en tant que root"
    exit 1
fi

# Créer le répertoire de logs s'il n'existe pas
mkdir -p /var/log

# Créer le fichier de log avec les bonnes permissions
touch /var/log/kocal-health.log
chown root:root /var/log/kocal-health.log
chmod 644 /var/log/kocal-health.log

# Rendre le script exécutable
chmod +x /opt/KoCal-local/scripts/health-check.sh

# Configurer le cron job
echo "📅 Configuration du cron job..."

# Sauvegarder le crontab actuel
crontab -l > /tmp/crontab_backup 2>/dev/null || touch /tmp/crontab_backup

# Vérifier si le job existe déjà
if grep -q "health-check.sh" /tmp/crontab_backup; then
    echo "⚠️  Le cron job existe déjà"
else
    # Ajouter le nouveau cron job
    echo "0 * * * * /opt/KoCal-local/scripts/health-check.sh >> /var/log/kocal-health.log 2>&1" >> /tmp/crontab_backup
    crontab /tmp/crontab_backup
    echo "✅ Cron job ajouté (exécution toutes les heures)"
fi

# Nettoyer
rm -f /tmp/crontab_backup

# Installer mailutils si nécessaire pour les alertes email
if ! command -v mail >/dev/null 2>&1; then
    echo "📧 Installation de mailutils pour les alertes email..."
    apt update && apt install -y mailutils
fi

# Tester le script
echo "🧪 Test du script de monitoring..."
/opt/KoCal-local/scripts/health-check.sh

echo ""
echo "✅ Configuration terminée !"
echo ""
echo "📋 Informations:"
echo "   - Script: /opt/KoCal-local/scripts/health-check.sh"
echo "   - Logs: /var/log/kocal-health.log"
echo "   - Cron: Toutes les heures"
echo "   - Voir les logs: tail -f /var/log/kocal-health.log"
echo "   - Voir le cron: crontab -l"
echo ""
echo "🔧 Commandes utiles:"
echo "   - Test manuel: /opt/KoCal-local/scripts/health-check.sh"
echo "   - Voir les logs: tail -f /var/log/kocal-health.log"
echo "   - Désactiver: crontab -e (commenter la ligne)"
echo ""
