#!/bin/bash

# Zapin WhatsApp SaaS Platform - VPS Deployment Script
# This script automates the deployment process for VPS environments

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="zapin-enterprise"
DOCKER_COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env.production"

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

check_requirements() {
    log_info "Checking system requirements..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if Git is installed
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed. Please install Git first."
        exit 1
    fi
    
    log_success "All requirements are met."
}

setup_environment() {
    log_info "Setting up environment..."
    
    if [ ! -f "$ENV_FILE" ]; then
        if [ -f ".env.example" ]; then
            log_info "Creating $ENV_FILE from .env.example..."
            cp .env.example "$ENV_FILE"
            log_warning "Please edit $ENV_FILE with your production values before continuing."
            read -p "Press Enter to continue after editing the environment file..."
        else
            log_error "No .env.example file found. Please create $ENV_FILE manually."
            exit 1
        fi
    fi
    
    # Validate required environment variables
    source "$ENV_FILE"
    
    required_vars=(
        "DATABASE_URL"
        "REDIS_URL"
        "JWT_SECRET"
        "EVOLUTION_API_BASE_URL"
        "EVOLUTION_GLOBAL_API_KEY"
    )
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            log_error "Required environment variable $var is not set in $ENV_FILE"
            exit 1
        fi
    done
    
    log_success "Environment configuration validated."
}

create_directories() {
    log_info "Creating necessary directories..."
    
    directories=(
        "logs"
        "logs/nginx"
        "backups"
        "ssl"
        "monitoring/grafana/dashboards"
        "monitoring/grafana/datasources"
    )
    
    for dir in "${directories[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            log_info "Created directory: $dir"
        fi
    done
    
    log_success "Directories created successfully."
}

setup_monitoring() {
    log_info "Setting up monitoring configuration..."
    
    # Create Prometheus configuration
    cat > monitoring/prometheus.yml << EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  # - "first_rules.yml"
  # - "second_rules.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'zapin-api'
    static_configs:
      - targets: ['zapin-app:3001']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter:9121']
EOF

    # Create Grafana datasource configuration
    cat > monitoring/grafana/datasources/prometheus.yml << EOF
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
EOF

    # Create Loki configuration
    cat > monitoring/loki.yml << EOF
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
    final_sleep: 0s
  chunk_idle_period: 1h
  max_chunk_age: 1h
  chunk_target_size: 1048576
  chunk_retain_period: 30s
  max_transfer_retries: 0

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /loki/boltdb-shipper-active
    cache_location: /loki/boltdb-shipper-cache
    cache_ttl: 24h
    shared_store: filesystem
  filesystem:
    directory: /loki/chunks

limits_config:
  reject_old_samples: true
  reject_old_samples_max_age: 168h

chunk_store_config:
  max_look_back_period: 0s

table_manager:
  retention_deletes_enabled: false
  retention_period: 0s

ruler:
  storage:
    type: local
    local:
      directory: /loki/rules
  rule_path: /loki/rules-temp
  alertmanager_url: http://localhost:9093
  ring:
    kvstore:
      store: inmemory
  enable_api: true
EOF

    # Create Promtail configuration
    cat > monitoring/promtail.yml << EOF
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: zapin-logs
    static_configs:
      - targets:
          - localhost
        labels:
          job: zapin-app
          __path__: /var/log/zapin/*.log

  - job_name: nginx-logs
    static_configs:
      - targets:
          - localhost
        labels:
          job: nginx
          __path__: /var/log/nginx/*.log

  - job_name: system-logs
    static_configs:
      - targets:
          - localhost
        labels:
          job: system
          __path__: /var/log/host/*.log
EOF

    log_success "Monitoring configuration created."
}

build_application() {
    log_info "Building application..."
    
    # Pull latest changes if this is a git repository
    if [ -d ".git" ]; then
        log_info "Pulling latest changes from git..."
        git pull origin main || log_warning "Failed to pull latest changes. Continuing with current code."
    fi
    
    # Build Docker images
    log_info "Building Docker images..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" build --no-cache
    
    log_success "Application built successfully."
}

deploy_application() {
    log_info "Deploying application..."
    
    # Stop existing containers
    log_info "Stopping existing containers..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" down || true
    
    # Start new containers
    log_info "Starting new containers..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 30
    
    # Check if services are running
    if docker-compose -f "$DOCKER_COMPOSE_FILE" ps | grep -q "Up"; then
        log_success "Services are running."
    else
        log_error "Some services failed to start. Check logs with: docker-compose logs"
        exit 1
    fi
}

setup_database() {
    log_info "Setting up database..."
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 10
    
    # Run database migrations
    log_info "Running database migrations..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T zapin-app npm run db:migrate:deploy
    
    # Seed database (optional)
    read -p "Do you want to seed the database with sample data? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Seeding database..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T zapin-app npm run db:seed
    fi
    
    log_success "Database setup completed."
}

setup_ssl() {
    log_info "Setting up SSL certificates..."
    
    read -p "Do you want to setup SSL with Let's Encrypt? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your domain name: " domain
        
        if [ -n "$domain" ]; then
            log_info "Setting up SSL for domain: $domain"
            
            # Install certbot if not already installed
            if ! command -v certbot &> /dev/null; then
                log_info "Installing certbot..."
                sudo apt update
                sudo apt install -y certbot python3-certbot-nginx
            fi
            
            # Generate SSL certificate
            sudo certbot --nginx -d "$domain" --non-interactive --agree-tos --email admin@"$domain"
            
            # Setup auto-renewal
            (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
            
            log_success "SSL certificate setup completed."
        else
            log_warning "No domain provided. Skipping SSL setup."
        fi
    else
        log_info "Skipping SSL setup."
    fi
}

health_check() {
    log_info "Performing health checks..."
    
    # Check application health
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        log_success "API health check passed."
    else
        log_error "API health check failed."
        return 1
    fi
    
    # Check frontend
    if curl -f http://localhost:3000 > /dev/null 2>&1; then
        log_success "Frontend health check passed."
    else
        log_error "Frontend health check failed."
        return 1
    fi
    
    # Check database
    if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_isready -U zapin > /dev/null 2>&1; then
        log_success "Database health check passed."
    else
        log_error "Database health check failed."
        return 1
    fi
    
    # Check Redis
    if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T redis redis-cli ping > /dev/null 2>&1; then
        log_success "Redis health check passed."
    else
        log_error "Redis health check failed."
        return 1
    fi
    
    log_success "All health checks passed."
}

show_deployment_info() {
    log_success "Deployment completed successfully!"
    echo
    echo "🚀 Zapin WhatsApp SaaS Platform is now running!"
    echo
    echo "📊 Access URLs:"
    echo "   Frontend:    http://localhost:3000"
    echo "   API:         http://localhost:3001"
    echo "   API Docs:    http://localhost:3001/docs"
    echo "   Grafana:     http://localhost:3002"
    echo "   Prometheus:  http://localhost:9090"
    echo
    echo "🔧 Management Commands:"
    echo "   View logs:           docker-compose logs -f"
    echo "   Stop services:       docker-compose down"
    echo "   Restart services:    docker-compose restart"
    echo "   Update application:  ./scripts/deploy.sh"
    echo
    echo "📋 Default Credentials:"
    echo "   Admin Email:    admin@zapin.tech"
    echo "   Admin Password: admin123"
    echo "   Demo Email:     demo@zapin.tech"
    echo "   Demo Password:  demo123"
    echo "   Demo API Key:   zap_demo_key_12345678901234567890"
    echo
    echo "⚠️  Remember to:"
    echo "   1. Change default passwords"
    echo "   2. Configure your Evolution API settings"
    echo "   3. Setup SSL certificates for production"
    echo "   4. Configure backup strategy"
    echo
}

# Main deployment process
main() {
    echo "🚀 Starting Zapin WhatsApp SaaS Platform Deployment"
    echo "=================================================="
    
    check_requirements
    setup_environment
    create_directories
    setup_monitoring
    build_application
    deploy_application
    setup_database
    setup_ssl
    
    if health_check; then
        show_deployment_info
    else
        log_error "Deployment completed but health checks failed. Please check the logs."
        exit 1
    fi
}

# Handle script arguments
case "${1:-}" in
    "health")
        health_check
        ;;
    "logs")
        docker-compose -f "$DOCKER_COMPOSE_FILE" logs -f "${2:-}"
        ;;
    "stop")
        docker-compose -f "$DOCKER_COMPOSE_FILE" down
        ;;
    "restart")
        docker-compose -f "$DOCKER_COMPOSE_FILE" restart "${2:-}"
        ;;
    "backup")
        ./scripts/backup.sh
        ;;
    *)
        main
        ;;
esac