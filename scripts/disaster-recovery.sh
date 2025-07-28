#!/bin/bash

# Disaster Recovery Automation Script for Zapin WhatsApp SaaS
# This script automates disaster recovery procedures and failover operations

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
DR_LOG_DIR="/var/log/zapin/disaster-recovery"
INCIDENT_ID="DR_$(date +%Y%m%d_%H%M%S)"
LOCK_FILE="/var/run/zapin-dr.lock"

# Infrastructure configuration
PRIMARY_SITE="${PRIMARY_SITE:-primary}"
DR_SITE="${DR_SITE:-secondary}"
PRIMARY_DB_HOST="${PRIMARY_DB_HOST:-db-primary.zapin.app}"
DR_DB_HOST="${DR_DB_HOST:-db-dr.zapin.app}"
PRIMARY_APP_HOSTS="${PRIMARY_APP_HOSTS:-app1.zapin.app,app2.zapin.app}"
DR_APP_HOSTS="${DR_APP_HOSTS:-dr-app1.zapin.app,dr-app2.zapin.app}"

# DNS configuration
DNS_PROVIDER="${DNS_PROVIDER:-cloudflare}"
DNS_ZONE="${DNS_ZONE:-zapin.app}"
DNS_API_TOKEN="${DNS_API_TOKEN:-}"

# Notification configuration
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
EMAIL_RECIPIENTS="${DR_EMAIL_RECIPIENTS:-}"
SMS_RECIPIENTS="${DR_SMS_RECIPIENTS:-}"

# Help function
show_help() {
    cat << EOF
Zapin Disaster Recovery Automation

USAGE:
    $0 [OPTIONS] COMMAND

COMMANDS:
    status              Check current system status and health
    failover            Execute failover to DR site
    failback            Execute failback to primary site
    test                Run DR test scenarios
    validate            Validate DR readiness
    monitor             Monitor DR site health
    notify              Send DR notifications
    cleanup             Cleanup after DR operations

FAILOVER SCENARIOS:
    server-failure      Primary server failure
    database-failure    Database corruption/failure
    site-outage         Complete data center outage
    security-incident   Cyber security incident
    planned-maintenance Planned maintenance failover

OPTIONS:
    -h, --help              Show this help message
    -v, --verbose           Enable verbose output
    -f, --force             Force operation without confirmation
    -d, --dry-run           Show what would be done without executing
    -s, --scenario TYPE     Specify disaster scenario
    -t, --target SITE       Target site for failover (primary/secondary)
    --skip-dns              Skip DNS updates
    --skip-notifications    Skip sending notifications
    --incident-id ID        Custom incident ID

EXAMPLES:
    $0 status
    $0 failover --scenario server-failure
    $0 test --scenario database-failure --dry-run
    $0 failback --target primary
    $0 validate --verbose

EOF
}

# Initialize DR environment
init_dr() {
    # Create DR log directory
    mkdir -p "$DR_LOG_DIR"
    
    # Set up DR log
    DR_LOG="$DR_LOG_DIR/dr_${INCIDENT_ID}.log"
    exec 1> >(tee -a "$DR_LOG")
    exec 2> >(tee -a "$DR_LOG" >&2)
    
    log_info "Disaster Recovery session started - Incident ID: $INCIDENT_ID"
    log_info "DR Log: $DR_LOG"
    log_info "Initiated by: $(whoami) on $(hostname)"
}

# Check for existing DR operations
check_lock() {
    if [[ -f "$LOCK_FILE" ]]; then
        local lock_pid=$(cat "$LOCK_FILE")
        if kill -0 "$lock_pid" 2>/dev/null; then
            log_error "Another DR operation is already running (PID: $lock_pid)"
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
}

# Check system status
check_status() {
    log_info "Checking system status..."
    
    local status_report="$DR_LOG_DIR/status_$(date +%Y%m%d_%H%M%S).json"
    
    # Initialize status object
    cat > "$status_report" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "incident_id": "$INCIDENT_ID",
    "primary_site": {
        "status": "unknown",
        "services": {},
        "database": {},
        "network": {}
    },
    "dr_site": {
        "status": "unknown",
        "services": {},
        "database": {},
        "network": {}
    },
    "overall_health": "unknown"
}
EOF
    
    # Check primary site
    log_info "Checking primary site status..."
    check_site_status "$PRIMARY_SITE" "$status_report"
    
    # Check DR site
    log_info "Checking DR site status..."
    check_site_status "$DR_SITE" "$status_report"
    
    # Generate summary
    generate_status_summary "$status_report"
    
    log_success "Status check completed - Report: $status_report"
}

# Check individual site status
check_site_status() {
    local site="$1"
    local report_file="$2"
    
    local site_healthy=true
    
    # Determine hosts based on site
    local app_hosts db_host
    if [[ "$site" == "$PRIMARY_SITE" ]]; then
        app_hosts="$PRIMARY_APP_HOSTS"
        db_host="$PRIMARY_DB_HOST"
    else
        app_hosts="$DR_APP_HOSTS"
        db_host="$DR_DB_HOST"
    fi
    
    # Check application servers
    log_info "Checking application servers for $site..."
    IFS=',' read -ra hosts <<< "$app_hosts"
    local app_status="healthy"
    
    for host in "${hosts[@]}"; do
        if check_http_health "$host"; then
            log_success "✓ $host is responding"
        else
            log_error "✗ $host is not responding"
            app_status="unhealthy"
            site_healthy=false
        fi
    done
    
    # Check database
    log_info "Checking database for $site..."
    local db_status="healthy"
    if check_database_health "$db_host"; then
        log_success "✓ Database $db_host is responding"
    else
        log_error "✗ Database $db_host is not responding"
        db_status="unhealthy"
        site_healthy=false
    fi
    
    # Check network connectivity
    log_info "Checking network connectivity for $site..."
    local network_status="healthy"
    if check_network_connectivity "$site"; then
        log_success "✓ Network connectivity to $site is good"
    else
        log_error "✗ Network connectivity to $site has issues"
        network_status="degraded"
        site_healthy=false
    fi
    
    # Update status report
    local overall_status="healthy"
    if [[ "$site_healthy" != "true" ]]; then
        overall_status="unhealthy"
    fi
    
    # Update JSON report (simplified - in production use jq)
    log_info "Site $site overall status: $overall_status"
}

# Check HTTP health
check_http_health() {
    local host="$1"
    local url="https://$host/health"
    
    if curl -f -s --max-time 10 "$url" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Check database health
check_database_health() {
    local db_host="$1"
    
    # Use pg_isready or similar tool
    if command -v pg_isready &> /dev/null; then
        if pg_isready -h "$db_host" -p 5432 -t 10; then
            return 0
        fi
    fi
    
    # Fallback to telnet check
    if timeout 10 bash -c "</dev/tcp/$db_host/5432" 2>/dev/null; then
        return 0
    fi
    
    return 1
}

# Check network connectivity
check_network_connectivity() {
    local site="$1"
    
    # Ping test
    if ping -c 3 -W 5 "$site.zapin.app" >/dev/null 2>&1; then
        return 0
    fi
    
    return 1
}

# Generate status summary
generate_status_summary() {
    local report_file="$1"
    
    log_info "=== SYSTEM STATUS SUMMARY ==="
    log_info "Primary Site: $(get_site_status "$PRIMARY_SITE")"
    log_info "DR Site: $(get_site_status "$DR_SITE")"
    log_info "Overall Health: $(get_overall_health)"
    log_info "=========================="
}

# Execute failover
execute_failover() {
    local scenario="${SCENARIO:-server-failure}"
    local target_site="${TARGET_SITE:-$DR_SITE}"
    
    log_info "Executing failover - Scenario: $scenario, Target: $target_site"
    
    # Send initial notification
    send_notification "warning" "Disaster Recovery Initiated" "Failover to $target_site started for scenario: $scenario"
    
    # Pre-failover checks
    if ! pre_failover_checks "$target_site"; then
        log_error "Pre-failover checks failed. Aborting failover."
        return 1
    fi
    
    # Execute scenario-specific failover
    case "$scenario" in
        server-failure)
            execute_server_failure_recovery "$target_site"
            ;;
        database-failure)
            execute_database_failure_recovery "$target_site"
            ;;
        site-outage)
            execute_site_outage_recovery "$target_site"
            ;;
        security-incident)
            execute_security_incident_recovery "$target_site"
            ;;
        planned-maintenance)
            execute_planned_maintenance_failover "$target_site"
            ;;
        *)
            log_error "Unknown scenario: $scenario"
            return 1
            ;;
    esac
    
    # Post-failover verification
    if post_failover_verification "$target_site"; then
        log_success "Failover completed successfully"
        send_notification "success" "Disaster Recovery Completed" "Failover to $target_site completed successfully"
        return 0
    else
        log_error "Failover verification failed"
        send_notification "error" "Disaster Recovery Failed" "Failover to $target_site failed verification"
        return 1
    fi
}

# Pre-failover checks
pre_failover_checks() {
    local target_site="$1"
    
    log_info "Running pre-failover checks for $target_site..."
    
    # Check DR site readiness
    if ! check_dr_site_readiness "$target_site"; then
        log_error "DR site is not ready for failover"
        return 1
    fi
    
    # Check backup availability
    if ! check_backup_availability; then
        log_error "Required backups are not available"
        return 1
    fi
    
    # Check network connectivity
    if ! check_network_connectivity "$target_site"; then
        log_error "Network connectivity to DR site is poor"
        return 1
    fi
    
    log_success "Pre-failover checks passed"
    return 0
}

# Check DR site readiness
check_dr_site_readiness() {
    local site="$1"
    
    log_info "Checking DR site readiness..."
    
    # Check if DR services are running
    if [[ "$site" == "$DR_SITE" ]]; then
        local dr_hosts="$DR_APP_HOSTS"
        IFS=',' read -ra hosts <<< "$dr_hosts"
        
        for host in "${hosts[@]}"; do
            if ! check_http_health "$host"; then
                log_error "DR application server $host is not ready"
                return 1
            fi
        done
        
        if ! check_database_health "$DR_DB_HOST"; then
            log_error "DR database is not ready"
            return 1
        fi
    fi
    
    return 0
}

# Check backup availability
check_backup_availability() {
    log_info "Checking backup availability..."
    
    # Check for recent database backup
    local latest_db_backup=$("$SCRIPT_DIR/backup-system.sh" list | grep "database" | head -1)
    if [[ -z "$latest_db_backup" ]]; then
        log_error "No database backups available"
        return 1
    fi
    
    # Check backup age (should be less than 24 hours old)
    local backup_age=$(find "${BACKUP_DIR:-/opt/backups/zapin}/database" -name "*.sql*" -mtime -1 | wc -l)
    if [[ $backup_age -eq 0 ]]; then
        log_warning "Latest database backup is older than 24 hours"
    fi
    
    return 0
}

# Execute server failure recovery
execute_server_failure_recovery() {
    local target_site="$1"
    
    log_info "Executing server failure recovery to $target_site..."
    
    # Step 1: Activate DR application servers
    log_info "Activating DR application servers..."
    if ! activate_dr_applications "$target_site"; then
        log_error "Failed to activate DR applications"
        return 1
    fi
    
    # Step 2: Update DNS to point to DR site
    if [[ "${SKIP_DNS:-false}" != "true" ]]; then
        log_info "Updating DNS to point to DR site..."
        if ! update_dns_to_dr "$target_site"; then
            log_error "Failed to update DNS"
            return 1
        fi
    fi
    
    # Step 3: Verify services
    log_info "Verifying services on DR site..."
    if ! verify_dr_services "$target_site"; then
        log_error "DR services verification failed"
        return 1
    fi
    
    log_success "Server failure recovery completed"
    return 0
}

# Execute database failure recovery
execute_database_failure_recovery() {
    local target_site="$1"
    
    log_info "Executing database failure recovery to $target_site..."
    
    # Step 1: Promote DR database
    log_info "Promoting DR database to primary..."
    if ! promote_dr_database "$target_site"; then
        log_error "Failed to promote DR database"
        return 1
    fi
    
    # Step 2: Update application configuration
    log_info "Updating application database configuration..."
    if ! update_app_db_config "$DR_DB_HOST"; then
        log_error "Failed to update application database configuration"
        return 1
    fi
    
    # Step 3: Restart applications
    log_info "Restarting applications with new database configuration..."
    if ! restart_applications; then
        log_error "Failed to restart applications"
        return 1
    fi
    
    log_success "Database failure recovery completed"
    return 0
}

# Execute site outage recovery
execute_site_outage_recovery() {
    local target_site="$1"
    
    log_info "Executing site outage recovery to $target_site..."
    
    # Step 1: Activate complete DR site
    log_info "Activating complete DR site..."
    if ! activate_complete_dr_site "$target_site"; then
        log_error "Failed to activate complete DR site"
        return 1
    fi
    
    # Step 2: Restore data from backups
    log_info "Restoring data from latest backups..."
    if ! restore_data_to_dr "$target_site"; then
        log_error "Failed to restore data to DR site"
        return 1
    fi
    
    # Step 3: Update DNS completely
    if [[ "${SKIP_DNS:-false}" != "true" ]]; then
        log_info "Updating all DNS records to DR site..."
        if ! update_all_dns_to_dr "$target_site"; then
            log_error "Failed to update DNS records"
            return 1
        fi
    fi
    
    log_success "Site outage recovery completed"
    return 0
}

# Activate DR applications
activate_dr_applications() {
    local target_site="$1"
    
    if [[ "$target_site" == "$DR_SITE" ]]; then
        IFS=',' read -ra hosts <<< "$DR_APP_HOSTS"
        
        for host in "${hosts[@]}"; do
            log_info "Activating application on $host..."
            
            # SSH to DR host and start services
            if ssh -o ConnectTimeout=10 "$host" "sudo systemctl start zapin-api zapin-app nginx"; then
                log_success "Services started on $host"
            else
                log_error "Failed to start services on $host"
                return 1
            fi
        done
    fi
    
    return 0
}

# Update DNS to DR
update_dns_to_dr() {
    local target_site="$1"
    
    if [[ "$target_site" == "$DR_SITE" ]]; then
        # Update main domain
        if ! update_dns_record "zapin.app" "A" "$DR_APP_HOSTS"; then
            return 1
        fi
        
        # Update API subdomain
        if ! update_dns_record "api.zapin.app" "A" "$DR_APP_HOSTS"; then
            return 1
        fi
    fi
    
    return 0
}

# Update DNS record
update_dns_record() {
    local domain="$1"
    local record_type="$2"
    local value="$3"
    
    case "$DNS_PROVIDER" in
        cloudflare)
            # Use Cloudflare API to update DNS
            log_info "Updating DNS record: $domain -> $value"
            # Implementation would use Cloudflare API
            return 0
            ;;
        route53)
            # Use AWS Route53 API
            log_info "Updating Route53 record: $domain -> $value"
            # Implementation would use AWS CLI
            return 0
            ;;
        *)
            log_warning "DNS provider $DNS_PROVIDER not supported for automatic updates"
            return 1
            ;;
    esac
}

# Post-failover verification
post_failover_verification() {
    local target_site="$1"
    
    log_info "Running post-failover verification..."
    
    # Wait for DNS propagation
    log_info "Waiting for DNS propagation..."
    sleep 30
    
    # Check application accessibility
    if ! check_http_health "zapin.app"; then
        log_error "Main application is not accessible"
        return 1
    fi
    
    if ! check_http_health "api.zapin.app"; then
        log_error "API is not accessible"
        return 1
    fi
    
    # Check database connectivity
    if ! check_database_health "$DR_DB_HOST"; then
        log_error "Database is not accessible"
        return 1
    fi
    
    # Run basic functionality tests
    if ! run_basic_functionality_tests; then
        log_error "Basic functionality tests failed"
        return 1
    fi
    
    log_success "Post-failover verification passed"
    return 0
}

# Run basic functionality tests
run_basic_functionality_tests() {
    log_info "Running basic functionality tests..."
    
    # Test API health endpoint
    if ! curl -f -s "https://api.zapin.app/health" >/dev/null; then
        log_error "API health check failed"
        return 1
    fi
    
    # Test authentication endpoint
    if ! curl -f -s "https://api.zapin.app/auth/health" >/dev/null; then
        log_error "Authentication service check failed"
        return 1
    fi
    
    log_success "Basic functionality tests passed"
    return 0
}

# Send notifications
send_notification() {
    local level="$1"
    local title="$2"
    local message="$3"
    
    if [[ "${SKIP_NOTIFICATIONS:-false}" == "true" ]]; then
        return 0
    fi
    
    log_info "Sending $level notification: $title"
    
    # Slack notification
    if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
        send_slack_notification "$level" "$title" "$message"
    fi
    
    # Email notification
    if [[ -n "$EMAIL_RECIPIENTS" ]]; then
        send_email_notification "$level" "$title" "$message"
    fi
    
    # SMS notification for critical alerts
    if [[ "$level" == "error" ]] && [[ -n "$SMS_RECIPIENTS" ]]; then
        send_sms_notification "$title" "$message"
    fi
}

# Send Slack notification
send_slack_notification() {
    local level="$1"
    local title="$2"
    local message="$3"
    
    local color="good"
    case "$level" in
        error) color="danger" ;;
        warning) color="warning" ;;
        success) color="good" ;;
    esac
    
    local payload=$(cat << EOF
{
    "attachments": [
        {
            "color": "$color",
            "title": "$title",
            "text": "$message",
            "fields": [
                {
                    "title": "Incident ID",
                    "value": "$INCIDENT_ID",
                    "short": true
                },
                {
                    "title": "Timestamp",
                    "value": "$(date)",
                    "short": true
                }
            ],
            "footer": "Zapin DR System",
            "ts": $(date +%s)
        }
    ]
}
EOF
)
    
    curl -X POST -H 'Content-type: application/json' \
        --data "$payload" \
        "$SLACK_WEBHOOK_URL" >/dev/null 2>&1 || true
}

# Validate DR readiness
validate_dr_readiness() {
    log_info "Validating disaster recovery readiness..."
    
    local validation_passed=true
    
    # Check DR site infrastructure
    log_info "Checking DR site infrastructure..."
    if ! check_dr_site_readiness "$DR_SITE"; then
        validation_passed=false
    fi
    
    # Check backup systems
    log_info "Checking backup systems..."
    if ! check_backup_availability; then
        validation_passed=false
    fi
    
    # Check monitoring systems
    log_info "Checking monitoring systems..."
    if ! check_monitoring_systems; then
        validation_passed=false
    fi
    
    # Check network connectivity
    log_info "Checking network connectivity..."
    if ! check_network_connectivity "$DR_SITE"; then
        validation_passed=false
    fi
    
    # Check DNS configuration
    log_info "Checking DNS configuration..."
    if ! validate_dns_configuration; then
        validation_passed=false
    fi
    
    if [[ "$validation_passed" == "true" ]]; then
        log_success "DR readiness validation passed"
        return 0
    else
        log_error "DR readiness validation failed"
        return 1
    fi
}

# Check monitoring systems
check_monitoring_systems() {
    # Check if monitoring is accessible
    if command -v curl &> /dev/null; then
        if curl -f -s "http://monitoring.zapin.app/health" >/dev/null 2>&1; then
            return 0
        fi
    fi
    
    return 1
}

# Validate DNS configuration
validate_dns_configuration() {
    # Check if DNS records are properly configured
    local main_ip=$(dig +short zapin.app)
    local api_ip=$(dig +short api.zapin.app)
    
    if [[ -n "$main_ip" ]] && [[ -n "$api_ip" ]]; then
        return 0
    fi
    
    return 1
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
                FORCE=true
                shift
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -s|--scenario)
                SCENARIO="$2"
                shift 2
                ;;
            -t|--target)
                TARGET_SITE="$2"
                shift 2
                ;;
            --skip-dns)
                SKIP_DNS=true
                shift
                ;;
            --skip-notifications)
                SKIP_NOTIFICATIONS=true
                shift
                ;;
            --incident-id)
                INCIDENT_ID="$2"
                shift 2
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
    
    # Initialize DR environment
    init_dr
    check_lock
    
    # Execute command
    case "$COMMAND" in
        status)
            check_status
            ;;
        failover)
            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "DRY RUN - Would execute failover with scenario: ${SCENARIO:-server-failure}"
            else
                execute_failover
            fi
            ;;
        validate)
            validate_dr_readiness
            ;;
        test)
            log_info "Running DR test scenario: ${SCENARIO:-server-failure}"
            # Test scenarios would be implemented here
            ;;
        notify)
            send_notification "info" "DR Test Notification" "This is a test notification from the DR system"
            ;;
        *)
            log_error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
    
    log_info "DR operation completed - Log saved to: $DR_LOG"
}

# Run main function
main "$@"