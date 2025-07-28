#!/bin/bash

# Zapin WhatsApp SaaS Platform - Backup Script
# This script creates backups of database, Redis, and application files

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
DOCKER_COMPOSE_FILE="docker-compose.yml"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        log_info "Created backup directory: $BACKUP_DIR"
    fi
}

backup_database() {
    log_info "Backing up PostgreSQL database..."
    
    local backup_file="$BACKUP_DIR/postgres_backup_$DATE.sql"
    
    if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_dump -U zapin zapin_db > "$backup_file"; then
        log_success "Database backup created: $backup_file"
        
        # Compress the backup
        gzip "$backup_file"
        log_success "Database backup compressed: $backup_file.gz"
    else
        log_error "Failed to backup database"
        return 1
    fi
}

backup_redis() {
    log_info "Backing up Redis data..."
    
    # Trigger Redis background save
    if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T redis redis-cli BGSAVE; then
        log_info "Redis background save triggered"
        
        # Wait for save to complete
        sleep 5
        
        # Copy Redis dump file
        local backup_file="$BACKUP_DIR/redis_backup_$DATE.rdb"
        if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T redis cat /data/dump.rdb > "$backup_file"; then
            log_success "Redis backup created: $backup_file"
        else
            log_warning "Failed to copy Redis dump file"
        fi
    else
        log_error "Failed to trigger Redis backup"
        return 1
    fi
}

backup_application_files() {
    log_info "Backing up application files..."
    
    local backup_file="$BACKUP_DIR/app_backup_$DATE.tar.gz"
    
    # Files and directories to backup
    local files_to_backup=(
        ".env.production"
        "docker-compose.yml"
        "nginx/"
        "monitoring/"
        "ssl/"
        "scripts/"
    )
    
    # Create tar archive
    if tar -czf "$backup_file" "${files_to_backup[@]}" 2>/dev/null; then
        log_success "Application files backup created: $backup_file"
    else
        log_error "Failed to backup application files"
        return 1
    fi
}

backup_logs() {
    log_info "Backing up log files..."
    
    local backup_file="$BACKUP_DIR/logs_backup_$DATE.tar.gz"
    
    if [ -d "logs" ]; then
        if tar -czf "$backup_file" logs/ 2>/dev/null; then
            log_success "Logs backup created: $backup_file"
        else
            log_warning "Failed to backup logs"
        fi
    else
        log_warning "No logs directory found"
    fi
}

cleanup_old_backups() {
    log_info "Cleaning up old backups..."
    
    # Keep only last 7 days of backups
    find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "*.rdb" -mtime +7 -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete 2>/dev/null || true
    
    log_success "Old backups cleaned up (kept last 7 days)"
}

create_backup_manifest() {
    log_info "Creating backup manifest..."
    
    local manifest_file="$BACKUP_DIR/backup_manifest_$DATE.txt"
    
    cat > "$manifest_file" << EOF
Zapin WhatsApp SaaS Platform - Backup Manifest
==============================================
Backup Date: $(date)
Backup Directory: $BACKUP_DIR

Files in this backup:
EOF
    
    # List all backup files created today
    find "$BACKUP_DIR" -name "*$DATE*" -type f >> "$manifest_file"
    
    # Add system information
    cat >> "$manifest_file" << EOF

System Information:
- Hostname: $(hostname)
- OS: $(uname -a)
- Docker Version: $(docker --version)
- Docker Compose Version: $(docker-compose --version)

Container Status:
EOF
    
    docker-compose -f "$DOCKER_COMPOSE_FILE" ps >> "$manifest_file" 2>/dev/null || echo "Failed to get container status" >> "$manifest_file"
    
    log_success "Backup manifest created: $manifest_file"
}

verify_backups() {
    log_info "Verifying backups..."
    
    local errors=0
    
    # Check if database backup exists and is not empty
    local db_backup="$BACKUP_DIR/postgres_backup_$DATE.sql.gz"
    if [ -f "$db_backup" ] && [ -s "$db_backup" ]; then
        log_success "Database backup verified: $db_backup"
    else
        log_error "Database backup verification failed"
        ((errors++))
    fi
    
    # Check if Redis backup exists
    local redis_backup="$BACKUP_DIR/redis_backup_$DATE.rdb"
    if [ -f "$redis_backup" ]; then
        log_success "Redis backup verified: $redis_backup"
    else
        log_warning "Redis backup not found (this may be normal)"
    fi
    
    # Check if application backup exists
    local app_backup="$BACKUP_DIR/app_backup_$DATE.tar.gz"
    if [ -f "$app_backup" ] && [ -s "$app_backup" ]; then
        log_success "Application backup verified: $app_backup"
    else
        log_error "Application backup verification failed"
        ((errors++))
    fi
    
    if [ $errors -eq 0 ]; then
        log_success "All backups verified successfully"
        return 0
    else
        log_error "$errors backup(s) failed verification"
        return 1
    fi
}

restore_database() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        log_error "Please specify a backup file to restore"
        echo "Usage: $0 restore-db <backup_file>"
        echo "Available backups:"
        ls -la "$BACKUP_DIR"/postgres_backup_*.sql.gz 2>/dev/null || echo "No database backups found"
        return 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    log_warning "This will overwrite the current database. Are you sure?"
    read -p "Type 'yes' to continue: " -r
    if [ "$REPLY" != "yes" ]; then
        log_info "Database restore cancelled"
        return 0
    fi
    
    log_info "Restoring database from: $backup_file"
    
    # Stop the application to prevent connections
    docker-compose -f "$DOCKER_COMPOSE_FILE" stop zapin-app
    
    # Restore database
    if zcat "$backup_file" | docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres psql -U zapin -d zapin_db; then
        log_success "Database restored successfully"
        
        # Restart application
        docker-compose -f "$DOCKER_COMPOSE_FILE" start zapin-app
        log_success "Application restarted"
    else
        log_error "Database restore failed"
        docker-compose -f "$DOCKER_COMPOSE_FILE" start zapin-app
        return 1
    fi
}

show_backup_info() {
    log_success "Backup completed successfully!"
    echo
    echo "📁 Backup Location: $BACKUP_DIR"
    echo "📅 Backup Date: $(date)"
    echo
    echo "📊 Backup Files Created:"
    find "$BACKUP_DIR" -name "*$DATE*" -type f -exec ls -lh {} \;
    echo
    echo "💾 Total Backup Size:"
    du -sh "$BACKUP_DIR"
    echo
    echo "🔧 Management Commands:"
    echo "   List backups:        ls -la $BACKUP_DIR"
    echo "   Restore database:    $0 restore-db <backup_file>"
    echo "   Clean old backups:   $0 cleanup"
    echo
}

# Main backup process
main() {
    echo "💾 Starting Zapin Platform Backup"
    echo "================================="
    
    create_backup_dir
    
    # Perform backups
    backup_database
    backup_redis
    backup_application_files
    backup_logs
    
    # Create manifest and verify
    create_backup_manifest
    
    if verify_backups; then
        cleanup_old_backups
        show_backup_info
    else
        log_error "Backup verification failed. Please check the logs."
        exit 1
    fi
}

# Handle script arguments
case "${1:-}" in
    "restore-db")
        restore_database "$2"
        ;;
    "cleanup")
        cleanup_old_backups
        ;;
    "verify")
        verify_backups
        ;;
    "list")
        echo "Available backups in $BACKUP_DIR:"
        ls -la "$BACKUP_DIR" 2>/dev/null || echo "No backups found"
        ;;
    *)
        main
        ;;
esac