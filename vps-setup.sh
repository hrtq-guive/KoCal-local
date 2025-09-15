#!/bin/bash

# Script de configuration initiale du VPS pour KoCal
# À exécuter une seule fois sur le VPS

set -e

echo "🚀 Configuration initiale du VPS pour KoCal..."

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Variables
PROJECT_DIR="/var/www/kocal"
SERVICE_NAME="kocal"
REPO_URL="https://github.com/VOTRE_USERNAME/KoCal-local.git"  # À modifier

log "Installation des dépendances système..."
sudo apt update
sudo apt install -y nodejs npm nginx git curl

log "Vérification de Node.js..."
node --version
npm --version

log "Création du répertoire du projet..."
sudo mkdir -p $PROJECT_DIR
sudo chown $USER:$USER $PROJECT_DIR

log "Clonage du repository..."
cd $PROJECT_DIR
git clone $REPO_URL .

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
    server_name _;
    
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
sudo rm -f /etc/nginx/sites-enabled/default
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

log "✅ Configuration VPS terminée !"
log "🌐 Votre site est accessible sur: http://$(curl -s ifconfig.me)"
log "📱 API disponible sur: http://$(curl -s ifconfig.me)/api"
log "📋 Logs du service: sudo journalctl -u $SERVICE_NAME -f"
log "🔄 Redémarrage: sudo systemctl restart $SERVICE_NAME"

warn "⚠️  Prochaines étapes:"
warn "   1. Créer le repository GitHub"
warn "   2. Configurer les secrets GitHub Actions"
warn "   3. Configurer .env avec vos identifiants Twilio"
warn "   4. Configurer SSL avec Let's Encrypt"
