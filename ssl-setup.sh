#!/bin/bash

# Script pour configurer SSL avec Let's Encrypt
# Usage: ./ssl-setup.sh votre-domaine.com

set -e

if [ -z "$1" ]; then
    echo "❌ Usage: ./ssl-setup.sh votre-domaine.com"
    exit 1
fi

DOMAIN=$1
SERVICE_NAME="kocal"

echo "🔒 Configuration SSL pour $DOMAIN..."

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

# Installation de Certbot
log "Installation de Certbot..."
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

# Arrêt temporaire de Nginx pour le challenge
log "Arrêt temporaire de Nginx..."
sudo systemctl stop nginx

# Génération du certificat
log "Génération du certificat SSL..."
sudo certbot certonly --standalone -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN

# Configuration Nginx avec SSL
log "Configuration Nginx avec SSL..."
sudo tee /etc/nginx/sites-available/$SERVICE_NAME > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    # Configuration SSL moderne
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Frontend
    location / {
        root /var/www/kocal;
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

# Redémarrage de Nginx
log "Redémarrage de Nginx..."
sudo systemctl start nginx
sudo systemctl reload nginx

# Configuration du renouvellement automatique
log "Configuration du renouvellement automatique..."
sudo crontab -l 2>/dev/null | grep -v certbot || true | sudo crontab -
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -

log "✅ SSL configuré avec succès !"
log "🌐 Votre site est maintenant accessible en HTTPS: https://$DOMAIN"
log "🔄 Le certificat se renouvellera automatiquement"
