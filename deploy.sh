#!/bin/bash

# Script de déploiement KoCal sur VPS Scaleway
# Usage: ./deploy.sh

set -e

echo "🚀 Déploiement de KoCal sur VPS..."

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages
log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Vérifier si on est sur le VPS
if [[ "$EUID" -eq 0 ]]; then
    error "Ne pas exécuter ce script en tant que root"
    exit 1
fi

# Variables
PROJECT_DIR="/var/www/kocal"
SERVICE_NAME="kocal"
DOMAIN="votre-domaine.com"  # À modifier

log "Installation des dépendances système..."
sudo apt update
sudo apt install -y nodejs npm nginx git curl

log "Vérification de Node.js..."
node --version
npm --version

log "Création du répertoire du projet..."
sudo mkdir -p $PROJECT_DIR
sudo chown $USER:$USER $PROJECT_DIR

log "Copie des fichiers du projet..."
cp -r . $PROJECT_DIR/
cd $PROJECT_DIR

log "Installation des dépendances Node.js..."
cd backend
npm install --production

log "Configuration de l'environnement..."
if [ ! -f .env ]; then
    cp env.example .env
    warn "⚠️  N'oubliez pas de configurer .env avec vos identifiants Twilio !"
fi

log "Configuration de Nginx..."
sudo tee /etc/nginx/sites-available/$SERVICE_NAME > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    # Frontend
    location / {
        root $PROJECT_DIR;
        index index.html;
        try_files \$uri \$uri/ =404;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

log "Activation du site Nginx..."
sudo ln -sf /etc/nginx/sites-available/$SERVICE_NAME /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

log "Création du service systemd..."
sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=KoCal Backend Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR/backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

log "Activation et démarrage du service..."
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl start $SERVICE_NAME

log "Vérification du statut du service..."
sudo systemctl status $SERVICE_NAME --no-pager

log "Test de l'API..."
sleep 5
curl -f http://localhost:3001/api/health || warn "L'API n'est pas encore prête"

log "✅ Déploiement terminé !"
log "🌐 Votre site est accessible sur: http://$DOMAIN"
log "📱 API disponible sur: http://$DOMAIN/api"
log "📋 Logs du service: sudo journalctl -u $SERVICE_NAME -f"
log "🔄 Redémarrage: sudo systemctl restart $SERVICE_NAME"

warn "⚠️  N'oubliez pas de:"
warn "   1. Configurer .env avec vos identifiants Twilio"
warn "   2. Configurer votre domaine dans le script"
warn "   3. Installer SSL avec Let's Encrypt"
