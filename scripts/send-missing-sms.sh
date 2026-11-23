#!/bin/bash

# Script pour déployer et envoyer le SMS manquant
# Usage: ./scripts/send-missing-sms.sh

set -e

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration VPS
VPS_HOST="51.159.154.243"
VPS_USER="root"
PROJECT_DIR="/opt/KoCal-local"
SERVICE_NAMES=("kocal-backend" "kocal")

log "🚀 Déploiement et envoi du SMS manquant..."

# Étape 1: Déployer le code sur le VPS
log "📦 Étape 1: Déploiement du code sur le VPS..."
ssh "$VPS_USER@$VPS_HOST" << 'DEPLOY_EOF'
    set -e
    cd /opt/KoCal-local
    
    # Sauvegarder la base de données
    cp backend/subscribers.db /tmp/subscribers.db.backup 2>/dev/null || true
    
    # Récupérer les dernières modifications
    git fetch origin
    git reset --hard origin/main
    
    # Restaurer la base de données
    cp /tmp/subscribers.db.backup backend/subscribers.db 2>/dev/null || true
    
    # Installer les dépendances si nécessaire
    cd backend
    npm install --production
    
    echo "✅ Code déployé"
DEPLOY_EOF

# Étape 2: Redémarrer le service
log "🔄 Étape 2: Redémarrage du service..."
SERVICE_FOUND=false
for SERVICE_NAME in "${SERVICE_NAMES[@]}"; do
    if ssh "$VPS_USER@$VPS_HOST" "systemctl list-units --type=service 2>/dev/null | grep -q '$SERVICE_NAME'" 2>/dev/null; then
        log "Service trouvé: $SERVICE_NAME"
        ssh "$VPS_USER@$VPS_HOST" "sudo systemctl restart $SERVICE_NAME" 2>/dev/null
        sleep 3
        SERVICE_FOUND=true
        break
    fi
done

if [ "$SERVICE_FOUND" = false ]; then
    warn "Service systemd non trouvé, démarrage manuel..."
    ssh "$VPS_USER@$VPS_HOST" << 'START_EOF'
        cd /opt/KoCal-local/backend
        pkill -f "node server.js" || true
        sleep 2
        nohup node server.js > /tmp/kocal.log 2>&1 &
        sleep 3
START_EOF
fi

# Étape 3: Vérifier que l'API fonctionne
log "🧪 Étape 3: Vérification de l'API..."
sleep 2
if ssh "$VPS_USER@$VPS_HOST" "curl -f http://localhost:3001/api/health > /dev/null 2>&1"; then
    log "✅ API accessible"
else
    error "❌ API non accessible"
    ssh "$VPS_USER@$VPS_HOST" "tail -20 /tmp/kocal.log 2>/dev/null || sudo journalctl -u kocal-backend -n 20 --no-pager 2>/dev/null || sudo journalctl -u kocal -n 20 --no-pager 2>/dev/null"
    exit 1
fi

# Étape 4: Envoyer le SMS
log "📱 Étape 4: Envoi du SMS..."
RESPONSE=$(ssh "$VPS_USER@$VPS_HOST" "cd $PROJECT_DIR/backend && curl -s -X POST -H \"Authorization: Bearer \$(grep -E '^ADMIN_PASSWORD=' .env | cut -d= -f2-)\" http://localhost:3001/api/admin/force-send-notification")

# Afficher le résultat
echo ""
log "📊 Résultat de l'envoi :"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

# Vérifier le succès
if echo "$RESPONSE" | grep -q '"success":true'; then
    log "✅ SMS envoyé avec succès !"
else
    error "❌ Erreur lors de l'envoi"
    exit 1
fi

log "🎉 Terminé ! Le SMS a été envoyé à tous les abonnés actifs."

