#!/bin/bash

# Script de monitoring KoCal - Vérifications automatiques
# Usage: ./health-check.sh
# Exécution: Cron job toutes les heures

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
LOG_FILE="./logs/kocal-health.log"
ALERT_EMAIL="kevin.echraghi@heretique.fr"
ALERT_SMS="+33627252432"
API_URL="http://localhost:3001/api/health"
SERVICE_NAME="kocal-backend"

# Créer le dossier de logs s'il n'existe pas
mkdir -p ./logs

# Fonction de logging
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARN${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO${NC} $1" | tee -a "$LOG_FILE"
}

# Fonction d'alerte email (problèmes mineurs)
send_email_alert() {
    local message="$1"
    warn "$message"
    
    # Envoyer par email si configuré
    if [ -n "$ALERT_EMAIL" ] && command -v mail >/dev/null 2>&1; then
        echo "$message" | mail -s "KoCal Health Alert - Attention" "$ALERT_EMAIL"
    fi
    
    # Log dans syslog
    logger -t "kocal-health" "$message"
}

# Fonction d'alerte critique (SMS + Email)
send_critical_alert() {
    local message="$1"
    error "$message"
    
    # Envoyer par email
    if [ -n "$ALERT_EMAIL" ] && command -v mail >/dev/null 2>&1; then
        echo "$message" | mail -s "KoCal Health Alert - CRITIQUE" "$ALERT_EMAIL"
    fi
    
    # Envoyer par SMS via l'API existante
    if [ -n "$ALERT_SMS" ] && curl -s --max-time 10 "$API_URL" >/dev/null 2>&1; then
        curl -X POST http://localhost:3001/api/alert \
          -H "Content-Type: application/json" \
          -d "{\"phoneNumber\":\"$ALERT_SMS\",\"message\":\"$message\"}" \
          >/dev/null 2>&1 || true
    fi
    
    # Log dans syslog
    logger -t "kocal-health" "CRITICAL: $message"
}

# Vérification 1: Nombre de processus Node.js
check_node_processes() {
    local node_count=$(ps aux | grep "node server.js" | grep -v grep | wc -l)
    
    if [ "$node_count" -eq 0 ]; then
        send_critical_alert "CRITIQUE: Aucun processus Node.js détecté - Service arrêté"
        return 1
    elif [ "$node_count" -gt 1 ]; then
        send_email_alert "ATTENTION: $node_count processus Node.js détectés - Risque de doublons"
        return 1
    else
        log "✅ Processus Node.js: 1 (OK)"
        return 0
    fi
}

# Vérification 2: Service systemd (Linux uniquement)
check_systemd_service() {
    if command -v systemctl >/dev/null 2>&1; then
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            log "✅ Service systemd: Actif (OK)"
            return 0
        else
            send_critical_alert "CRITIQUE: Service systemd $SERVICE_NAME inactif"
            return 1
        fi
    else
        log "ℹ️  Service systemd: Non disponible (macOS/Windows)"
        return 0
    fi
}

# Vérification 3: API accessible
check_api() {
    if curl -s --max-time 10 "$API_URL" >/dev/null 2>&1; then
        log "✅ API: Accessible (OK)"
        return 0
    else
        send_critical_alert "CRITIQUE: API non accessible sur $API_URL"
        return 1
    fi
}

# Vérification 4: Base de données
check_database() {
    local db_path="./backend/subscribers.db"
    
    if [ -f "$db_path" ] && [ -r "$db_path" ]; then
        log "✅ Base de données: Accessible (OK)"
        return 0
    else
        send_critical_alert "CRITIQUE: Base de données inaccessible: $db_path"
        return 1
    fi
}

# Vérification 5: Espace disque
check_disk_space() {
    local usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ "$usage" -lt 80 ]; then
        log "✅ Espace disque: ${usage}% utilisé (OK)"
        return 0
    elif [ "$usage" -lt 90 ]; then
        send_email_alert "⚠️ Espace disque: ${usage}% utilisé (ATTENTION)"
        return 0
    else
        send_critical_alert "CRITIQUE: Espace disque: ${usage}% utilisé (CRITIQUE)"
        return 1
    fi
}

# Vérification 6: Mémoire
check_memory() {
    if command -v free >/dev/null 2>&1; then
        local mem_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
        
        if [ "$mem_usage" -lt 80 ]; then
            log "✅ Mémoire: ${mem_usage}% utilisée (OK)"
            return 0
        elif [ "$mem_usage" -lt 90 ]; then
            send_email_alert "⚠️ Mémoire: ${mem_usage}% utilisée (ATTENTION)"
            return 0
        else
            send_critical_alert "CRITIQUE: Mémoire: ${mem_usage}% utilisée (CRITIQUE)"
            return 1
        fi
    else
        log "ℹ️  Mémoire: Non disponible (macOS/Windows)"
        return 0
    fi
}

# Vérification 7: Processus PM2 orphelins
check_pm2_processes() {
    local pm2_count=$(ps aux | grep "PM2" | grep -v grep | wc -l)
    
    if [ "$pm2_count" -gt 0 ]; then
        send_email_alert "⚠️ Processus PM2 détectés: $pm2_count (Risque de conflit avec systemd)"
        return 1
    else
        log "✅ PM2: Aucun processus détecté (OK)"
        return 0
    fi
}

# Vérification 8: Port 3001
check_port() {
    if command -v netstat >/dev/null 2>&1; then
        if netstat -tlnp 2>/dev/null | grep -q ":3001 "; then
            log "✅ Port 3001: En écoute (OK)"
            return 0
        else
            send_critical_alert "CRITIQUE: Port 3001 non en écoute"
            return 1
        fi
    elif command -v lsof >/dev/null 2>&1; then
        if lsof -i :3001 >/dev/null 2>&1; then
            log "✅ Port 3001: En écoute (OK)"
            return 0
        else
            send_critical_alert "CRITIQUE: Port 3001 non en écoute"
            return 1
        fi
    else
        log "ℹ️  Port: Vérification non disponible"
        return 0
    fi
}

# Fonction principale
main() {
    log "🔍 Début des vérifications de santé KoCal"
    
    local errors=0
    
    # Exécuter toutes les vérifications
    check_node_processes || ((errors++))
    check_systemd_service || ((errors++))
    check_api || ((errors++))
    check_database || ((errors++))
    check_disk_space || ((errors++))
    check_memory || ((errors++))
    check_pm2_processes || ((errors++))
    check_port || ((errors++))
    
    # Résumé
    if [ "$errors" -eq 0 ]; then
        log "🎉 Toutes les vérifications sont OK - Système en bonne santé"
    else
        error "❌ $errors erreur(s) détectée(s) - Vérification manuelle requise"
    fi
    
    log "🔍 Fin des vérifications de santé KoCal"
    echo "---" >> "$LOG_FILE"
    
    exit $errors
}

# Exécution
main "$@"
