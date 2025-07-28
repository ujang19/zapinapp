#!/bin/bash

# Configuration Deployment Script
# This script manages environment-specific configuration deployment

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_ROOT/config"

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
Configuration Deployment Script

USAGE:
    $0 [OPTIONS] COMMAND ENVIRONMENT

COMMANDS:
    deploy      Deploy configuration for specified environment
    validate    Validate configuration files
    backup      Backup current configuration
    restore     Restore configuration from backup
    diff        Show differences between environments
    template    Generate configuration template
    encrypt     Encrypt sensitive configuration values
    decrypt     Decrypt sensitive configuration values

ENVIRONMENTS:
    development     Development environment
    staging         Staging environment
    production      Production environment
    test           Test environment

OPTIONS:
    -h, --help              Show this help message
    -v, --verbose           Enable verbose output
    -f, --force             Force deployment without confirmation
    -b, --backup            Create backup before deployment
    -d, --dry-run           Show what would be deployed without making changes
    -e, --env-file FILE     Use specific environment file
    -t, --target PATH       Target deployment path
    -k, --key-file FILE     Encryption key file for sensitive values

EXAMPLES:
    $0 deploy production
    $0 validate staging
    $0 backup production
    $0 diff development staging
    $0 encrypt production --key-file /path/to/key
    $0 template > new-environment.env

EOF
}

# Default values
VERBOSE=false
FORCE=false
BACKUP=false
DRY_RUN=false
ENV_FILE=""
TARGET_PATH=""
KEY_FILE=""

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
            -e|--env-file)
                ENV_FILE="$2"
                shift 2
                ;;
            -t|--target)
                TARGET_PATH="$2"
                shift 2
                ;;
            -k|--key-file)
                KEY_FILE="$2"
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

# Validate environment
validate_environment() {
    local env="$1"
    case "$env" in
        development|staging|production|test)
            return 0
            ;;
        *)
            log_error "Invalid environment: $env"
            log_error "Valid environments: development, staging, production, test"
            return 1
            ;;
    esac
}

# Check if required tools are installed
check_dependencies() {
    local missing_tools=()
    
    # Check for required tools
    for tool in jq openssl; do
        if ! command -v "$tool" &> /dev/null; then
            missing_tools+=("$tool")
        fi
    done
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        log_error "Please install the missing tools and try again"
        return 1
    fi
}

# Validate configuration file
validate_config() {
    local env_file="$1"
    
    if [[ ! -f "$env_file" ]]; then
        log_error "Configuration file not found: $env_file"
        return 1
    fi
    
    log_info "Validating configuration file: $env_file"
    
    # Check for required variables
    local required_vars=(
        "NODE_ENV"
        "APP_URL"
        "DATABASE_URL"
        "REDIS_URL"
        "JWT_SECRET"
        "ENCRYPTION_KEY"
    )
    
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" "$env_file"; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required variables: ${missing_vars[*]}"
        return 1
    fi
    
    # Check for placeholder values
    local placeholder_vars=()
    
    while IFS= read -r line; do
        if [[ "$line" =~ ^([^#][^=]+)=\$\{[^}]+\}$ ]]; then
            var_name="${BASH_REMATCH[1]}"
            placeholder_vars+=("$var_name")
        fi
    done < "$env_file"
    
    if [[ ${#placeholder_vars[@]} -gt 0 ]]; then
        log_warning "Variables with placeholder values: ${placeholder_vars[*]}"
        log_warning "Make sure to replace these with actual values before deployment"
    fi
    
    log_success "Configuration validation completed"
    return 0
}

# Deploy configuration
deploy_config() {
    local environment="$1"
    local env_file="${ENV_FILE:-$CONFIG_DIR/environments/${environment}.env}"
    local target="${TARGET_PATH:-$PROJECT_ROOT/.env}"
    
    if [[ ! -f "$env_file" ]]; then
        log_error "Environment file not found: $env_file"
        return 1
    fi
    
    # Validate configuration
    if ! validate_config "$env_file"; then
        log_error "Configuration validation failed"
        return 1
    fi
    
    # Create backup if requested
    if [[ "$BACKUP" == "true" ]] && [[ -f "$target" ]]; then
        backup_config "$environment"
    fi
    
    # Show what will be deployed
    log_info "Deploying configuration for environment: $environment"
    log_info "Source: $env_file"
    log_info "Target: $target"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN - Configuration would be deployed to: $target"
        return 0
    fi
    
    # Confirm deployment in production
    if [[ "$environment" == "production" ]] && [[ "$FORCE" != "true" ]]; then
        echo -n "Are you sure you want to deploy to production? (y/N): "
        read -r confirmation
        if [[ "$confirmation" != "y" ]] && [[ "$confirmation" != "Y" ]]; then
            log_info "Deployment cancelled"
            return 0
        fi
    fi
    
    # Deploy configuration
    if cp "$env_file" "$target"; then
        log_success "Configuration deployed successfully"
        
        # Set appropriate permissions
        chmod 600 "$target"
        
        # Verify deployment
        if validate_config "$target"; then
            log_success "Deployment verification completed"
        else
            log_error "Deployment verification failed"
            return 1
        fi
    else
        log_error "Failed to deploy configuration"
        return 1
    fi
}

# Backup configuration
backup_config() {
    local environment="$1"
    local target="${TARGET_PATH:-$PROJECT_ROOT/.env}"
    local backup_dir="$CONFIG_DIR/backups"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="$backup_dir/${environment}_${timestamp}.env"
    
    # Create backup directory
    mkdir -p "$backup_dir"
    
    if [[ -f "$target" ]]; then
        if cp "$target" "$backup_file"; then
            log_success "Configuration backed up to: $backup_file"
        else
            log_error "Failed to create backup"
            return 1
        fi
    else
        log_warning "No existing configuration to backup"
    fi
}

# Restore configuration
restore_config() {
    local environment="$1"
    local backup_dir="$CONFIG_DIR/backups"
    local target="${TARGET_PATH:-$PROJECT_ROOT/.env}"
    
    # List available backups
    log_info "Available backups for $environment:"
    local backups=($(ls -1 "$backup_dir/${environment}_"*.env 2>/dev/null | sort -r))
    
    if [[ ${#backups[@]} -eq 0 ]]; then
        log_error "No backups found for environment: $environment"
        return 1
    fi
    
    # Show backups with numbers
    for i in "${!backups[@]}"; do
        local backup_file="${backups[$i]}"
        local backup_name=$(basename "$backup_file")
        local backup_date=$(echo "$backup_name" | sed -E 's/.*_([0-9]{8}_[0-9]{6})\.env/\1/')
        echo "$((i+1)). $backup_name ($(date -d "${backup_date:0:8} ${backup_date:9:2}:${backup_date:11:2}:${backup_date:13:2}" 2>/dev/null || echo "$backup_date"))"
    done
    
    # Get user selection
    echo -n "Select backup to restore (1-${#backups[@]}): "
    read -r selection
    
    if [[ ! "$selection" =~ ^[0-9]+$ ]] || [[ "$selection" -lt 1 ]] || [[ "$selection" -gt ${#backups[@]} ]]; then
        log_error "Invalid selection"
        return 1
    fi
    
    local selected_backup="${backups[$((selection-1))]}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN - Would restore: $selected_backup"
        return 0
    fi
    
    # Confirm restore
    if [[ "$FORCE" != "true" ]]; then
        echo -n "Are you sure you want to restore this backup? (y/N): "
        read -r confirmation
        if [[ "$confirmation" != "y" ]] && [[ "$confirmation" != "Y" ]]; then
            log_info "Restore cancelled"
            return 0
        fi
    fi
    
    # Restore backup
    if cp "$selected_backup" "$target"; then
        log_success "Configuration restored from: $selected_backup"
        chmod 600 "$target"
    else
        log_error "Failed to restore configuration"
        return 1
    fi
}

# Compare configurations
diff_config() {
    local env1="$1"
    local env2="$2"
    local file1="$CONFIG_DIR/environments/${env1}.env"
    local file2="$CONFIG_DIR/environments/${env2}.env"
    
    if [[ ! -f "$file1" ]]; then
        log_error "Configuration file not found: $file1"
        return 1
    fi
    
    if [[ ! -f "$file2" ]]; then
        log_error "Configuration file not found: $file2"
        return 1
    fi
    
    log_info "Comparing configurations: $env1 vs $env2"
    
    # Use diff with color if available
    if command -v colordiff &> /dev/null; then
        colordiff -u "$file1" "$file2" || true
    else
        diff -u "$file1" "$file2" || true
    fi
}

# Generate configuration template
generate_template() {
    cat << 'EOF'
# Environment Configuration Template
# Copy this file and customize for your environment

# Application
NODE_ENV=development
APP_NAME=Zapin WhatsApp SaaS
APP_VERSION=1.0.0
APP_URL=http://localhost:3000
API_URL=http://localhost:3001
PORT=3000
API_PORT=3001

# Security (CHANGE THESE VALUES)
JWT_SECRET=your-jwt-secret-min-32-characters
JWT_REFRESH_SECRET=your-refresh-secret-min-32-characters
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ENCRYPTION_KEY=your-32-character-encryption-key
SESSION_SECRET=your-session-secret-min-32-chars

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/database
DATABASE_POOL_SIZE=10
DATABASE_CONNECTION_TIMEOUT=30000
DATABASE_IDLE_TIMEOUT=600000
DATABASE_SSL=false

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=zapin:
REDIS_CONNECTION_TIMEOUT=5000
REDIS_TLS_ENABLED=false

# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-evolution-api-key
EVOLUTION_API_TIMEOUT=30000
EVOLUTION_API_RETRY_ATTEMPTS=3
EVOLUTION_API_RETRY_DELAY=1000

# Add more configuration variables as needed...
EOF
}

# Encrypt sensitive values
encrypt_config() {
    local environment="$1"
    local env_file="$CONFIG_DIR/environments/${environment}.env"
    local key_file="${KEY_FILE:-$CONFIG_DIR/keys/${environment}.key}"
    
    if [[ ! -f "$env_file" ]]; then
        log_error "Environment file not found: $env_file"
        return 1
    fi
    
    if [[ ! -f "$key_file" ]]; then
        log_error "Key file not found: $key_file"
        log_info "Generate a key file with: openssl rand -base64 32 > $key_file"
        return 1
    fi
    
    # Sensitive variables to encrypt
    local sensitive_vars=(
        "JWT_SECRET"
        "JWT_REFRESH_SECRET"
        "ENCRYPTION_KEY"
        "SESSION_SECRET"
        "DATABASE_URL"
        "REDIS_PASSWORD"
        "EVOLUTION_API_KEY"
        "SMTP_PASS"
        "STRIPE_SECRET_KEY"
        "AWS_SECRET_ACCESS_KEY"
    )
    
    local encrypted_file="${env_file}.encrypted"
    cp "$env_file" "$encrypted_file"
    
    for var in "${sensitive_vars[@]}"; do
        if grep -q "^${var}=" "$encrypted_file"; then
            local value=$(grep "^${var}=" "$encrypted_file" | cut -d'=' -f2-)
            if [[ -n "$value" ]] && [[ "$value" != \$\{* ]]; then
                local encrypted_value=$(echo -n "$value" | openssl enc -aes-256-cbc -base64 -pass file:"$key_file")
                sed -i "s|^${var}=.*|${var}=ENC:${encrypted_value}|" "$encrypted_file"
                log_info "Encrypted variable: $var"
            fi
        fi
    done
    
    log_success "Encrypted configuration saved to: $encrypted_file"
}

# Decrypt sensitive values
decrypt_config() {
    local environment="$1"
    local encrypted_file="$CONFIG_DIR/environments/${environment}.env.encrypted"
    local key_file="${KEY_FILE:-$CONFIG_DIR/keys/${environment}.key}"
    local output_file="$CONFIG_DIR/environments/${environment}.env.decrypted"
    
    if [[ ! -f "$encrypted_file" ]]; then
        log_error "Encrypted file not found: $encrypted_file"
        return 1
    fi
    
    if [[ ! -f "$key_file" ]]; then
        log_error "Key file not found: $key_file"
        return 1
    fi
    
    cp "$encrypted_file" "$output_file"
    
    # Decrypt ENC: prefixed values
    while IFS= read -r line; do
        if [[ "$line" =~ ^([^=]+)=ENC:(.+)$ ]]; then
            local var_name="${BASH_REMATCH[1]}"
            local encrypted_value="${BASH_REMATCH[2]}"
            local decrypted_value=$(echo -n "$encrypted_value" | openssl enc -aes-256-cbc -d -base64 -pass file:"$key_file")
            sed -i "s|^${var_name}=ENC:.*|${var_name}=${decrypted_value}|" "$output_file"
            log_info "Decrypted variable: $var_name"
        fi
    done < "$encrypted_file"
    
    log_success "Decrypted configuration saved to: $output_file"
    log_warning "Remember to delete the decrypted file after use for security"
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
    
    # Check dependencies
    check_dependencies
    
    # Execute command
    case "$COMMAND" in
        deploy)
            if [[ -z "${ENVIRONMENT:-}" ]]; then
                log_error "Environment not specified for deploy command"
                exit 1
            fi
            validate_environment "$ENVIRONMENT"
            deploy_config "$ENVIRONMENT"
            ;;
        validate)
            if [[ -z "${ENVIRONMENT:-}" ]]; then
                log_error "Environment not specified for validate command"
                exit 1
            fi
            validate_environment "$ENVIRONMENT"
            env_file="${ENV_FILE:-$CONFIG_DIR/environments/${ENVIRONMENT}.env}"
            validate_config "$env_file"
            ;;
        backup)
            if [[ -z "${ENVIRONMENT:-}" ]]; then
                log_error "Environment not specified for backup command"
                exit 1
            fi
            validate_environment "$ENVIRONMENT"
            backup_config "$ENVIRONMENT"
            ;;
        restore)
            if [[ -z "${ENVIRONMENT:-}" ]]; then
                log_error "Environment not specified for restore command"
                exit 1
            fi
            validate_environment "$ENVIRONMENT"
            restore_config "$ENVIRONMENT"
            ;;
        diff)
            if [[ -z "${ENVIRONMENT:-}" ]]; then
                log_error "Two environments required for diff command"
                exit 1
            fi
            # Get second environment from remaining args
            if [[ $# -eq 0 ]]; then
                log_error "Second environment not specified for diff command"
                exit 1
            fi
            ENV2="$1"
            validate_environment "$ENVIRONMENT"
            validate_environment "$ENV2"
            diff_config "$ENVIRONMENT" "$ENV2"
            ;;
        template)
            generate_template
            ;;
        encrypt)
            if [[ -z "${ENVIRONMENT:-}" ]]; then
                log_error "Environment not specified for encrypt command"
                exit 1
            fi
            validate_environment "$ENVIRONMENT"
            encrypt_config "$ENVIRONMENT"
            ;;
        decrypt)
            if [[ -z "${ENVIRONMENT:-}" ]]; then
                log_error "Environment not specified for decrypt command"
                exit 1
            fi
            validate_environment "$ENVIRONMENT"
            decrypt_config "$ENVIRONMENT"
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