#!/bin/bash

# Zapin WhatsApp SaaS Platform - VPS Environment Setup Script
# This script sets up the initial VPS environment with security hardening

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_VERSION="24.0"
DOCKER_COMPOSE_VERSION="2.21.0"
NODE_VERSION="18"

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

update_system() {
    log_info "Updating system packages..."
    apt update && apt upgrade -y
    apt install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release
    log_success "System updated successfully."
}

setup_firewall() {
    log_info "Setting up UFW firewall..."
    
    # Install UFW if not present
    apt install -y ufw
    
    # Reset UFW to defaults
    ufw --force reset
    
    # Default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH (adjust port if needed)
    ufw allow 22/tcp
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Allow application ports
    ufw allow 3000/tcp  # Frontend
    ufw allow 3001/tcp  # API
    ufw allow 3002/tcp  # Grafana
    ufw allow 9090/tcp  # Prometheus
    
    # Allow database ports (restrict to local network if needed)
    ufw allow from 172.20.0.0/16 to any port 5432  # PostgreSQL
    ufw allow from 172.20.0.0/16 to any port 6379  # Redis
    
    # Enable firewall
    ufw --force enable
    
    log_success "Firewall configured successfully."
}

install_docker() {
    log_info "Installing Docker..."
    
    # Remove old versions
    apt remove -y docker docker-engine docker.io containerd runc || true
    
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Start and enable Docker
    systemctl start docker
    systemctl enable docker
    
    # Add current user to docker group (if not root)
    if [ "$SUDO_USER" ]; then
        usermod -aG docker "$SUDO_USER"
        log_info "Added $SUDO_USER to docker group. Please log out and back in for changes to take effect."
    fi
    
    log_success "Docker installed successfully."
}

install_docker_compose() {
    log_info "Installing Docker Compose..."
    
    # Install Docker Compose
    curl -L "https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    # Create symlink for compatibility
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
    
    log_success "Docker Compose installed successfully."
}

install_nodejs() {
    log_info "Installing Node.js..."
    
    # Install NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    
    # Install Node.js
    apt install -y nodejs
    
    # Install global packages
    npm install -g pm2 pnpm
    
    log_success "Node.js installed successfully."
}

setup_monitoring_tools() {
    log_info "Installing monitoring tools..."
    
    # Install system monitoring tools
    apt install -y htop iotop nethogs ncdu tree jq
    
    # Install log rotation
    apt install -y logrotate
    
    # Configure log rotation for application logs
    cat > /etc/logrotate.d/zapin << EOF
/var/log/zapin/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 www-data www-data
    postrotate
        docker-compose -f /opt/zapin-enterprise/docker-compose.yml restart zapin-app > /dev/null 2>&1 || true
    endscript
}
EOF
    
    log_success "Monitoring tools installed successfully."
}

setup_ssl_tools() {
    log_info "Installing SSL tools..."
    
    # Install Certbot for Let's Encrypt
    apt install -y certbot python3-certbot-nginx
    
    log_success "SSL tools installed successfully."
}

configure_system_limits() {
    log_info "Configuring system limits..."
    
    # Increase file descriptor limits
    cat >> /etc/security/limits.conf << EOF

# Zapin application limits
* soft nofile 65536
* hard nofile 65536
* soft nproc 32768
* hard nproc 32768
EOF
    
    # Configure kernel parameters
    cat >> /etc/sysctl.conf << EOF

# Zapin system optimizations
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_intvl = 60
net.ipv4.tcp_keepalive_probes = 10
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
EOF
    
    # Apply sysctl changes
    sysctl -p
    
    log_success "System limits configured successfully."
}

setup_backup_directory() {
    log_info "Setting up backup directories..."
    
    # Create backup directories
    mkdir -p /opt/zapin-backups/{database,files,configs}
    
    # Set proper permissions
    chown -R www-data:www-data /opt/zapin-backups
    chmod -R 755 /opt/zapin-backups
    
    log_success "Backup directories created successfully."
}

setup_application_directory() {
    log_info "Setting up application directory..."
    
    # Create application directory
    mkdir -p /opt/zapin-enterprise
    
    # Set proper permissions
    if [ "$SUDO_USER" ]; then
        chown -R "$SUDO_USER:$SUDO_USER" /opt/zapin-enterprise
    fi
    
    log_success "Application directory created successfully."
}

configure_fail2ban() {
    log_info "Installing and configuring Fail2Ban..."
    
    # Install Fail2Ban
    apt install -y fail2ban
    
    # Create custom configuration
    cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 10

[nginx-botsearch]
enabled = true
filter = nginx-botsearch
port = http,https
logpath = /var/log/nginx/access.log
maxretry = 2
EOF
    
    # Start and enable Fail2Ban
    systemctl start fail2ban
    systemctl enable fail2ban
    
    log_success "Fail2Ban configured successfully."
}

setup_automatic_updates() {
    log_info "Setting up automatic security updates..."
    
    # Install unattended-upgrades
    apt install -y unattended-upgrades apt-listchanges
    
    # Configure automatic updates
    cat > /etc/apt/apt.conf.d/50unattended-upgrades << EOF
Unattended-Upgrade::Allowed-Origins {
    "\${distro_id}:\${distro_codename}";
    "\${distro_id}:\${distro_codename}-security";
    "\${distro_id}ESMApps:\${distro_codename}-apps-security";
    "\${distro_id}ESM:\${distro_codename}-infra-security";
};

Unattended-Upgrade::Package-Blacklist {
    // "vim";
    // "libc6-dev";
    // "libc6-i686";
};

Unattended-Upgrade::DevRelease "auto";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Automatic-Reboot-WithUsers "false";
Unattended-Upgrade::Automatic-Reboot-Time "02:00";
EOF
    
    # Enable automatic updates
    cat > /etc/apt/apt.conf.d/20auto-upgrades << EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF
    
    log_success "Automatic updates configured successfully."
}

create_system_user() {
    log_info "Creating system user for application..."
    
    # Create zapin user if it doesn't exist
    if ! id "zapin" &>/dev/null; then
        useradd -r -s /bin/false -d /opt/zapin-enterprise zapin
        log_success "Created zapin system user."
    else
        log_info "Zapin user already exists."
    fi
}

setup_log_directories() {
    log_info "Setting up log directories..."
    
    # Create log directories
    mkdir -p /var/log/zapin
    mkdir -p /var/log/nginx
    
    # Set proper permissions
    chown -R www-data:www-data /var/log/zapin
    chmod -R 755 /var/log/zapin
    
    log_success "Log directories created successfully."
}

display_summary() {
    log_success "VPS Environment Setup Completed!"
    echo
    echo "🔧 Installed Components:"
    echo "   ✅ Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
    echo "   ✅ Docker Compose $(docker-compose --version | cut -d' ' -f4 | tr -d ',')"
    echo "   ✅ Node.js $(node --version)"
    echo "   ✅ NPM $(npm --version)"
    echo "   ✅ UFW Firewall"
    echo "   ✅ Fail2Ban"
    echo "   ✅ Certbot (Let's Encrypt)"
    echo "   ✅ System Monitoring Tools"
    echo "   ✅ Automatic Security Updates"
    echo
    echo "🔒 Security Features:"
    echo "   ✅ Firewall configured with essential ports"
    echo "   ✅ Fail2Ban protection against brute force"
    echo "   ✅ System limits optimized"
    echo "   ✅ Automatic security updates enabled"
    echo
    echo "📁 Created Directories:"
    echo "   ✅ /opt/zapin-enterprise (application)"
    echo "   ✅ /opt/zapin-backups (backups)"
    echo "   ✅ /var/log/zapin (logs)"
    echo
    echo "⚠️  Next Steps:"
    echo "   1. Clone your application to /opt/zapin-enterprise"
    echo "   2. Configure environment variables"
    echo "   3. Run the deployment script"
    echo "   4. Setup SSL certificates"
    echo
    if [ "$SUDO_USER" ]; then
        echo "🔄 Please log out and back in for Docker group changes to take effect."
    fi
}

# Main setup process
main() {
    echo "🔧 Starting VPS Environment Setup for Zapin WhatsApp SaaS Platform"
    echo "=================================================================="
    
    check_root
    update_system
    setup_firewall
    install_docker
    install_docker_compose
    install_nodejs
    setup_monitoring_tools
    setup_ssl_tools
    configure_system_limits
    setup_backup_directory
    setup_application_directory
    configure_fail2ban
    setup_automatic_updates
    create_system_user
    setup_log_directories
    
    display_summary
}

# Handle script arguments
case "${1:-}" in
    "firewall")
        setup_firewall
        ;;
    "docker")
        install_docker
        install_docker_compose
        ;;
    "monitoring")
        setup_monitoring_tools
        ;;
    "ssl")
        setup_ssl_tools
        ;;
    "security")
        configure_fail2ban
        setup_automatic_updates
        ;;
    *)
        main
        ;;
esac