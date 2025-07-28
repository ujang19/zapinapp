#!/bin/bash

# Backup Scheduler for Zapin WhatsApp SaaS
# This script manages automated backup scheduling and monitoring

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

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
CRON_USER="${BACKUP_CRON_USER:-root}"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-system.sh"
LOG_DIR="/var/log/zapin/backup-scheduler"
LOCK_FILE="/var/run/zapin-backup.lock"

# Default schedules
DEFAULT_FULL_SCHEDULE="0 2 * * 0"      # Weekly on Sunday at 2 AM
DEFAULT_DB_SCHEDULE="0 */6 * * *"      # Every 6 hours
DEFAULT_FILES_SCHEDULE="0 4 * * *"     # Daily at 4 AM
DEFAULT_CONFIG_SCHEDULE="0 3 * * 1"    # Weekly on Monday at 3 AM
DEFAULT_CLEANUP_SCHEDULE="0 5 * * 0"   # Weekly on Sunday at 5 AM

# Help function
show_help() {
    cat << EOF
Zapin Backup Scheduler

USAGE:
    $0 [OPTIONS] COMMAND

COMMANDS:
    install         Install backup schedules
    uninstall       Remove backup schedules
    status          Show current backup schedules
    run             Run scheduled backup (used by cron)
    test            Test backup schedule
    logs            Show backup logs
    monitor         Monitor backup status

OPTIONS:
    -h, --help              Show this help message
    -v, --verbose           Enable verbose output
    -u, --user USER         Cron user (default: root)
    --full-schedule CRON    Full backup schedule (default: weekly)
    --db-schedule CRON      Database backup schedule (default: 6 hourly)
    --files-schedule CRON   Files backup schedule (default: daily)
    --config-schedule CRON  Config backup schedule (default: weekly)
    --cleanup-schedule CRON Cleanup schedule (default: weekly)
    --disable-full          Disable full backups
    --disable-db            Disable database backups
    --disable-files         Disable files backups
    --disable-config        Disable config backups
    --enable-s3             Enable S3 upload for scheduled backups
    --enable-encryption     Enable encryption for scheduled backups

EXAMPLES:
    $0 install
    $0 install --full-schedule "0 1 * * *" --enable-s3
    $0 status
    $0 run full
    $0 logs --tail 100
    $0 monitor

EOF
}

# Initialize scheduler
init_scheduler() {
    # Create log directory
    mkdir -p "$LOG_DIR"
    
    # Ensure backup script is executable
    chmod +x "$BACKUP_SCRIPT"
    
    log_info "Backup scheduler initialized"
}

# Check if running as root
check_permissions() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root for cron management"
        exit 1
    fi
}

# Install backup schedules
install_schedules() {
    log_info "Installing backup schedules..."
    
    # Backup current crontab
    local cron_backup="/tmp/crontab_backup_$(date +%s)"
    crontab -u "$CRON_USER" -l > "$cron_backup" 2>/dev/null || true
    
    # Remove existing Zapin backup entries
    crontab -u "$CRON_USER" -l 2>/dev/null | grep -v "# Zapin Backup" | crontab -u "$CRON_USER" - 2>/dev/null || true
    
    # Get current crontab
    local current_cron=$(mktemp)
    crontab -u "$CRON_USER" -l > "$current_cron" 2>/dev/null || true
    
    # Add header
    echo "" >> "$current_cron"
    echo "# Zapin Backup Schedules - Generated $(date)" >> "$current_cron"
    echo "# DO NOT EDIT MANUALLY - Use backup-scheduler.sh to manage" >> "$current_cron"
    
    # Build backup options
    local backup_opts=""
    if [[ "${ENABLE_S3:-false}" == "true" ]]; then
        backup_opts="$backup_opts --s3"
    fi
    if [[ "${ENABLE_ENCRYPTION:-false}" == "true" ]]; then
        backup_opts="$backup_opts --encrypt"
    fi
    
    # Add scheduled backups
    if [[ "${DISABLE_FULL:-false}" != "true" ]]; then
        local full_schedule="${FULL_SCHEDULE:-$DEFAULT_FULL_SCHEDULE}"
        echo "$full_schedule $BACKUP_SCRIPT full $backup_opts >> $LOG_DIR/full-backup.log 2>&1 # Zapin Backup - Full" >> "$current_cron"
        log_info "Added full backup schedule: $full_schedule"
    fi
    
    if [[ "${DISABLE_DB:-false}" != "true" ]]; then
        local db_schedule="${DB_SCHEDULE:-$DEFAULT_DB_SCHEDULE}"
        echo "$db_schedule $BACKUP_SCRIPT database $backup_opts >> $LOG_DIR/db-backup.log 2>&1 # Zapin Backup - Database" >> "$current_cron"
        log_info "Added database backup schedule: $db_schedule"
    fi
    
    if [[ "${DISABLE_FILES:-false}" != "true" ]]; then
        local files_schedule="${FILES_SCHEDULE:-$DEFAULT_FILES_SCHEDULE}"
        echo "$files_schedule $BACKUP_SCRIPT files $backup_opts >> $LOG_DIR/files-backup.log 2>&1 # Zapin Backup - Files" >> "$current_cron"
        log_info "Added files backup schedule: $files_schedule"
    fi
    
    if [[ "${DISABLE_CONFIG:-false}" != "true" ]]; then
        local config_schedule="${CONFIG_SCHEDULE:-$DEFAULT_CONFIG_SCHEDULE}"
        echo "$config_schedule $BACKUP_SCRIPT config $backup_opts >> $LOG_DIR/config-backup.log 2>&1 # Zapin Backup - Config" >> "$current_cron"
        log_info "Added config backup schedule: $config_schedule"
    fi
    
    # Add cleanup schedule
    local cleanup_schedule="${CLEANUP_SCHEDULE:-$DEFAULT_CLEANUP_SCHEDULE}"
    echo "$cleanup_schedule $BACKUP_SCRIPT cleanup >> $LOG_DIR/cleanup.log 2>&1 # Zapin Backup - Cleanup" >> "$current_cron"
    log_info "Added cleanup schedule: $cleanup_schedule"
    
    # Add monitoring schedule (every hour)
    echo "0 * * * * $0 monitor >> $LOG_DIR/monitor.log 2>&1 # Zapin Backup - Monitor" >> "$current_cron"
    
    # Install new crontab
    crontab -u "$CRON_USER" "$current_cron"
    
    # Cleanup
    rm "$current_cron"
    
    log_success "Backup schedules installed successfully"
    log_info "Crontab backup saved to: $cron_backup"
}

# Uninstall backup schedules
uninstall_schedules() {
    log_info "Uninstalling backup schedules..."
    
    # Remove Zapin backup entries from crontab
    crontab -u "$CRON_USER" -l 2>/dev/null | grep -v "# Zapin Backup" | crontab -u "$CRON_USER" - 2>/dev/null || true
    
    log_success "Backup schedules uninstalled"
}

# Show current backup schedules
show_status() {
    log_info "Current backup schedules:"
    
    echo "=== CRON SCHEDULES ==="
    crontab -u "$CRON_USER" -l 2>/dev/null | grep "# Zapin Backup" || echo "No Zapin backup schedules found"
    
    echo ""
    echo "=== RECENT BACKUP ACTIVITY ==="
    
    # Show recent backup logs
    local log_files=(
        "$LOG_DIR/full-backup.log"
        "$LOG_DIR/db-backup.log"
        "$LOG_DIR/files-backup.log"
        "$LOG_DIR/config-backup.log"
    )
    
    for log_file in "${log_files[@]}"; do
        if [[ -f "$log_file" ]]; then
            local backup_type=$(basename "$log_file" .log | sed 's/-backup//')
            local last_run=$(tail -n 50 "$log_file" | grep "SUCCESS" | tail -n 1 | cut -d' ' -f1-2 2>/dev/null || echo "Never")
            echo "$backup_type: Last successful run - $last_run"
        fi
    done
    
    echo ""
    echo "=== BACKUP STORAGE USAGE ==="
    local backup_dir="${BACKUP_DIR:-/opt/backups/zapin}"
    if [[ -d "$backup_dir" ]]; then
        du -sh "$backup_dir"/* 2>/dev/null || echo "No backups found"
    else
        echo "Backup directory not found: $backup_dir"
    fi
}

# Run scheduled backup with locking
run_scheduled_backup() {
    local backup_type="$1"
    
    # Check for lock file
    if [[ -f "$LOCK_FILE" ]]; then
        local lock_pid=$(cat "$LOCK_FILE")
        if kill -0 "$lock_pid" 2>/dev/null; then
            log_warning "Another backup is already running (PID: $lock_pid)"
            exit 1
        else
            log_warning "Stale lock file found, removing..."
            rm "$LOCK_FILE"
        fi
    fi
    
    # Create lock file
    echo $$ > "$LOCK_FILE"
    
    # Ensure lock file is removed on exit
    trap 'rm -f "$LOCK_FILE"' EXIT
    
    log_info "Starting scheduled $backup_type backup..."
    
    # Run backup with timeout
    local timeout_duration=7200  # 2 hours
    
    if timeout "$timeout_duration" "$BACKUP_SCRIPT" "$backup_type" --s3 --encrypt; then
        log_success "Scheduled $backup_type backup completed successfully"
        
        # Send success notification
        send_notification "success" "$backup_type backup completed successfully"
        
        return 0
    else
        local exit_code=$?
        log_error "Scheduled $backup_type backup failed with exit code: $exit_code"
        
        # Send failure notification
        send_notification "error" "$backup_type backup failed"
        
        return $exit_code
    fi
}

# Send notification
send_notification() {
    local status="$1"
    local message="$2"
    
    # Email notification
    if command -v mail &> /dev/null && [[ -n "${BACKUP_NOTIFICATION_EMAIL:-}" ]]; then
        local subject="Zapin Backup $status"
        echo "$message" | mail -s "$subject" "$BACKUP_NOTIFICATION_EMAIL"
    fi
    
    # Slack notification
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        local color="good"
        if [[ "$status" == "error" ]]; then
            color="danger"
        elif [[ "$status" == "warning" ]]; then
            color="warning"
        fi
        
        local payload=$(cat << EOF
{
    "attachments": [
        {
            "color": "$color",
            "title": "Zapin Backup Notification",
            "text": "$message",
            "footer": "$(hostname)",
            "ts": $(date +%s)
        }
    ]
}
EOF
)
        
        curl -X POST -H 'Content-type: application/json' \
            --data "$payload" \
            "$SLACK_WEBHOOK_URL" >/dev/null 2>&1 || true
    fi
}

# Monitor backup health
monitor_backups() {
    local issues=()
    local warnings=()
    
    # Check if backups are running on schedule
    local current_time=$(date +%s)
    local one_day_ago=$((current_time - 86400))
    local one_week_ago=$((current_time - 604800))
    
    # Check database backups (should run every 6 hours)
    local last_db_backup=$(find "${BACKUP_DIR:-/opt/backups/zapin}/database" -name "*.sql*" -newer /tmp/timestamp_6h 2>/dev/null | wc -l)
    touch -d "6 hours ago" /tmp/timestamp_6h
    
    if [[ $last_db_backup -eq 0 ]]; then
        issues+=("No database backup in the last 6 hours")
    fi
    
    # Check full backups (should run weekly)
    local last_full_backup=$(find "${BACKUP_DIR:-/opt/backups/zapin}/full" -name "*_manifest.json" -newer /tmp/timestamp_1w 2>/dev/null | wc -l)
    touch -d "1 week ago" /tmp/timestamp_1w
    
    if [[ $last_full_backup -eq 0 ]]; then
        warnings+=("No full backup in the last week")
    fi
    
    # Check disk space
    local backup_dir="${BACKUP_DIR:-/opt/backups/zapin}"
    if [[ -d "$backup_dir" ]]; then
        local disk_usage=$(df "$backup_dir" | awk 'NR==2 {print $5}' | sed 's/%//')
        if [[ $disk_usage -gt 90 ]]; then
            issues+=("Backup disk usage is at ${disk_usage}%")
        elif [[ $disk_usage -gt 80 ]]; then
            warnings+=("Backup disk usage is at ${disk_usage}%")
        fi
    fi
    
    # Check for failed backups in logs
    local failed_backups=$(grep -l "ERROR" "$LOG_DIR"/*.log 2>/dev/null | wc -l)
    if [[ $failed_backups -gt 0 ]]; then
        issues+=("$failed_backups backup logs contain errors")
    fi
    
    # Report issues
    if [[ ${#issues[@]} -gt 0 ]]; then
        log_error "Backup monitoring found issues:"
        for issue in "${issues[@]}"; do
            log_error "  - $issue"
        done
        
        # Send alert
        local issue_list=$(printf '%s\n' "${issues[@]}")
        send_notification "error" "Backup monitoring alerts:\n$issue_list"
    fi
    
    # Report warnings
    if [[ ${#warnings[@]} -gt 0 ]]; then
        log_warning "Backup monitoring found warnings:"
        for warning in "${warnings[@]}"; do
            log_warning "  - $warning"
        done
        
        # Send warning notification
        local warning_list=$(printf '%s\n' "${warnings[@]}")
        send_notification "warning" "Backup monitoring warnings:\n$warning_list"
    fi
    
    # If no issues or warnings, log success
    if [[ ${#issues[@]} -eq 0 ]] && [[ ${#warnings[@]} -eq 0 ]]; then
        log_success "Backup monitoring: All systems healthy"
    fi
    
    # Cleanup temporary files
    rm -f /tmp/timestamp_6h /tmp/timestamp_1w
}

# Show backup logs
show_logs() {
    local tail_lines="${TAIL_LINES:-50}"
    local log_type="${LOG_TYPE:-all}"
    
    case "$log_type" in
        full)
            tail -n "$tail_lines" "$LOG_DIR/full-backup.log" 2>/dev/null || echo "No full backup logs found"
            ;;
        database|db)
            tail -n "$tail_lines" "$LOG_DIR/db-backup.log" 2>/dev/null || echo "No database backup logs found"
            ;;
        files)
            tail -n "$tail_lines" "$LOG_DIR/files-backup.log" 2>/dev/null || echo "No files backup logs found"
            ;;
        config)
            tail -n "$tail_lines" "$LOG_DIR/config-backup.log" 2>/dev/null || echo "No config backup logs found"
            ;;
        monitor)
            tail -n "$tail_lines" "$LOG_DIR/monitor.log" 2>/dev/null || echo "No monitor logs found"
            ;;
        all|*)
            echo "=== FULL BACKUP LOGS ==="
            tail -n "$tail_lines" "$LOG_DIR/full-backup.log" 2>/dev/null || echo "No logs found"
            echo ""
            echo "=== DATABASE BACKUP LOGS ==="
            tail -n "$tail_lines" "$LOG_DIR/db-backup.log" 2>/dev/null || echo "No logs found"
            echo ""
            echo "=== FILES BACKUP LOGS ==="
            tail -n "$tail_lines" "$LOG_DIR/files-backup.log" 2>/dev/null || echo "No logs found"
            echo ""
            echo "=== CONFIG BACKUP LOGS ==="
            tail -n "$tail_lines" "$LOG_DIR/config-backup.log" 2>/dev/null || echo "No logs found"
            ;;
    esac
}

# Test backup schedule
test_schedule() {
    log_info "Testing backup schedule..."
    
    # Test database backup
    log_info "Testing database backup..."
    if "$BACKUP_SCRIPT" database --name "test_$(date +%s)"; then
        log_success "Database backup test passed"
    else
        log_error "Database backup test failed"
    fi
    
    # Test configuration backup
    log_info "Testing configuration backup..."
    if "$BACKUP_SCRIPT" config --name "test_$(date +%s)"; then
        log_success "Configuration backup test passed"
    else
        log_error "Configuration backup test failed"
    fi
    
    log_info "Backup schedule test completed"
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
            -u|--user)
                CRON_USER="$2"
                shift 2
                ;;
            --full-schedule)
                FULL_SCHEDULE="$2"
                shift 2
                ;;
            --db-schedule)
                DB_SCHEDULE="$2"
                shift 2
                ;;
            --files-schedule)
                FILES_SCHEDULE="$2"
                shift 2
                ;;
            --config-schedule)
                CONFIG_SCHEDULE="$2"
                shift 2
                ;;
            --cleanup-schedule)
                CLEANUP_SCHEDULE="$2"
                shift 2
                ;;
            --disable-full)
                DISABLE_FULL=true
                shift
                ;;
            --disable-db)
                DISABLE_DB=true
                shift
                ;;
            --disable-files)
                DISABLE_FILES=true
                shift
                ;;
            --disable-config)
                DISABLE_CONFIG=true
                shift
                ;;
            --enable-s3)
                ENABLE_S3=true
                shift
                ;;
            --enable-encryption)
                ENABLE_ENCRYPTION=true
                shift
                ;;
            --tail)
                TAIL_LINES="$2"
                shift 2
                ;;
            --type)
                LOG_TYPE="$2"
                shift 2
                ;;
            -*)
                log_error "Unknown option: $1"
                exit 1
                ;;
            *)
                if [[ -z "${COMMAND:-}" ]]; then
                    COMMAND="$1"
                elif [[ -z "${BACKUP_TYPE:-}" ]]; then
                    BACKUP_TYPE="$1"
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
    init_scheduler
    
    # Execute command
    case "$COMMAND" in
        install)
            check_permissions
            install_schedules
            ;;
        uninstall)
            check_permissions
            uninstall_schedules
            ;;
        status)
            show_status
            ;;
        run)
            if [[ -z "${BACKUP_TYPE:-}" ]]; then
                log_error "Backup type not specified for run command"
                exit 1
            fi
            run_scheduled_backup "$BACKUP_TYPE"
            ;;
        test)
            test_schedule
            ;;
        logs)
            show_logs
            ;;
        monitor)
            monitor_backups
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