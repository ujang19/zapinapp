#!/bin/bash

# Nginx Configuration Deployment Script
# This script manages Nginx configuration deployment for different environments

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NGINX_CONFIG_DIR="$PROJECT_ROOT/config/nginx"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Help function
show_help() {
    cat << EOF
Nginx Configuration Deployment Script

USAGE:
    $0 [OPTIONS] COMMAND [ENVIRONMENT]

COMMANDS:
    deploy      Deploy Nginx configuration for specified environment
    validate    Validate Nginx configuration files
    backup      Backup current Nginx configuration
    restore     Restore Nginx configuration from backup
    reload      Reload Nginx configuration
    status      Show Nginx status
    logs        Show Nginx logs
    test        Test Nginx configuration
    enable      Enable site configuration
    disable     Disable site configuration

ENVIRONMENTS:
    production      Production environment
    staging         Staging environment
    development     Development environment

OPTIONS:
    -h, --help              Show this help message
    -v, --verbose           Enable verbose output
    -f, --force             Force deployment without confirmation
    -b, --backup            Create backup before deployment
    -d, --dry-run           Show what would be deployed without making changes
    -r, --reload            Reload Nginx after deployment
    -t, --test              Test configuration before deployment

EXAMPLES:
    $0 deploy production
    $0 validate staging
    $0 backup
    $0 reload
    $0 enable staging
    $0 logs --tail 100

EOF
}

# Default values
VERBOSE=false
FORCE=false
BACKUP=false
DRY_RUN=false
RELOAD=false
TEST=false

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
            -b|--backup)
                BACKUP=true
                shift
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -r|--reload)
                RELOAD=true
                shift
                ;;
            -t|--test)
                TEST=true
                shift
                ;;
            --tail)
                TAIL_LINES="$2"
                shift 2
                ;;
            -*)
                log_error "Unknown option: $1"
                exit 1
                ;;
            *)
                if [[ -z "${COMMAND:-}" ]]; then
                    COMMAND="$1"
                elif [[ -z "${ENVIRONMENT:-}" ]]; then
                    ENVIRONMENT="$1"
                else
                    log_error "Too many arguments"
                    exit 1
                fi
                shift
                ;;
        esac
    done
}

# Check if running as root or with sudo
check_permissions() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root or with sudo"
        exit 1
    fi
}

# Check if Nginx is installed
check_nginx() {
    if ! command -v nginx &> /dev/null; then
        log_error "Nginx is not installed"
        exit 1
    fi
}

# Validate environment
validate_environment() {
    local env="$1"
    case "$env" in
        production|staging|development)
            return 0
            ;;
        *)
            log_error "Invalid environment: $env"
            log_error "Valid environments: production, staging, development"
            return 1
            ;;
    esac
}

# Test Nginx configuration
test_nginx_config() {
    log_info "Testing Nginx configuration..."
    
    if nginx -t; then
        log_success "Nginx configuration test passed"
        return 0
    else
        log_error "Nginx configuration test failed"
        return 1
    fi
}

# Backup current Nginx configuration
backup_nginx_config() {
    local backup_dir="/etc/nginx/backup"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="$backup_dir/nginx_config_${timestamp}.tar.gz"
    
    log_info "Creating Nginx configuration backup..."
    
    # Create backup directory
    mkdir -p "$backup_dir"
    
    # Create backup
    if tar -czf "$backup_file" -C /etc/nginx . 2>/dev/null; then
        log_success "Nginx configuration backed up to: $backup_file"
        
        # Keep only last 10 backups
        cd "$backup_dir"
        ls -t nginx_config_*.tar.gz | tail -n +11 | xargs -r rm --
        
        return 0
    else
        log_error "Failed to create Nginx configuration backup"
        return 1
    fi
}

# Deploy Nginx configuration
deploy_nginx_config() {
    local environment="$1"
    
    log_info "Deploying Nginx configuration for environment: $environment"
    
    # Create backup if requested
    if [[ "$BACKUP" == "true" ]]; then
        backup_nginx_config
    fi
    
    # Copy main configuration
    local main_config="$NGINX_CONFIG_DIR/nginx.conf"
    if [[ -f "$main_config" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "DRY RUN - Would copy: $main_config -> /etc/nginx/nginx.conf"
        else
            cp "$main_config" /etc/nginx/nginx.conf
            log_success "Deployed main Nginx configuration"
        fi
    else
        log_warning "Main Nginx configuration not found: $main_config"
    fi
    
    # Deploy environment-specific configuration
    case "$environment" in
        production)
            deploy_production_config
            ;;
        staging)
            deploy_staging_config
            ;;
        development)
            deploy_development_config
            ;;
    esac
    
    # Test configuration
    if [[ "$TEST" == "true" ]] || [[ "$environment" == "production" ]]; then
        if [[ "$DRY_RUN" != "true" ]]; then
            if ! test_nginx_config; then
                log_error "Configuration test failed, rolling back..."
                # Restore from backup if available
                restore_latest_backup
                return 1
            fi
        fi
    fi
    
    # Reload Nginx
    if [[ "$RELOAD" == "true" ]] && [[ "$DRY_RUN" != "true" ]]; then
        reload_nginx
    fi
    
    log_success "Nginx configuration deployment completed"
}

# Deploy production configuration
deploy_production_config() {
    log_info "Deploying production-specific configuration..."
    
    # Enable production site
    local prod_config="$NGINX_CONFIG_DIR/sites-available/zapin-production.conf"
    if [[ -f "$prod_config" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "DRY RUN - Would enable production site"
        else
            cp "$prod_config" /etc/nginx/sites-available/zapin-production.conf
            ln -sf /etc/nginx/sites-available/zapin-production.conf /etc/nginx/sites-enabled/
            log_success "Enabled production site configuration"
        fi
    fi
    
    # Disable other environments
    disable_site "zapin-staging"
    disable_site "zapin-development"
}

# Deploy staging configuration
deploy_staging_config() {
    log_info "Deploying staging-specific configuration..."
    
    # Enable staging site
    local staging_config="$NGINX_CONFIG_DIR/sites-available/zapin-staging.conf"
    if [[ -f "$staging_config" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "DRY RUN - Would enable staging site"
        else
            cp "$staging_config" /etc/nginx/sites-available/zapin-staging.conf
            ln -sf /etc/nginx/sites-available/zapin-staging.conf /etc/nginx/sites-enabled/
            log_success "Enabled staging site configuration"
        fi
    fi
    
    # Disable other environments
    disable_site "zapin-production"
    disable_site "zapin-development"
}

# Deploy development configuration
deploy_development_config() {
    log_info "Deploying development-specific configuration..."
    
    # For development, we might use a simpler configuration
    # or proxy to development servers
    log_info "Development environment uses application server directly"
    
    # Disable all site configurations
    disable_site "zapin-production"
    disable_site "zapin-staging"
}

# Enable site configuration
enable_site() {
    local site_name="$1"
    local available_config="/etc/nginx/sites-available/${site_name}.conf"
    local enabled_config="/etc/nginx/sites-enabled/${site_name}.conf"
    
    if [[ -f "$available_config" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "DRY RUN - Would enable site: $site_name"
        else
            ln -sf "$available_config" "$enabled_config"
            log_success "Enabled site: $site_name"
        fi
    else
        log_error "Site configuration not found: $available_config"
        return 1
    fi
}

# Disable site configuration
disable_site() {
    local site_name="$1"
    local enabled_config="/etc/nginx/sites-enabled/${site_name}.conf"
    
    if [[ -L "$enabled_config" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "DRY RUN - Would disable site: $site_name"
        else
            rm "$enabled_config"
            log_info "Disabled site: $site_name"
        fi
    fi
}

# Reload Nginx
reload_nginx() {
    log_info "Reloading Nginx configuration..."
    
    if systemctl reload nginx; then
        log_success "Nginx configuration reloaded successfully"
    else
        log_error "Failed to reload Nginx configuration"
        return 1
    fi
}

# Restart Nginx
restart_nginx() {
    log_info "Restarting Nginx..."
    
    if systemctl restart nginx; then
        log_success "Nginx restarted successfully"
    else
        log_error "Failed to restart Nginx"
        return 1
    fi
}

# Show Nginx status
show_nginx_status() {
    log_info "Nginx status:"
    systemctl status nginx --no-pager
    
    log_info "Active connections:"
    ss -tuln | grep :80
    ss -tuln | grep :443
    
    log_info "Enabled sites:"
    ls -la /etc/nginx/sites-enabled/
}

# Show Nginx logs
show_nginx_logs() {
    local tail_lines="${TAIL_LINES:-50}"
    
    log_info "Nginx access logs (last $tail_lines lines):"
    tail -n "$tail_lines" /var/log/nginx/access.log
    
    log_info "Nginx error logs (last $tail_lines lines):"
    tail -n "$tail_lines" /var/log/nginx/error.log
}

# Restore latest backup
restore_latest_backup() {
    local backup_dir="/etc/nginx/backup"
    
    if [[ ! -d "$backup_dir" ]]; then
        log_error "No backup directory found"
        return 1
    fi
    
    local latest_backup=$(ls -t "$backup_dir"/nginx_config_*.tar.gz 2>/dev/null | head -n1)
    
    if [[ -z "$latest_backup" ]]; then
        log_error "No backup files found"
        return 1
    fi
    
    log_info "Restoring from backup: $latest_backup"
    
    # Stop Nginx
    systemctl stop nginx
    
    # Restore configuration
    cd /etc/nginx
    tar -xzf "$latest_backup"
    
    # Start Nginx
    systemctl start nginx
    
    log_success "Configuration restored from backup"
}

# Validate all configurations
validate_all_configs() {
    log_info "Validating all Nginx configurations..."
    
    local configs=(
        "$NGINX_CONFIG_DIR/nginx.conf"
        "$NGINX_CONFIG_DIR/sites-available/zapin-staging.conf"
    )
    
    local valid=true
    
    for config in "${configs[@]}"; do
        if [[ -f "$config" ]]; then
            log_info "Validating: $config"
            
            # Basic syntax check
            if nginx -t -c "$config" 2>/dev/null; then
                log_success "✓ $config"
            else
                log_error "✗ $config"
                valid=false
            fi
        else
            log_warning "Configuration file not found: $config"
        fi
    done
    
    if [[ "$valid" == "true" ]]; then
        log_success "All configurations are valid"
        return 0
    else
        log_error "Some configurations have errors"
        return 1
    fi
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
    
    # Check permissions for most commands
    case "$COMMAND" in
        validate|logs)
            # These commands don't require root
            ;;
        *)
            check_permissions
            ;;
    esac
    
    # Check if Nginx is installed
    check_nginx
    
    # Execute command
    case "$COMMAND" in
        deploy)
            if [[ -z "${ENVIRONMENT:-}" ]]; then
                log_error "Environment not specified for deploy command"
                exit 1
            fi
            validate_environment "$ENVIRONMENT"
            deploy_nginx_config "$ENVIRONMENT"
            ;;
        validate)
            validate_all_configs
            ;;
        backup)
            backup_nginx_config
            ;;
        restore)
            restore_latest_backup
            ;;
        reload)
            reload_nginx
            ;;
        restart)
            restart_nginx
            ;;
        status)
            show_nginx_status
            ;;
        logs)
            show_nginx_logs
            ;;
        test)
            test_nginx_config
            ;;
        enable)
            if [[ -z "${ENVIRONMENT:-}" ]]; then
                log_error "Environment not specified for enable command"
                exit 1
            fi
            validate_environment "$ENVIRONMENT"
            enable_site "zapin-$ENVIRONMENT"
            ;;
        disable)
            if [[ -z "${ENVIRONMENT:-}" ]]; then
                log_error "Environment not specified for disable command"
                exit 1
            fi
            validate_environment "$ENVIRONMENT"
            disable_site "zapin-$ENVIRONMENT"
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