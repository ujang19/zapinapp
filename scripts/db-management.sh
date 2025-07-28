#!/bin/bash

# Zapin WhatsApp SaaS Platform - Database Management Script
# This script handles database operations, backups, migrations, and maintenance

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_COMPOSE_FILE="docker-compose.yml"
BACKUP_DIR="/opt/zapin-backups/database"
CONTAINER_NAME="zapin-postgres"
DB_NAME="zapin_db"
DB_USER="zapin"

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

check_docker_running() {
    if ! docker ps | grep -q "$CONTAINER_NAME"; then
        log_error "PostgreSQL container is not running. Please start the application first."
        exit 1
    fi
}

create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        log_info "Created backup directory: $BACKUP_DIR"
    fi
}

backup_database() {
    log_info "Starting database backup..."
    
    check_docker_running
    create_backup_dir
    
    # Generate backup filename with timestamp
    BACKUP_FILE="$BACKUP_DIR/zapin_db_backup_$(date +%Y%m%d_%H%M%S).sql"
    
    # Create database backup
    docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_FILE"
    
    # Compress backup
    gzip "$BACKUP_FILE"
    BACKUP_FILE="${BACKUP_FILE}.gz"
    
    # Verify backup
    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        log_success "Database backup created: $BACKUP_FILE"
        
        # Display backup size
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log_info "Backup size: $BACKUP_SIZE"
        
        return 0
    else
        log_error "Backup failed or file is empty"
        return 1
    fi
}

restore_database() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        log_error "Please specify a backup file to restore from"
        echo "Usage: $0 restore <backup_file>"
        echo "Available backups:"
        ls -la "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No backups found"
        exit 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi
    
    log_warning "This will REPLACE the current database with the backup!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restore cancelled."
        exit 0
    fi
    
    log_info "Starting database restore from: $backup_file"
    
    check_docker_running
    
    # Create a backup of current database before restore
    log_info "Creating safety backup of current database..."
    SAFETY_BACKUP="$BACKUP_DIR/safety_backup_$(date +%Y%m%d_%H%M%S).sql"
    docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$SAFETY_BACKUP"
    gzip "$SAFETY_BACKUP"
    log_info "Safety backup created: ${SAFETY_BACKUP}.gz"
    
    # Drop existing connections
    log_info "Terminating existing database connections..."
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();"
    
    # Drop and recreate database
    log_info "Recreating database..."
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"
    
    # Restore from backup
    log_info "Restoring database from backup..."
    if [[ "$backup_file" == *.gz ]]; then
        gunzip -c "$backup_file" | docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME"
    else
        docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" < "$backup_file"
    fi
    
    log_success "Database restored successfully from: $backup_file"
}

migrate_database() {
    log_info "Running database migrations..."
    
    check_docker_running
    
    # Run Prisma migrations
    docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T zapin-app npm run db:migrate:deploy
    
    log_success "Database migrations completed successfully."
}

seed_database() {
    log_info "Seeding database with initial data..."
    
    check_docker_running
    
    # Run database seeding
    docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T zapin-app npm run db:seed
    
    log_success "Database seeded successfully."
}

reset_database() {
    log_warning "This will COMPLETELY RESET the database and all data will be lost!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Database reset cancelled."
        exit 0
    fi
    
    log_info "Resetting database..."
    
    check_docker_running
    
    # Create backup before reset
    log_info "Creating backup before reset..."
    backup_database
    
    # Reset database
    log_info "Dropping and recreating database..."
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"
    
    # Run migrations
    migrate_database
    
    # Seed database
    read -p "Do you want to seed the database with initial data? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        seed_database
    fi
    
    log_success "Database reset completed successfully."
}

check_database_health() {
    log_info "Checking database health..."
    
    if ! docker ps | grep -q "$CONTAINER_NAME"; then
        log_error "PostgreSQL container is not running"
        return 1
    fi
    
    # Check if database is accepting connections
    if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; then
        log_success "Database is healthy and accepting connections"
    else
        log_error "Database is not accepting connections"
        return 1
    fi
    
    # Check database size
    DB_SIZE=$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));" | xargs)
    log_info "Database size: $DB_SIZE"
    
    # Check number of connections
    CONNECTIONS=$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname = '$DB_NAME';" | xargs)
    log_info "Active connections: $CONNECTIONS"
    
    # Check for long-running queries
    LONG_QUERIES=$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '5 minutes';" | xargs)
    if [ "$LONG_QUERIES" -gt 0 ]; then
        log_warning "Found $LONG_QUERIES long-running queries (>5 minutes)"
    fi
    
    return 0
}

optimize_database() {
    log_info "Optimizing database performance..."
    
    check_docker_running
    
    # Analyze tables
    log_info "Analyzing database tables..."
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "ANALYZE;"
    
    # Vacuum database
    log_info "Vacuuming database..."
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "VACUUM;"
    
    # Reindex database
    log_info "Reindexing database..."
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "REINDEX DATABASE $DB_NAME;"
    
    log_success "Database optimization completed."
}

cleanup_old_backups() {
    local days="${1:-30}"
    
    log_info "Cleaning up backups older than $days days..."
    
    if [ -d "$BACKUP_DIR" ]; then
        # Find and delete old backups
        DELETED_COUNT=$(find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime +$days -delete -print | wc -l)
        log_success "Deleted $DELETED_COUNT old backup files"
    else
        log_info "No backup directory found"
    fi
}

show_database_stats() {
    log_info "Database Statistics:"
    echo "===================="
    
    check_docker_running
    
    # Database size
    echo "Database Size:"
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME')) as size;"
    echo
    
    # Table sizes
    echo "Top 10 Largest Tables:"
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT 
            schemaname,
            tablename,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
            pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC 
        LIMIT 10;
    "
    echo
    
    # Connection stats
    echo "Connection Statistics:"
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT 
            state,
            count(*) as connections
        FROM pg_stat_activity 
        WHERE datname = '$DB_NAME'
        GROUP BY state;
    "
    echo
    
    # Recent activity
    echo "Recent Activity (last 24 hours):"
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT 
            schemaname,
            tablename,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes
        FROM pg_stat_user_tables 
        WHERE n_tup_ins + n_tup_upd + n_tup_del > 0
        ORDER BY (n_tup_ins + n_tup_upd + n_tup_del) DESC;
    "
}

list_backups() {
    log_info "Available database backups:"
    echo "============================"
    
    if [ -d "$BACKUP_DIR" ] && [ "$(ls -A $BACKUP_DIR)" ]; then
        ls -lah "$BACKUP_DIR"/*.sql.gz 2>/dev/null | while read -r line; do
            echo "$line"
        done
    else
        echo "No backups found in $BACKUP_DIR"
    fi
}

show_help() {
    echo "Zapin Database Management Script"
    echo "==============================="
    echo
    echo "Usage: $0 <command> [options]"
    echo
    echo "Commands:"
    echo "  backup                    Create a database backup"
    echo "  restore <backup_file>     Restore database from backup"
    echo "  migrate                   Run database migrations"
    echo "  seed                      Seed database with initial data"
    echo "  reset                     Reset database (WARNING: destroys all data)"
    echo "  health                    Check database health"
    echo "  optimize                  Optimize database performance"
    echo "  cleanup [days]            Clean up old backups (default: 30 days)"
    echo "  stats                     Show database statistics"
    echo "  list                      List available backups"
    echo "  help                      Show this help message"
    echo
    echo "Examples:"
    echo "  $0 backup"
    echo "  $0 restore /opt/zapin-backups/database/zapin_db_backup_20240128_120000.sql.gz"
    echo "  $0 cleanup 7"
    echo
}

# Main script logic
case "${1:-}" in
    "backup")
        backup_database
        ;;
    "restore")
        restore_database "$2"
        ;;
    "migrate")
        migrate_database
        ;;
    "seed")
        seed_database
        ;;
    "reset")
        reset_database
        ;;
    "health")
        check_database_health
        ;;
    "optimize")
        optimize_database
        ;;
    "cleanup")
        cleanup_old_backups "$2"
        ;;
    "stats")
        show_database_stats
        ;;
    "list")
        list_backups
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    *)
        log_error "Unknown command: ${1:-}"
        echo
        show_help
        exit 1
        ;;
esac