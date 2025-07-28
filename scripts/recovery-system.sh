#!/bin/bash

# Comprehensive Recovery System for Zapin WhatsApp SaaS
# This script handles restoration from backups with various recovery scenarios

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
RECOVERY_LOG_DIR="/var/log/zapin/recovery"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

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

# Recovery options
FORCE_RECOVERY=false
DRY_RUN=false
VERIFY_BEFORE_RESTORE=true
CREATE_BACKUP_BEFORE_RESTORE=true
STOP_SERVICES=true

# Help function
show_help() {
    cat << EOF
Zapin Recovery System

USAGE:
    $0 [OPTIONS] COMMAND

COMMANDS:
    interactive         Interactive recovery wizard
    full                Restore full system from backup
    database            Restore database only
    files               Restore files only
    config              Restore configuration only
    redis               Restore Redis data
    point-in-time       Point-in-time recovery (if available)
    list                List available backups
    download            Download backup from S3
    verify              Verify backup integrity
    test-restore        Test restore without applying changes

OPTIONS:
    -h, --help              Show this help message
    -v, --verbose           Enable verbose output
    -f, --force             Force recovery without confirmation
    -d, --dry-run           Show what would be restored without making changes
    -b, --backup NAME       Specific backup to restore
    -t, --target-time TIME  Target time for point-in-time recovery
    -s, --from-s3           Download backup from S3 before restore
    --no-verify             Skip backup verification
    --no-backup             Skip creating backup before restore
    --no-stop-services      Don't stop services during restore
    --recovery-mode MODE    Recovery mode (full, partial, emergency)

EXAMPLES:
    $0 interactive
    $0 full --backup full_backup_20231201_120000
    $0 database --from-s3 --backup db_backup_20231201_120000
    $0 point-in-time --target-time "2023-12-01 12:00:00"
    $0 test-restore --backup full_backup_20231201_120000

EOF
}

# Initialize recovery environment
init_recovery() {
    # Create recovery log directory
    mkdir -p "$RECOVERY_LOG_DIR"
    
    # Set up recovery log
    RECOVERY_LOG="$RECOVERY_LOG_DIR/recovery_${TIMESTAMP}.log"
    exec 1> >(tee -a "$RECOVERY_LOG")
    exec 2> >(tee -a "$RECOVERY_LOG" >&2)
    
    log_info "Recovery session started - Log: $RECOVERY_LOG"
    log_info "Recovery initiated by: $(whoami) on $(hostname)"
}

# Check dependencies
check_dependencies() {
    local missing_tools=()
    
    # Required tools
    local required_tools=(
        "pg_restore"
        "psql"
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
    
    log_info "All required dependencies are available"
}

# List available backups
list_backups() {
    log_info "Scanning for available backups..."
    
    echo "=== LOCAL BACKUPS ==="
    
    echo "Full backup manifests:"
    if ls "$BACKUP_BASE_DIR/full"/*_manifest.json 2>/dev/null; then
        for manifest in "$BACKUP_BASE_DIR/full"/*_manifest.json; do
            local backup_name=$(basename "$manifest" _manifest.json)
            local backup_date=$(jq -r '.date' "$manifest" 2>/dev/null || echo "Unknown")
            local backup_type=$(jq -r '.type' "$manifest" 2>/dev/null || echo "Unknown")
            echo "  $backup_name ($backup_date) - Type: $backup_type"
        done
    else
        echo "  No full backup manifests found"
    fi
    
    echo "Database backups:"
    ls -lh "$BACKUP_BASE_DIR/database"/*.sql* 2>/dev/null || echo "  No database backups found"
    
    echo "Files backups:"
    ls -lh "$BACKUP_BASE_DIR/files"/*.tar.gz* 2>/dev/null || echo "  No files backups found"
    
    echo "Configuration backups:"
    ls -lh "$BACKUP_BASE_DIR/config"/*.tar.gz* 2>/dev/null || echo "  No configuration backups found"
    
    if [[ -n "$S3_BUCKET" ]] && command -v aws &> /dev/null; then
        echo "=== S3 BACKUPS ==="
        aws s3 ls "s3://$S3_BUCKET/" --recursive --human-readable --summarize
    fi
}

# Download backup from S3
download_from_s3() {
    local backup_name="$1"
    local backup_type="${2:-full}"
    
    if [[ -z "$S3_BUCKET" ]]; then
        log_error "S3 bucket not configured"
        return 1
    fi
    
    log_info "Downloading backup from S3: $backup_name"
    
    case "$backup_type" in
        full)
            # Download all components of a full backup
            local components=("database" "files" "config" "logs" "redis")
            for component in "${components[@]}"; do
                local s3_key="${component}/${component}_${backup_name}"
                local local_file="$BACKUP_BASE_DIR/${component}/${component}_${backup_name}"
                
                if aws s3 cp "s3://$S3_BUCKET/$s3_key" "$local_file" --region "$S3_REGION"; then
                    log_success "Downloaded: $s3_key"
                else
                    log_warning "Failed to download: $s3_key (may not exist)"
                fi
            done
            ;;
        database)
            local s3_key="database/db_${backup_name}.sql"
            local local_file="$BACKUP_BASE_DIR/database/db_${backup_name}.sql"
            aws s3 cp "s3://$S3_BUCKET/$s3_key" "$local_file" --region "$S3_REGION"
            ;;
        files)
            local s3_key="files/files_${backup_name}.tar.gz"
            local local_file="$BACKUP_BASE_DIR/files/files_${backup_name}.tar.gz"
            aws s3 cp "s3://$S3_BUCKET/$s3_key" "$local_file" --region "$S3_REGION"
            ;;
        config)
            local s3_key="config/config_${backup_name}.tar.gz"
            local local_file="$BACKUP_BASE_DIR/config/config_${backup_name}.tar.gz"
            aws s3 cp "s3://$S3_BUCKET/$s3_key" "$local_file" --region "$S3_REGION"
            ;;
    esac
    
    log_success "Backup download completed"
}

# Verify backup integrity
verify_backup() {
    local backup_name="$1"
    local backup_type="${2:-full}"
    
    log_info "Verifying backup integrity: $backup_name"
    
    local verification_passed=true
    
    case "$backup_type" in
        full)
            # Verify manifest exists
            local manifest_file="$BACKUP_BASE_DIR/full/${backup_name}_manifest.json"
            if [[ ! -f "$manifest_file" ]]; then
                log_error "Backup manifest not found: $manifest_file"
                return 1
            fi
            
            # Verify each component
            local components=$(jq -r '.components | keys[]' "$manifest_file")
            for component in $components; do
                local component_file=$(jq -r ".components.$component" "$manifest_file")
                local full_path="$BACKUP_BASE_DIR/$component/$component_file"
                
                if [[ -f "$full_path" ]]; then
                    case "$component" in
                        database)
                            if ! verify_database_backup "$full_path"; then
                                verification_passed=false
                            fi
                            ;;
                        *)
                            # For other components, just check if file exists and is readable
                            if [[ ! -r "$full_path" ]]; then
                                log_error "Cannot read backup file: $full_path"
                                verification_passed=false
                            fi
                            ;;
                    esac
                else
                    log_error "Backup component not found: $full_path"
                    verification_passed=false
                fi
            done
            ;;
        database)
            local db_backup="$BACKUP_BASE_DIR/database/db_${backup_name}.sql"
            if ! verify_database_backup "$db_backup"; then
                verification_passed=false
            fi
            ;;
    esac
    
    if [[ "$verification_passed" == "true" ]]; then
        log_success "Backup verification passed"
        return 0
    else
        log_error "Backup verification failed"
        return 1
    fi
}

# Verify database backup
verify_database_backup() {
    local backup_file="$1"
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Database backup file not found: $backup_file"
        return 1
    fi
    
    log_info "Verifying database backup: $backup_file"
    
    # Check if it's a valid PostgreSQL backup
    if pg_restore --list "$backup_file" >/dev/null 2>&1; then
        log_success "Database backup verification passed"
        return 0
    else
        log_error "Database backup verification failed"
        return 1
    fi
}

# Stop services
stop_services() {
    if [[ "$STOP_SERVICES" != "true" ]]; then
        return 0
    fi
    
    log_info "Stopping services for recovery..."
    
    local services=(
        "zapin-api"
        "zapin-app"
        "nginx"
    )
    
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service"; then
            log_info "Stopping service: $service"
            systemctl stop "$service"
        fi
    done
    
    log_success "Services stopped"
}

# Start services
start_services() {
    if [[ "$STOP_SERVICES" != "true" ]]; then
        return 0
    fi
    
    log_info "Starting services after recovery..."
    
    local services=(
        "postgresql"
        "redis"
        "nginx"
        "zapin-api"
        "zapin-app"
    )
    
    for service in "${services[@]}"; do
        if systemctl is-enabled --quiet "$service" 2>/dev/null; then
            log_info "Starting service: $service"
            systemctl start "$service"
            
            # Wait for service to be ready
            sleep 2
            
            if systemctl is-active --quiet "$service"; then
                log_success "Service started: $service"
            else
                log_error "Failed to start service: $service"
            fi
        fi
    done
}

# Create pre-recovery backup
create_pre_recovery_backup() {
    if [[ "$CREATE_BACKUP_BEFORE_RESTORE" != "true" ]]; then
        return 0
    fi
    
    log_info "Creating pre-recovery backup..."
    
    local pre_recovery_name="pre_recovery_${TIMESTAMP}"
    
    if "$SCRIPT_DIR/backup-system.sh" full --name "$pre_recovery_name"; then
        log_success "Pre-recovery backup created: $pre_recovery_name"
        echo "$pre_recovery_name" > "$RECOVERY_LOG_DIR/pre_recovery_backup.txt"
    else
        log_error "Failed to create pre-recovery backup"
        if [[ "$FORCE_RECOVERY" != "true" ]]; then
            log_error "Aborting recovery. Use --force to continue without pre-recovery backup."
            exit 1
        fi
    fi
}

# Restore database
restore_database() {
    local backup_name="$1"
    local db_backup="$BACKUP_BASE_DIR/database/db_${backup_name}.sql"
    
    if [[ ! -f "$db_backup" ]]; then
        log_error "Database backup not found: $db_backup"
        return 1
    fi
    
    log_info "Restoring database from: $db_backup"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN - Would restore database from: $db_backup"
        return 0
    fi
    
    # Set password for PostgreSQL commands
    export PGPASSWORD="$DB_PASSWORD"
    
    # Drop existing database (with confirmation)
    if [[ "$FORCE_RECOVERY" != "true" ]]; then
        echo -n "This will DROP the existing database '$DB_NAME'. Continue? (y/N): "
        read -r confirmation
        if [[ "$confirmation" != "y" ]] && [[ "$confirmation" != "Y" ]]; then
            log_info "Database restore cancelled"
            return 1
        fi
    fi
    
    # Terminate active connections
    log_info "Terminating active database connections..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();"
    
    # Drop and recreate database
    log_info "Dropping and recreating database..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"
    
    # Restore database
    log_info "Restoring database data..."
    if pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --verbose --clean --no-owner --no-privileges "$db_backup"; then
        
        log_success "Database restore completed"
        
        # Run post-restore checks
        log_info "Running post-restore database checks..."
        local table_count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
            SELECT COUNT(*) FROM information_schema.tables 
            WHERE table_schema = 'public';" | tr -d ' ')
        
        log_info "Restored $table_count tables"
        
        return 0
    else
        log_error "Database restore failed"
        return 1
    fi
}

# Restore Redis
restore_redis() {
    local backup_name="$1"
    local redis_backup="$BACKUP_BASE_DIR/database/redis_${backup_name}.rdb.gz"
    
    if [[ ! -f "$redis_backup" ]]; then
        log_error "Redis backup not found: $redis_backup"
        return 1
    fi
    
    log_info "Restoring Redis from: $redis_backup"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN - Would restore Redis from: $redis_backup"
        return 0
    fi
    
    # Stop Redis service
    log_info "Stopping Redis service..."
    systemctl stop redis
    
    # Backup current Redis data
    local redis_data_dir="/var/lib/redis"
    if [[ -f "$redis_data_dir/dump.rdb" ]]; then
        mv "$redis_data_dir/dump.rdb" "$redis_data_dir/dump.rdb.backup.$(date +%s)"
    fi
    
    # Restore Redis data
    log_info "Restoring Redis data file..."
    gunzip -c "$redis_backup" > "$redis_data_dir/dump.rdb"
    chown redis:redis "$redis_data_dir/dump.rdb"
    chmod 660 "$redis_data_dir/dump.rdb"
    
    # Start Redis service
    log_info "Starting Redis service..."
    systemctl start redis
    
    # Verify Redis is working
    sleep 2
    if redis-cli ping | grep -q PONG; then
        log_success "Redis restore completed and service is running"
        return 0
    else
        log_error "Redis restore failed - service not responding"
        return 1
    fi
}

# Restore files
restore_files() {
    local backup_name="$1"
    local files_backup="$BACKUP_BASE_DIR/files/files_${backup_name}.tar.gz"
    
    if [[ ! -f "$files_backup" ]]; then
        log_error "Files backup not found: $files_backup"
        return 1
    fi
    
    log_info "Restoring files from: $files_backup"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN - Would restore files from: $files_backup"
        tar -tzf "$files_backup" | head -20
        return 0
    fi
    
    # Extract files
    log_info "Extracting files..."
    if tar -xzf "$files_backup" -C /; then
        log_success "Files restore completed"
        
        # Fix permissions
        log_info "Fixing file permissions..."
        chown -R www-data:www-data /var/www/zapin/uploads 2>/dev/null || true
        chown -R zapin:zapin "$PROJECT_ROOT/uploads" 2>/dev/null || true
        
        return 0
    else
        log_error "Files restore failed"
        return 1
    fi
}

# Restore configuration
restore_config() {
    local backup_name="$1"
    local config_backup="$BACKUP_BASE_DIR/config/config_${backup_name}.tar.gz"
    
    if [[ ! -f "$config_backup" ]]; then
        log_error "Configuration backup not found: $config_backup"
        return 1
    fi
    
    log_info "Restoring configuration from: $config_backup"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN - Would restore configuration from: $config_backup"
        tar -tzf "$config_backup" | head -20
        return 0
    fi
    
    # Extract configuration
    log_info "Extracting configuration files..."
    if tar -xzf "$config_backup" -C /; then
        log_success "Configuration restore completed"
        
        # Reload services that depend on configuration
        log_info "Reloading configuration-dependent services..."
        systemctl reload nginx 2>/dev/null || true
        
        return 0
    else
        log_error "Configuration restore failed"
        return 1
    fi
}

# Full system restore
restore_full() {
    local backup_name="$1"
    
    log_info "Starting full system restore: $backup_name"
    
    # Verify backup exists and is valid
    if [[ "$VERIFY_BEFORE_RESTORE" == "true" ]]; then
        if ! verify_backup "$backup_name" "full"; then
            log_error "Backup verification failed. Aborting restore."
            return 1
        fi
    fi
    
    # Create pre-recovery backup
    create_pre_recovery_backup
    
    # Stop services
    stop_services
    
    local success=true
    
    # Restore components in order
    log_info "Restoring database..."
    if ! restore_database "$backup_name"; then
        success=false
    fi
    
    log_info "Restoring Redis..."
    if ! restore_redis "$backup_name"; then
        success=false
    fi
    
    log_info "Restoring files..."
    if ! restore_files "$backup_name"; then
        success=false
    fi
    
    log_info "Restoring configuration..."
    if ! restore_config "$backup_name"; then
        success=false
    fi
    
    # Start services
    start_services
    
    if [[ "$success" == "true" ]]; then
        log_success "Full system restore completed successfully"
        
        # Run post-restore verification
        log_info "Running post-restore verification..."
        run_post_restore_checks
        
        return 0
    else
        log_error "Full system restore completed with errors"
        return 1
    fi
}

# Run post-restore checks
run_post_restore_checks() {
    log_info "Running post-restore verification checks..."
    
    # Check database connectivity
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        log_success "✓ Database connectivity check passed"
    else
        log_error "✗ Database connectivity check failed"
    fi
    
    # Check Redis connectivity
    if redis-cli ping | grep -q PONG; then
        log_success "✓ Redis connectivity check passed"
    else
        log_error "✗ Redis connectivity check failed"
    fi
    
    # Check web service
    if curl -f http://localhost/health >/dev/null 2>&1; then
        log_success "✓ Web service health check passed"
    else
        log_warning "⚠ Web service health check failed (may need time to start)"
    fi
    
    log_info "Post-restore verification completed"
}

# Interactive recovery wizard
interactive_recovery() {
    log_info "Starting interactive recovery wizard..."
    
    echo "=== Zapin Recovery Wizard ==="
    echo
    
    # List available backups
    echo "Available backups:"
    list_backups
    echo
    
    # Get backup selection
    echo -n "Enter backup name to restore: "
    read -r backup_name
    
    if [[ -z "$backup_name" ]]; then
        log_error "No backup name provided"
        return 1
    fi
    
    # Get recovery type
    echo "Recovery options:"
    echo "1. Full system restore"
    echo "2. Database only"
    echo "3. Files only"
    echo "4. Configuration only"
    echo -n "Select option (1-4): "
    read -r option
    
    # Confirm recovery
    echo
    echo "Recovery Summary:"
    echo "  Backup: $backup_name"
    case "$option" in
        1) echo "  Type: Full system restore" ;;
        2) echo "  Type: Database only" ;;
        3) echo "  Type: Files only" ;;
        4) echo "  Type: Configuration only" ;;
        *) log_error "Invalid option"; return 1 ;;
    esac
    echo
    echo "WARNING: This will overwrite existing data!"
    echo -n "Continue with recovery? (y/N): "
    read -r confirmation
    
    if [[ "$confirmation" != "y" ]] && [[ "$confirmation" != "Y" ]]; then
        log_info "Recovery cancelled"
        return 0
    fi
    
    # Execute recovery
    case "$option" in
        1) restore_full "$backup_name" ;;
        2) restore_database "$backup_name" ;;
        3) restore_files "$backup_name" ;;
        4) restore_config "$backup_name" ;;
    esac
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
            -f|--force)
                FORCE_RECOVERY=true
                shift
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -b|--backup)
                BACKUP_NAME="$2"
                shift 2
                ;;
            -s|--from-s3)
                FROM_S3=true
                shift
                ;;
            --no-verify)
                VERIFY_BEFORE_RESTORE=false
                shift
                ;;
            --no-backup)
                CREATE_BACKUP_BEFORE_RESTORE=false
                shift
                ;;
            --no-stop-services)
                STOP_SERVICES=false
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
    
    # Initialize recovery environment
    init_recovery
    check_dependencies
    
    # Download from S3 if requested
    if [[ "${FROM_S3:-false}" == "true" ]] && [[ -n "${BACKUP_NAME:-}" ]]; then
        download_from_s3 "$BACKUP_NAME"
    fi
    
    # Execute command
    case "$COMMAND" in
        interactive)
            interactive_recovery
            ;;
        full)
            if [[ -z "${BACKUP_NAME:-}" ]]; then
                log_error "Backup name not specified for full restore"
                exit 1
            fi
            restore_full "$BACKUP_NAME"
            ;;
        database)
            if [[ -z "${BACKUP_NAME:-}" ]]; then
                log_error "Backup name not specified for database restore"
                exit 1
            fi
            restore_database "$BACKUP_NAME"
            ;;
        files)
            if [[ -z "${BACKUP_NAME:-}" ]]; then
                log_error "Backup name not specified for files restore"
                exit 1
            fi
            restore_files "$BACKUP_NAME"
            ;;
        config)
            if [[ -z "${BACKUP_NAME:-}" ]]; then
                log_error "Backup name not specified for config restore"
                exit 1
            fi
            restore_config "$BACKUP_NAME"
            ;;
        redis)
            if [[ -z "${BACKUP_NAME:-}" ]]; then
                log_error "Backup name not specified for Redis restore"
                exit 1
            fi
            restore_redis "$BACKUP_NAME"
            ;;
        list)
            list_backups
            ;;
        download)
            if [[ -z "${BACKUP_NAME:-}" ]]; then
                log_error "Backup name not specified for download"
                exit 1
            fi
            download_from_s3 "$BACKUP_NAME"
            ;;
        verify)
            if [[ -z "${BACKUP_NAME:-}" ]]; then
                log_error "Backup name not specified for verification"
                exit 1
            fi
            verify_backup "$BACKUP_NAME"
            ;;
        *)
            log_error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
    
    log_info "Recovery session completed - Log saved to: $RECOVERY_LOG"
}

# Run main function
main "$@"