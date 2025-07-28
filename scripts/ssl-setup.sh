#!/bin/bash

# Zapin WhatsApp SaaS Platform - SSL Setup Script
# This script handles SSL certificate management with Let's Encrypt

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NGINX_CONF_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
SSL_DIR="/etc/letsencrypt/live"
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

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

install_certbot() {
    log_info "Installing Certbot..."
    
    # Update package list
    apt update
    
    # Install Certbot and Nginx plugin
    apt install -y certbot python3-certbot-nginx
    
    log_success "Certbot installed successfully."
}

validate_domain() {
    local domain="$1"
    
    if [ -z "$domain" ]; then
        log_error "Domain name is required"
        return 1
    fi
    
    # Basic domain validation
    if [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
        log_error "Invalid domain name format: $domain"
        return 1
    fi
    
    # Check if domain resolves to this server
    log_info "Checking DNS resolution for $domain..."
    SERVER_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || curl -s icanhazip.com)
    DOMAIN_IP=$(dig +short "$domain" | tail -n1)
    
    if [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
        log_warning "Domain $domain does not resolve to this server IP ($SERVER_IP)"
        log_warning "Domain resolves to: $DOMAIN_IP"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "SSL setup cancelled."
            exit 0
        fi
    else
        log_success "Domain $domain correctly resolves to this server."
    fi
}

create_nginx_config() {
    local domain="$1"
    local config_file="$NGINX_CONF_DIR/zapin-$domain"
    
    log_info "Creating Nginx configuration for $domain..."
    
    # Create initial HTTP configuration for Let's Encrypt validation
    cat > "$config_file" << EOF
server {
    listen 80;
    server_name $domain www.$domain;
    
    # Let's Encrypt validation
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Redirect all other traffic to HTTPS (will be enabled after SSL setup)
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# HTTPS configuration (will be updated after SSL certificate generation)
server {
    listen 443 ssl http2;
    server_name $domain www.$domain;
    
    # SSL configuration (placeholder)
    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin";
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss: https:;";
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \$binary_remote_addr zone=login:10m rate=1r/s;
    
    # Frontend (Next.js)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # API endpoints
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # WebSocket support
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://127.0.0.1:3001/health;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
    }
    
    # Security.txt
    location /.well-known/security.txt {
        return 200 "Contact: security@$domain\nExpires: 2025-12-31T23:59:59.000Z\nPreferred-Languages: en\n";
        add_header Content-Type text/plain;
    }
}
EOF
    
    # Enable the site
    ln -sf "$config_file" "$NGINX_ENABLED_DIR/"
    
    log_success "Nginx configuration created for $domain."
}

obtain_ssl_certificate() {
    local domain="$1"
    local email="$2"
    
    log_info "Obtaining SSL certificate for $domain..."
    
    # Create webroot directory
    mkdir -p /var/www/html
    
    # Test Nginx configuration
    nginx -t
    if [ $? -ne 0 ]; then
        log_error "Nginx configuration test failed"
        exit 1
    fi
    
    # Reload Nginx
    systemctl reload nginx
    
    # Obtain certificate
    if [ -n "$email" ]; then
        certbot certonly \
            --webroot \
            --webroot-path=/var/www/html \
            --email "$email" \
            --agree-tos \
            --no-eff-email \
            --domains "$domain,www.$domain"
    else
        certbot certonly \
            --webroot \
            --webroot-path=/var/www/html \
            --register-unsafely-without-email \
            --agree-tos \
            --domains "$domain,www.$domain"
    fi
    
    if [ $? -eq 0 ]; then
        log_success "SSL certificate obtained successfully for $domain."
        return 0
    else
        log_error "Failed to obtain SSL certificate for $domain."
        return 1
    fi
}

update_nginx_ssl_config() {
    local domain="$1"
    local config_file="$NGINX_CONF_DIR/zapin-$domain"
    
    log_info "Updating Nginx configuration with SSL certificate..."
    
    # Update SSL certificate paths
    sed -i "s|ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;|ssl_certificate /etc/letsencrypt/live/$domain/fullchain.pem;|" "$config_file"
    sed -i "s|ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;|ssl_certificate_key /etc/letsencrypt/live/$domain/privkey.pem;|" "$config_file"
    
    # Add SSL optimization
    sed -i "/ssl_certificate_key/a\\
\\
    # SSL optimization\\
    ssl_protocols TLSv1.2 TLSv1.3;\\
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;\\
    ssl_prefer_server_ciphers off;\\
    ssl_session_cache shared:SSL:10m;\\
    ssl_session_timeout 10m;\\
    ssl_stapling on;\\
    ssl_stapling_verify on;\\
    resolver 8.8.8.8 8.8.4.4 valid=300s;\\
    resolver_timeout 5s;" "$config_file"
    
    # Test and reload Nginx
    nginx -t
    if [ $? -eq 0 ]; then
        systemctl reload nginx
        log_success "Nginx configuration updated with SSL certificate."
    else
        log_error "Nginx configuration test failed after SSL update."
        return 1
    fi
}

setup_auto_renewal() {
    log_info "Setting up automatic SSL certificate renewal..."
    
    # Create renewal script
    cat > /usr/local/bin/certbot-renew.sh << 'EOF'
#!/bin/bash

# Renew certificates
/usr/bin/certbot renew --quiet

# Reload Nginx if certificates were renewed
if [ $? -eq 0 ]; then
    /bin/systemctl reload nginx
fi
EOF
    
    chmod +x /usr/local/bin/certbot-renew.sh
    
    # Add cron job for automatic renewal (twice daily)
    (crontab -l 2>/dev/null; echo "0 */12 * * * /usr/local/bin/certbot-renew.sh") | crontab -
    
    log_success "Automatic SSL certificate renewal configured."
}

test_ssl_configuration() {
    local domain="$1"
    
    log_info "Testing SSL configuration for $domain..."
    
    # Test HTTPS connection
    if curl -s -I "https://$domain" | grep -q "HTTP/2 200"; then
        log_success "HTTPS connection test passed."
    else
        log_warning "HTTPS connection test failed or returned non-200 status."
    fi
    
    # Test SSL certificate
    if openssl s_client -connect "$domain:443" -servername "$domain" </dev/null 2>/dev/null | openssl x509 -noout -dates; then
        log_success "SSL certificate is valid."
    else
        log_warning "SSL certificate validation failed."
    fi
    
    # Test HTTP to HTTPS redirect
    if curl -s -I "http://$domain" | grep -q "301"; then
        log_success "HTTP to HTTPS redirect is working."
    else
        log_warning "HTTP to HTTPS redirect test failed."
    fi
}

renew_certificates() {
    log_info "Renewing SSL certificates..."
    
    # Dry run first
    log_info "Performing dry run..."
    certbot renew --dry-run
    
    if [ $? -eq 0 ]; then
        log_success "Dry run successful. Proceeding with actual renewal..."
        
        # Actual renewal
        certbot renew
        
        if [ $? -eq 0 ]; then
            # Reload Nginx
            systemctl reload nginx
            log_success "SSL certificates renewed successfully."
        else
            log_error "SSL certificate renewal failed."
            return 1
        fi
    else
        log_error "Dry run failed. Please check your configuration."
        return 1
    fi
}

revoke_certificate() {
    local domain="$1"
    
    if [ -z "$domain" ]; then
        log_error "Domain name is required for certificate revocation"
        exit 1
    fi
    
    log_warning "This will revoke the SSL certificate for $domain!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Certificate revocation cancelled."
        exit 0
    fi
    
    log_info "Revoking SSL certificate for $domain..."
    
    # Revoke certificate
    certbot revoke --cert-path "/etc/letsencrypt/live/$domain/cert.pem"
    
    # Delete certificate files
    certbot delete --cert-name "$domain"
    
    # Remove Nginx configuration
    rm -f "$NGINX_CONF_DIR/zapin-$domain"
    rm -f "$NGINX_ENABLED_DIR/zapin-$domain"
    
    # Reload Nginx
    systemctl reload nginx
    
    log_success "SSL certificate revoked for $domain."
}

list_certificates() {
    log_info "Listing SSL certificates..."
    
    certbot certificates
}

show_certificate_info() {
    local domain="$1"
    
    if [ -z "$domain" ]; then
        log_error "Domain name is required"
        exit 1
    fi
    
    log_info "Certificate information for $domain:"
    echo "======================================"
    
    if [ -f "/etc/letsencrypt/live/$domain/cert.pem" ]; then
        openssl x509 -in "/etc/letsencrypt/live/$domain/cert.pem" -text -noout | grep -E "(Subject:|Issuer:|Not Before:|Not After:|DNS:)"
    else
        log_error "Certificate not found for $domain"
    fi
}

setup_ssl_monitoring() {
    log_info "Setting up SSL certificate monitoring..."
    
    # Create monitoring script
    cat > /usr/local/bin/ssl-monitor.sh << 'EOF'
#!/bin/bash

# SSL Certificate Monitoring Script
ALERT_DAYS=30
LOG_FILE="/var/log/ssl-monitor.log"

echo "$(date): Starting SSL certificate check" >> "$LOG_FILE"

for cert_dir in /etc/letsencrypt/live/*/; do
    if [ -d "$cert_dir" ]; then
        domain=$(basename "$cert_dir")
        cert_file="$cert_dir/cert.pem"
        
        if [ -f "$cert_file" ]; then
            # Get certificate expiration date
            exp_date=$(openssl x509 -in "$cert_file" -noout -enddate | cut -d= -f2)
            exp_epoch=$(date -d "$exp_date" +%s)
            current_epoch=$(date +%s)
            days_until_exp=$(( (exp_epoch - current_epoch) / 86400 ))
            
            echo "$(date): $domain expires in $days_until_exp days" >> "$LOG_FILE"
            
            if [ $days_until_exp -le $ALERT_DAYS ]; then
                echo "$(date): WARNING: Certificate for $domain expires in $days_until_exp days!" >> "$LOG_FILE"
                # You can add email notification here
            fi
        fi
    fi
done

echo "$(date): SSL certificate check completed" >> "$LOG_FILE"
EOF
    
    chmod +x /usr/local/bin/ssl-monitor.sh
    
    # Add daily monitoring cron job
    (crontab -l 2>/dev/null; echo "0 9 * * * /usr/local/bin/ssl-monitor.sh") | crontab -
    
    log_success "SSL certificate monitoring configured."
}

show_help() {
    echo "Zapin SSL Setup Script"
    echo "====================="
    echo
    echo "Usage: $0 <command> [options]"
    echo
    echo "Commands:"
    echo "  setup <domain> [email]    Setup SSL certificate for domain"
    echo "  renew                     Renew all SSL certificates"
    echo "  revoke <domain>           Revoke SSL certificate for domain"
    echo "  list                      List all SSL certificates"
    echo "  info <domain>             Show certificate information"
    echo "  test <domain>             Test SSL configuration"
    echo "  monitor                   Setup SSL certificate monitoring"
    echo "  help                      Show this help message"
    echo
    echo "Examples:"
    echo "  $0 setup example.com admin@example.com"
    echo "  $0 renew"
    echo "  $0 test example.com"
    echo
}

# Main script logic
case "${1:-}" in
    "setup")
        check_root
        domain="$2"
        email="$3"
        
        if [ -z "$domain" ]; then
            log_error "Domain name is required"
            show_help
            exit 1
        fi
        
        validate_domain "$domain"
        install_certbot
        create_nginx_config "$domain"
        
        if obtain_ssl_certificate "$domain" "$email"; then
            update_nginx_ssl_config "$domain"
            setup_auto_renewal
            test_ssl_configuration "$domain"
            setup_ssl_monitoring
            log_success "SSL setup completed successfully for $domain!"
        else
            log_error "SSL setup failed for $domain"
            exit 1
        fi
        ;;
    "renew")
        check_root
        renew_certificates
        ;;
    "revoke")
        check_root
        revoke_certificate "$2"
        ;;
    "list")
        list_certificates
        ;;
    "info")
        show_certificate_info "$2"
        ;;
    "test")
        test_ssl_configuration "$2"
        ;;
    "monitor")
        check_root
        setup_ssl_monitoring
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