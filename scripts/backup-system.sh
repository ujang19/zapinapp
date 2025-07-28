#!/bin/bash

# Comprehensive Backup System for Zapin WhatsApp SaaS
# This script handles database, file, and configuration backups

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load configuration
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    source "$PROJECT_ROOT/.env"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Configuration
BACKUP_BASE_DIR="${BACKUP_DIR:-/opt/backups/zapin}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DATE=$(date +"%Y-%m-%d")
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
COMPRESSION_LEVEL="${BACKUP_COMPRESSION_LEVEL:-6}"
ENCRYPTION_ENABLED="${BACKUP_ENCRYPTION:-false}"
S3_ENABLED="${BACKUP_S3_ENABLED:-false}"

# Backup directories
DB_BACKUP_DIR="$BACKUP_BASE_DIR/database"
FILES_BACKUP_DIR="$BACKUP_BASE_DIR/files"
CONFIG_BACKUP_DIR="$BACKUP_BASE_DIR/config"
LOGS_BACKUP_DIR="$BACKUP_BASE_DIR/logs"
FULL_BACKUP_DIR="$BACKUP_BASE_DIR/full"

# Database configuration
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_NAME="${DATABASE_NAME:-zapin}"
DB_USER="${DATABASE_USER:-zapin_user}"
DB_PASSWORD="${DATABASE_PASSWORD}"

# Redis configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

# S3 configuration
S3_BUCKET="${BACKUP_S3_BUCKET:-}"
S3_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}"

# Help function
show_help() {
    cat << EOF
Zapin Backup System

USAGE:
    $0 [OPTIONS] COMMAND

COMMANDS:
    full            Create full system backup (database + files + config)
    database        Backup database only
    files           Backup application files only
    config          Backup configuration files only
    logs            Backup log files only
    redis           Backup Redis data
    list            List available backups
    cleanup         Clean up old backups
    verify          Verify backup integrity
    restore         Restore from backup (interactive)
    schedule        Set up automated backup schedule

OPTIONS:
    -h, --help              Show this help message
    -v, --verbose           Enable verbose output
    -c, --compress LEVEL    Compression level (1-9, default: 6)
    -e, --encrypt           Enable encryption
    -s, --s3                Upload to S3 after backup
    -r, --retention DAYS    Retention period in days (default: 30)
    -t, --type TYPE         Backup type (full, incremental, differential)
    -n, --name NAME         Custom backup name
    --no-compression        Disable compression
    --exclude PATTERN       Exclude files matching pattern

EXAMPLES:
    $0 full --encrypt --s3
    $0 database --compress 9
    $0 files --exclude "*.log"
    $0 restore --name backup_20231201_120000
    $0 cleanup --retention 7

EOF
}

# Initialize backup directories
init_backup_dirs() {
    local dirs=(
        "$DB_BACKUP_DIR"
        "$FILES_BACKUP_DIR"
        "$CONFIG_BACKUP_DIR"
        "$LOGS_BACKUP_DIR"
        "$FULL_BACKUP_DIR"
    )
    
    for dir in "${dirs[@]}"; do
        mkdir -p "$dir"
    done
    
    log_info "Backup directories initialized"
}

# Check dependencies
check_dependencies() {
    local missing_tools=()
    
    # Required tools
    local required_tools=(
        "pg_dump"
        "tar"
        "gzip"
    )
    
    # Optional tools
    local optional_tools=(
        "redis-cli"
        "aws"
        "gpg"
        "rsync"
    )
    
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            missing_tools+=("$tool")
        fi
    done
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi
    
    # Check optional tools
    for tool in "${optional_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_warning "Optional tool not found: $tool (some features may be disabled)"
        fi
    done
}

# Database backup
backup_database() {
    local backup_name="${1:-db_backup_$TIMESTAMP}"
    local backup_file="$DB_BACKUP_DIR/${backup_name}.sql"
    
    log_info "Starting database backup: $backup_name"
    
    # Set password for pg_dump
    export PGPASSWORD="$DB_PASSWORD"
    
    # Create database backup
    if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --verbose --no-password --format=custom --compress="$COMPRESSION_LEVEL" \
        --file="$backup_file" 2>/dev/null; then
        
        log_success "Database backup completed: $backup_file"
        
        # Get backup size
        local size=$(du -h "$backup_file" | cut -f1)
        log_info "Backup size: $size"
        
        # Verify backup
        if verify_database_backup "$backup_file"; then
            log_success "Database backup verification passed"
        else
            log_error "Database backup verification failed"
            return 1
        fi
        
        # Encrypt if requested
        if [[ "$ENCRYPTION_ENABLED" == "true" ]]; then
            encrypt_file "$backup_file"
        fi
        
        # Upload to S3 if requested
        if [[ "$S3_ENABLED" == "true" ]]; then
            upload_to_s3 "$backup_file" "database/"
        fi
        
        return 0
    else
        log_error "Database backup failed"
        return 1
    fi
}

# Redis backup
backup_redis() {
    local backup_name="${1:-redis_backup_$TIMESTAMP}"
    local backup_file="$DB_BACKUP_DIR/${backup_name}.rdb"
    
    log_info "Starting Redis backup: $backup_name"
    
    # Create Redis backup using BGSAVE
    if [[ -n "$REDIS_PASSWORD" ]]; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" BGSAVE
    else
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BGSAVE
    fi
    
    # Wait for backup to complete
    local status="OK"
    while [[ "$status" == "OK" ]]; do
        sleep 1
        if [[ -n "$REDIS_PASSWORD" ]]; then
            status=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" LASTSAVE)
        else
            status=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LASTSAVE)
        fi
    done
    
    # Copy RDB file
    local redis_data_dir="/var/lib/redis"
    if [[ -f "$redis_data_dir/dump.rdb" ]]; then
        cp "$redis_data_dir/dump.rdb" "$backup_file"
        
        # Compress
        gzip "$backup_file"
        backup_file="${backup_file}.gz"
        
        log_success "Redis backup completed: $backup_file"
        
        # Upload to S3 if requested
        if [[ "$S3_ENABLED" == "true" ]]; then
            upload_to_s3 "$backup_file" "redis/"
        fi
        
        return 0
    else
        log_error "Redis backup failed - dump.rdb not found"
        return 1
    fi
}

# Files backup
backup_files() {
    local backup_name="${1:-files_backup_$TIMESTAMP}"
    local backup_file="$FILES_BACKUP_DIR/${backup_name}.tar.gz"
    local exclude_patterns="${EXCLUDE_PATTERNS:-}"
    
    log_info "Starting files backup: $backup_name"
    
    # Directories to backup
    local backup_dirs=(
        "$PROJECT_ROOT/uploads"
        "$PROJECT_ROOT/storage"
        "$PROJECT_ROOT/public"
        "/var/www/zapin/uploads"
        "/opt/zapin/storage"
    )
    
    # Build exclude options
    local exclude_opts=()
    if [[ -n "$exclude_patterns" ]]; then
        IFS=',' read -ra patterns <<< "$exclude_patterns"
        for pattern in "${patterns[@]}"; do
            exclude_opts+=("--exclude=$pattern")
        done
    fi
    
    # Default excludes
    exclude_opts+=(
        "--exclude=*.log"
        "--exclude=*.tmp"
        "--exclude=node_modules"
        "--exclude=.git"
        "--exclude=.cache"
    )
    
    # Create files backup
    local existing_dirs=()
    for dir in "${backup_dirs[@]}"; do
        if [[ -d "$dir" ]]; then
            existing_dirs+=("$dir")
        fi
    done
    
    if [[ ${#existing_dirs[@]} -gt 0 ]]; then
        if tar -czf "$backup_file" "${exclude_opts[@]}" "${existing_dirs[@]}" 2>/dev/null; then
            log_success "Files backup completed: $backup_file"
            
            # Get backup size
            local size=$(du -h "$backup_file" | cut -f1)
            log_info "Backup size: $size"
            
            # Encrypt if requested
            if [[ "$ENCRYPTION_ENABLED" == "true" ]]; then
                encrypt_file "$backup_file"
            fi
            
            # Upload to S3 if requested
            if [[ "$S3_ENABLED" == "true" ]]; then
                upload_to_s3 "$backup_file" "files/"
            fi
            
            return 0
        else
            log_error "Files backup failed"
            return 1
        fi
    else
        log_warning "No directories found to backup"
        return 0
    fi
}

# Configuration backup
backup_config() {
    local backup_name="${1:-config_backup_$TIMESTAMP}"
    local backup_file="$CONFIG_BACKUP_DIR/${backup_name}.tar.gz"
    
    log_info "Starting configuration backup: $backup_name"
    
    # Configuration files and directories to backup
    local config_items=(
        "$PROJECT_ROOT/.env"
        "$PROJECT_ROOT/config"
        "$PROJECT_ROOT/docker-compose*.yml"
        "$PROJECT_ROOT/Dockerfile*"
        "$PROJECT_ROOT/nginx.conf"
        "/etc/nginx/sites-available/zapin*"
        "/etc/nginx/nginx.conf"
        "/etc/systemd/system/zapin*"
        "/etc/ssl/certs/zapin*"
        "/etc/crontab"
    )
    
    # Create temporary directory for config files
    local temp_dir=$(mktemp -d)
    local config_staging="$temp_dir/config"
    mkdir -p "$config_staging"
    
    # Copy existing config files
    for item in "${config_items[@]}"; do
        if [[ -e "$item" ]]; then
            # Preserve directory structure
            local dest_dir="$config_staging$(dirname "$item")"
            mkdir -p "$dest_dir"
            cp -r "$item" "$dest_dir/"
        fi
    done
    
    # Create configuration backup
    if tar -czf "$backup_file" -C "$temp_dir" config 2>/dev/null; then
        log_success "Configuration backup completed: $backup_file"
        
        # Cleanup
        rm -rf "$temp_dir"
        
        # Get backup size
        local size=$(du -h "$backup_file" | cut -f1)
        log_info "Backup size: $size"
        
        # Encrypt if requested
        if [[ "$ENCRYPTION_ENABLED" == "true" ]]; then
            encrypt_file "$backup_file"
        fi
        
        # Upload to S3 if requested
        if [[ "$S3_ENABLED" == "true" ]]; then
            upload_to_s3 "$backup_file" "config/"
        fi
        
        return 0
    else
        log_error "Configuration backup failed"
        rm -rf "$temp_dir"
        return 1
    fi
}

# Logs backup
backup_logs() {
    local backup_name="${1:-logs_backup_$TIMESTAMP}"
    local backup_file="$LOGS_BACKUP_DIR/${backup_name}.tar.gz"
    
    log_info "Starting logs backup: $backup_name"
    
    # Log directories to backup
    local log_dirs=(
        "$PROJECT_ROOT/logs"
        "/var/log/nginx"
        "/var/log/postgresql"
        "/var/log/redis"
        "/var/log/zapin"
    )
    
    # Create logs backup
    local existing_dirs=()
    for dir in "${log_dirs[@]}"; do
        if [[ -d "$dir" ]]; then
            existing_dirs+=("$dir")
        fi
    done
    
    if [[ ${#existing_dirs[@]} -gt 0 ]]; then
        if tar -czf "$backup_file" "${existing_dirs[@]}" 2>/dev/null; then
            log_success "Logs backup completed: $backup_file"
            
            # Get backup size
            local size=$(du -h "$backup_file" | cut -f1)
            log_info "Backup size: $size"
            
            # Upload to S3 if requested
            if [[ "$S3_ENABLED" == "true" ]]; then
                upload_to_s3 "$backup_file" "logs/"
            fi
            
            return 0
        else
            log_error "Logs backup failed"
            return 1
        fi
    else
        log_warning "No log directories found to backup"
        return 0
    fi
}

# Full system backup
backup_full() {
    local backup_name="${1:-full_backup_$TIMESTAMP}"
    
    log_info "Starting full system backup: $backup_name"
    
    local success=true
    
    # Database backup
    if ! backup_database "db_${backup_name}"; then
        success=false
    fi
    
    # Redis backup
    if ! backup_redis "redis_${backup_name}"; then
        success=false
    fi
    
    # Files backup
    if ! backup_files "files_${backup_name}"; then
        success=false
    fi
    
    # Configuration backup
    if ! backup_config "config_${backup_name}"; then
        success=false
    fi
    
    # Logs backup
    if ! backup_logs "logs_${backup_name}"; then
        success=false
    fi
    
    if [[ "$success" == "true" ]]; then
        log_success "Full system backup completed successfully"
        
        # Create backup manifest
        create_backup_manifest "$backup_name"
        
        return 0
    else
        log_error "Full system backup completed with errors"
        return 1
    fi
}

# Create backup manifest
create_backup_manifest() {
    local backup_name="$1"
    local manifest_file="$FULL_BACKUP_DIR/${backup_name}_manifest.json"
    
    cat > "$manifest_file" << EOF
{
    "backup_name": "$backup_name",
    "timestamp": "$TIMESTAMP",
    "date": "$BACKUP_DATE",
    "type": "full",
    "components": {
        "database": "db_${backup_name}.sql",
        "redis": "redis_${backup_name}.rdb.gz",
        "files": "files_${backup_name}.tar.gz",
        "config": "config_${backup_name}.tar.gz",
        "logs": "logs_${backup_name}.tar.gz"
    },
    "encryption_enabled": $ENCRYPTION_ENABLED,
    "s3_enabled": $S3_ENABLED,
    "retention_days": $RETENTION_DAYS,
    "created_by": "$(whoami)",
    "hostname": "$(hostname)",
    "version": "1.0.0"
}
EOF
    
    log_info "Backup manifest created: $manifest_file"
}

# Verify database backup
verify_database_backup() {
    local backup_file="$1"
    
    log_info "Verifying database backup: $backup_file"
    
    # Use pg_restore to verify the backup
    if pg_restore --list "$backup_file" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Encrypt file
encrypt_file() {
    local file="$1"
    local encrypted_file="${file}.gpg"
    local key_file="${BACKUP_ENCRYPTION_KEY:-$PROJECT_ROOT/config/backup.key}"
    
    if [[ ! -f "$key_file" ]]; then
        log_error "Encryption key not found: $key_file"
        return 1
    fi
    
    log_info "Encrypting file: $file"
    
    if gpg --cipher-algo AES256 --compress-algo 1 --symmetric --passphrase-file "$key_file" --output "$encrypted_file" "$file"; then
        # Remove original file
        rm "$file"
        log_success "File encrypted: $encrypted_file"
        return 0
    else
        log_error "File encryption failed"
        return 1
    fi
}

# Upload to S3
upload_to_s3() {
    local file="$1"
    local s3_prefix="$2"
    local s3_key="${s3_prefix}$(basename "$file")"
    
    if [[ -z "$S3_BUCKET" ]]; then
        log_error "S3 bucket not configured"
        return 1
    fi
    
    log_info "Uploading to S3: s3://$S3_BUCKET/$s3_key"
    
    if aws s3 cp "$file" "s3://$S3_BUCKET/$s3_key" --region "$S3_REGION"; then
        log_success "File uploaded to S3: s3://$S3_BUCKET/$s3_key"
        return 0
    else
        log_error "S3 upload failed"
        return 1
    fi
}

# List backups
list_backups() {
    log_info "Available backups:"
    
    echo "Database backups:"
    ls -lh "$DB_BACKUP_DIR"/*.sql* 2>/dev/null || echo "  No database backups found"
    
    echo "Files backups:"
    ls -lh "$FILES_BACKUP_DIR"/*.tar.gz* 2>/dev/null || echo "  No files backups found"
    
    echo "Configuration backups:"
    ls -lh "$CONFIG_BACKUP_DIR"/*.tar.gz* 2>/dev/null || echo "  No configuration backups found"
    
    echo "Full backup manifests:"
    ls -lh "$FULL_BACKUP_DIR"/*_manifest.json 2>/dev/null || echo "  No full backup manifests found"
}

# Cleanup old backups
cleanup_backups() {
    local retention_days="${1:-$RETENTION_DAYS}"
    
    log_info "Cleaning up backups older than $retention_days days"
    
    local dirs=(
        "$DB_BACKUP_DIR"
        "$FILES_BACKUP_DIR"
        "$CONFIG_BACKUP_DIR"
        "$LOGS_BACKUP_DIR"
        "$FULL_BACKUP_DIR"
    )
    
    local total_removed=0
    
    for dir in "${dirs[@]}"; do
        if [[ -d "$dir" ]]; then
            local removed=$(find "$dir" -type f -mtime +$retention_days -delete -print | wc -l)
            total_removed=$((total_removed + removed))
            
            if [[ $removed -gt 0 ]]; then
                log_info "Removed $removed old backup files from $dir"
            fi
        fi
    done
    
    log_success "Cleanup completed. Removed $total_removed files total"
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -c|--compress)
                COMPRESSION_LEVEL="$2"
                shift 2
                ;;
            -e|--encrypt)
                ENCRYPTION_ENABLED=true
                shift
                ;;
            -s|--s3)
                S3_ENABLED=true
                shift
                ;;
            -r|--retention)
                RETENTION_DAYS="$2"
                shift 2
                ;;
            -n|--name)
                BACKUP_NAME="$2"
                shift 2
                ;;
            --exclude)
                EXCLUDE_PATTERNS="$2"
                shift 2
                ;;
            --no-compression)
                COMPRESSION_LEVEL=0
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                exit 1
                ;;
            *)
                if [[ -z "${COMMAND:-}" ]]; then
                    COMMAND="$1"
                else
                    log_error "Too many arguments"
                    exit 1
                fi
                shift
                ;;
        esac
    done
}

# Main function
main() {
    # Parse arguments
    parse_args "$@"
    
    # Check if command is provided
    if [[ -z "${COMMAND:-}" ]]; then
        log_error "No command specified"
        show_help
        exit 1
    fi
    
    # Initialize
    init_backup_dirs
    check_dependencies
    
    # Execute command
    case "$COMMAND" in
        full)
            backup_full "${BACKUP_NAME:-}"
            ;;
        database)
            backup_database "${BACKUP_NAME:-}"
            ;;
        files)
            backup_files "${BACKUP_NAME:-}"
            ;;
        config)
            backup_config "${BACKUP_NAME:-}"
            ;;
        logs)
            backup_logs "${BACKUP_NAME:-}"
            ;;
        redis)
            backup_redis "${BACKUP_NAME:-}"
            ;;
        list)
            list_backups
            ;;
        cleanup)
            cleanup_backups
            ;;
        *)
            log_error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"