# Zapin WhatsApp SaaS - Deployment Guide

This comprehensive guide covers all aspects of deploying the Zapin WhatsApp SaaS platform to production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Application Deployment](#application-deployment)
6. [Web Server Configuration](#web-server-configuration)
7. [SSL/TLS Setup](#ssltls-setup)
8. [Monitoring Setup](#monitoring-setup)
9. [Backup Configuration](#backup-configuration)
10. [Security Hardening](#security-hardening)
11. [Performance Optimization](#performance-optimization)
12. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

#### Minimum Requirements
- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 50GB SSD
- **Network**: 100 Mbps
- **OS**: Ubuntu 20.04+ or CentOS 8+

#### Recommended Requirements
- **CPU**: 4+ cores
- **RAM**: 8GB+
- **Storage**: 100GB+ SSD
- **Network**: 1 Gbps
- **OS**: Ubuntu 22.04 LTS

#### High Availability Setup
- **Load Balancer**: 2+ instances
- **Application Servers**: 3+ instances
- **Database**: Primary + 2 replicas
- **Cache**: Redis cluster (3+ nodes)

### Software Dependencies

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y \
    nodejs \
    npm \
    postgresql-15 \
    redis-server \
    nginx \
    docker.io \
    docker-compose \
    git \
    curl \
    wget \
    unzip \
    htop \
    ufw

# CentOS/RHEL
sudo yum update
sudo yum install -y \
    nodejs \
    npm \
    postgresql15-server \
    redis \
    nginx \
    docker \
    docker-compose \
    git \
    curl \
    wget \
    unzip \
    htop \
    firewalld
```

### External Services

- **Evolution API**: WhatsApp integration service
- **AWS S3**: File storage (or compatible service)
- **SMTP Service**: Email notifications
- **DNS Provider**: Domain management
- **SSL Certificate**: Let's Encrypt or commercial

## Infrastructure Setup

### Single Server Deployment

For small to medium deployments, a single server can host all components:

```bash
# Clone the repository
git clone https://github.com/your-org/zapin-whatsapp-saas.git
cd zapin-whatsapp-saas

# Run automated setup
sudo ./scripts/setup-environment.sh --environment production --single-server
```

### Multi-Server Deployment

For high availability and scalability:

#### Load Balancer Setup
```bash
# Server 1: Load Balancer
sudo ./scripts/setup-environment.sh --role load-balancer --environment production

# Configure Nginx for load balancing
sudo ./scripts/nginx-deploy.sh deploy production
```

#### Application Servers Setup
```bash
# Servers 2-4: Application Servers
sudo ./scripts/setup-environment.sh --role app-server --environment production

# Deploy application
./scripts/deploy.sh --environment production --role app-server
```

#### Database Server Setup
```bash
# Server 5: Database Primary
sudo ./scripts/setup-environment.sh --role database-primary --environment production

# Server 6-7: Database Replicas
sudo ./scripts/setup-environment.sh --role database-replica --environment production
```

### Docker Deployment

#### Single Container Deployment
```bash
# Build production image
docker build -f Dockerfile.production -t zapin-api:latest .

# Run with Docker Compose
docker-compose -f docker-compose.production.yml up -d
```

#### Kubernetes Deployment
```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

## Environment Configuration

### Configuration Files

Create environment-specific configuration files:

```bash
# Copy template
cp config/environments/production.env.template config/environments/production.env

# Edit configuration
nano config/environments/production.env
```

### Required Environment Variables

```bash
# Application
NODE_ENV=production
APP_NAME=Zapin WhatsApp SaaS
APP_URL=https://zapin.app
API_URL=https://api.zapin.app
PORT=3000
API_PORT=3001

# Security (Generate secure values)
JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 32)

# Database
DATABASE_URL=postgresql://zapin_user:secure_password@localhost:5432/zapin_prod
DATABASE_POOL_SIZE=20
DATABASE_SSL=true

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=secure_redis_password

# Evolution API
EVOLUTION_API_URL=https://evolution.zapin.app
EVOLUTION_API_KEY=your_evolution_api_key

# AWS S3
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_S3_BUCKET=zapin-production-files
AWS_REGION=us-east-1

# Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
EMAIL_FROM=noreply@zapin.app

# Monitoring
METRICS_ENABLED=true
SENTRY_DSN=your_sentry_dsn
```

### Deploy Configuration

```bash
# Deploy production configuration
./scripts/config-deploy.sh deploy production --backup --encrypt

# Validate configuration
./scripts/config-deploy.sh validate production
```

## Database Setup

### PostgreSQL Installation and Configuration

#### Install PostgreSQL
```bash
# Ubuntu
sudo apt install postgresql-15 postgresql-contrib

# Start and enable service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Create Database and User
```bash
# Switch to postgres user
sudo -u postgres psql

-- Create database and user
CREATE DATABASE zapin_prod;
CREATE USER zapin_user WITH ENCRYPTED PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE zapin_prod TO zapin_user;
ALTER USER zapin_user CREATEDB;

-- Exit psql
\q
```

#### Configure PostgreSQL
```bash
# Edit postgresql.conf
sudo nano /etc/postgresql/15/main/postgresql.conf

# Key settings for production
listen_addresses = '*'
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100

# Edit pg_hba.conf for security
sudo nano /etc/postgresql/15/main/pg_hba.conf

# Add secure connection rules
host    zapin_prod    zapin_user    127.0.0.1/32    md5
host    zapin_prod    zapin_user    ::1/128         md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

#### Run Database Migrations
```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate:deploy

# Seed production data (optional)
npm run db:seed
```

### Database Replication Setup

#### Primary Server Configuration
```bash
# Edit postgresql.conf
sudo nano /etc/postgresql/15/main/postgresql.conf

# Replication settings
wal_level = replica
max_wal_senders = 3
max_replication_slots = 3
synchronous_commit = on
archive_mode = on
archive_command = 'cp %p /var/lib/postgresql/15/main/archive/%f'

# Create replication user
sudo -u postgres psql
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replication_password';
```

#### Replica Server Configuration
```bash
# Stop PostgreSQL on replica
sudo systemctl stop postgresql

# Remove data directory
sudo rm -rf /var/lib/postgresql/15/main

# Create base backup
sudo -u postgres pg_basebackup -h primary_server_ip -D /var/lib/postgresql/15/main -U replicator -P -v -R -W

# Start PostgreSQL
sudo systemctl start postgresql
```

## Application Deployment

### Manual Deployment

#### Build Application
```bash
# Install dependencies
npm ci --production

# Build application
npm run build

# Generate Prisma client
npm run db:generate
```

#### Create System User
```bash
# Create zapin user
sudo useradd -r -s /bin/false zapin
sudo mkdir -p /opt/zapin
sudo chown zapin:zapin /opt/zapin
```

#### Deploy Application Files
```bash
# Copy application files
sudo cp -r . /opt/zapin/
sudo chown -R zapin:zapin /opt/zapin/

# Set permissions
sudo chmod +x /opt/zapin/scripts/*.sh
```

#### Create Systemd Services
```bash
# Copy service files
sudo cp config/systemd/zapin-api.service /etc/systemd/system/
sudo cp config/systemd/zapin-app.service /etc/systemd/system/

# Reload systemd and start services
sudo systemctl daemon-reload
sudo systemctl enable zapin-api zapin-app
sudo systemctl start zapin-api zapin-app

# Check status
sudo systemctl status zapin-api zapin-app
```

### Automated Deployment

#### Using Deployment Script
```bash
# Full automated deployment
./scripts/deploy.sh --environment production --full-setup

# Application-only deployment
./scripts/deploy.sh --environment production --app-only

# Database-only deployment
./scripts/deploy.sh --environment production --db-only
```

#### Using Docker
```bash
# Deploy with Docker Compose
docker-compose -f docker-compose.production.yml up -d

# Check deployment
docker-compose -f docker-compose.production.yml ps
docker-compose -f docker-compose.production.yml logs
```

## Web Server Configuration

### Nginx Setup

#### Install and Configure Nginx
```bash
# Install Nginx
sudo apt install nginx

# Deploy Nginx configuration
sudo ./scripts/nginx-deploy.sh deploy production

# Test configuration
sudo nginx -t

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

#### Load Balancer Configuration
```bash
# For multi-server setup
sudo ./scripts/nginx-deploy.sh deploy production --load-balancer

# Configure upstream servers
sudo nano /etc/nginx/conf.d/upstream.conf
```

### Apache Setup (Alternative)

#### Install Apache
```bash
# Ubuntu
sudo apt install apache2

# Enable required modules
sudo a2enmod rewrite ssl proxy proxy_http headers
```

#### Configure Virtual Hosts
```bash
# Copy Apache configuration
sudo cp config/apache/zapin.conf /etc/apache2/sites-available/

# Enable site
sudo a2ensite zapin.conf
sudo systemctl reload apache2
```

## SSL/TLS Setup

### Let's Encrypt (Recommended)

#### Install Certbot
```bash
# Ubuntu
sudo apt install certbot python3-certbot-nginx

# CentOS
sudo yum install certbot python3-certbot-nginx
```

#### Obtain SSL Certificate
```bash
# Automated SSL setup
./scripts/ssl-setup.sh --domain zapin.app --email admin@zapin.app

# Manual certificate request
sudo certbot --nginx -d zapin.app -d api.zapin.app -d www.zapin.app
```

#### Auto-renewal Setup
```bash
# Test renewal
sudo certbot renew --dry-run

# Setup auto-renewal (already included in ssl-setup.sh)
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

### Commercial SSL Certificate

#### Install Commercial Certificate
```bash
# Copy certificate files
sudo cp your-domain.crt /etc/ssl/certs/
sudo cp your-domain.key /etc/ssl/private/
sudo cp ca-bundle.crt /etc/ssl/certs/

# Set permissions
sudo chmod 644 /etc/ssl/certs/your-domain.crt
sudo chmod 600 /etc/ssl/private/your-domain.key

# Update Nginx configuration
sudo nano /etc/nginx/sites-available/zapin.conf
```

## Monitoring Setup

### Prometheus and Grafana

#### Install Prometheus
```bash
# Create prometheus user
sudo useradd --no-create-home --shell /bin/false prometheus

# Download and install Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.40.0/prometheus-2.40.0.linux-amd64.tar.gz
tar xvf prometheus-2.40.0.linux-amd64.tar.gz
sudo cp prometheus-2.40.0.linux-amd64/prometheus /usr/local/bin/
sudo cp prometheus-2.40.0.linux-amd64/promtool /usr/local/bin/

# Create directories
sudo mkdir /etc/prometheus
sudo mkdir /var/lib/prometheus
sudo chown prometheus:prometheus /etc/prometheus
sudo chown prometheus:prometheus /var/lib/prometheus

# Copy configuration
sudo cp config/prometheus/prometheus.yml /etc/prometheus/
sudo chown prometheus:prometheus /etc/prometheus/prometheus.yml

# Create systemd service
sudo cp config/systemd/prometheus.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable prometheus
sudo systemctl start prometheus
```

#### Install Grafana
```bash
# Add Grafana repository
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
echo "deb https://packages.grafana.com/oss/deb stable main" | sudo tee -a /etc/apt/sources.list.d/grafana.list

# Install Grafana
sudo apt update
sudo apt install grafana

# Start and enable Grafana
sudo systemctl start grafana-server
sudo systemctl enable grafana-server
```

#### Configure Dashboards
```bash
# Import pre-configured dashboards
curl -X POST \
  http://admin:admin@localhost:3000/api/dashboards/db \
  -H 'Content-Type: application/json' \
  -d @config/grafana/dashboards/zapin-overview.json
```

### Application Monitoring

#### Health Checks
```bash
# Configure health check endpoints
curl https://api.zapin.app/health
curl https://api.zapin.app/health/database
curl https://api.zapin.app/health/redis
```

#### Log Monitoring
```bash
# Configure log rotation
sudo cp config/logrotate/zapin /etc/logrotate.d/

# Setup log monitoring with rsyslog
sudo cp config/rsyslog/zapin.conf /etc/rsyslog.d/
sudo systemctl restart rsyslog
```

## Backup Configuration

### Automated Backup Setup

#### Install Backup System
```bash
# Setup backup directories
sudo mkdir -p /opt/backups/zapin
sudo chown zapin:zapin /opt/backups/zapin

# Configure backup system
./scripts/backup-scheduler.sh install --enable-s3 --enable-encryption

# Test backup system
./scripts/backup-system.sh test
```

#### Backup Schedule Configuration
```bash
# Configure backup schedules
./scripts/backup-scheduler.sh install \
  --full-schedule "0 2 * * 0" \
  --db-schedule "0 */6 * * *" \
  --files-schedule "0 4 * * *" \
  --enable-s3 \
  --enable-encryption
```

### S3 Backup Configuration

#### Configure AWS S3
```bash
# Install AWS CLI
sudo apt install awscli

# Configure AWS credentials
aws configure
# AWS Access Key ID: your-access-key
# AWS Secret Access Key: your-secret-key
# Default region name: us-east-1
# Default output format: json

# Test S3 access
aws s3 ls s3://your-backup-bucket
```

#### Backup Encryption
```bash
# Generate encryption key
openssl rand -base64 32 > /opt/zapin/config/backup.key
sudo chmod 600 /opt/zapin/config/backup.key
sudo chown zapin:zapin /opt/zapin/config/backup.key
```

## Security Hardening

### Firewall Configuration

#### UFW (Ubuntu)
```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Allow HTTP/HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Allow application ports (if needed)
sudo ufw allow 3000
sudo ufw allow 3001

# Check status
sudo ufw status
```

#### Firewalld (CentOS)
```bash
# Start and enable firewalld
sudo systemctl start firewalld
sudo systemctl enable firewalld

# Allow services
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https

# Allow custom ports
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=3001/tcp

# Reload firewall
sudo firewall-cmd --reload
```

### SSH Hardening

#### Configure SSH
```bash
# Edit SSH configuration
sudo nano /etc/ssh/sshd_config

# Recommended settings
Port 2222
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2

# Restart SSH
sudo systemctl restart sshd
```

#### Setup SSH Keys
```bash
# Generate SSH key pair (on local machine)
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"

# Copy public key to server
ssh-copy-id -i ~/.ssh/id_rsa.pub -p 2222 user@server-ip
```

### Application Security

#### Security Headers
```bash
# Configure security headers in Nginx
sudo nano /etc/nginx/sites-available/zapin.conf

# Add security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

#### Rate Limiting
```bash
# Configure rate limiting
sudo nano /etc/nginx/nginx.conf

# Add rate limiting zones
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;
```

### Database Security

#### PostgreSQL Security
```bash
# Secure PostgreSQL installation
sudo -u postgres psql

-- Remove default databases
DROP DATABASE IF EXISTS template0;

-- Set secure passwords
ALTER USER postgres PASSWORD 'secure_postgres_password';

-- Limit connections
ALTER SYSTEM SET max_connections = 100;

-- Enable logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 1000;

-- Reload configuration
SELECT pg_reload_conf();
```

## Performance Optimization

### Application Performance

#### Node.js Optimization
```bash
# Set Node.js production environment
export NODE_ENV=production

# Optimize memory usage
export NODE_OPTIONS="--max-old-space-size=2048"

# Enable clustering
export CLUSTER_MODE=true
export CLUSTER_WORKERS=4
```

#### Database Optimization
```bash
# PostgreSQL performance tuning
sudo nano /etc/postgresql/15/main/postgresql.conf

# Memory settings
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB

# Connection settings
max_connections = 200
max_prepared_transactions = 200

# Checkpoint settings
checkpoint_completion_target = 0.9
checkpoint_timeout = 10min

# WAL settings
wal_buffers = 16MB
wal_writer_delay = 200ms

# Query planner settings
random_page_cost = 1.1
effective_io_concurrency = 200
```

#### Redis Optimization
```bash
# Redis performance tuning
sudo nano /etc/redis/redis.conf

# Memory settings
maxmemory 512mb
maxmemory-policy allkeys-lru

# Persistence settings
save 900 1
save 300 10
save 60 10000

# Network settings
tcp-keepalive 300
timeout 0

# Restart Redis
sudo systemctl restart redis
```

### Web Server Optimization

#### Nginx Performance
```bash
# Nginx performance tuning
sudo nano /etc/nginx/nginx.conf

# Worker settings
worker_processes auto;
worker_connections 4096;
worker_rlimit_nofile 65535;

# Buffer settings
client_body_buffer_size 128k;
client_max_body_size 50m;
client_header_buffer_size 1k;
large_client_header_buffers 4 4k;

# Timeout settings
client_body_timeout 12;
client_header_timeout 12;
keepalive_timeout 65;
send_timeout 10;

# Compression
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_comp_level 6;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
```

### System Performance

#### Kernel Optimization
```bash
# System limits
sudo nano /etc/security/limits.conf

# Add limits
* soft nofile 65535
* hard nofile 65535
* soft nproc 65535
* hard nproc 65535

# Kernel parameters
sudo nano /etc/sysctl.conf

# Network settings
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_intvl = 60
net.ipv4.tcp_keepalive_probes = 10

# Memory settings
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5

# Apply settings
sudo sysctl -p
```

## Troubleshooting

### Common Issues

#### Application Won't Start
```bash
# Check logs
sudo journalctl -u zapin-api -f
sudo journalctl -u zapin-app -f

# Check configuration
./scripts/config-deploy.sh validate production

# Check dependencies
npm run type-check
npm run test
```

#### Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
psql -h localhost -U zapin_user -d zapin_prod -c "SELECT 1;"

# Check logs
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

#### High Memory Usage
```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head

# Check for memory leaks
node --inspect app.js

# Optimize memory settings
export NODE_OPTIONS="--max-old-space-size=1024"
```

#### Performance Issues
```bash
# Check system resources
htop
iotop
nethogs

# Database performance
./scripts/db-management.sh analyze
./scripts/db-management.sh optimize

# Run performance tests
npm run test:performance
```

### Log Analysis

#### Application Logs
```bash
# View application logs
tail -f /opt/zapin/logs/combined.log
tail -f /opt/zapin/logs/error.log

# Search for errors
grep -i error /opt/zapin/logs/combined.log
grep -i "database" /opt/zapin/logs/combined.log
```

#### System Logs
```bash
# System logs
sudo journalctl -f
sudo journalctl -u zapin-api -f
sudo journalctl -u nginx -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Health Checks

#### Automated Health Checks
```bash
# Run comprehensive health check
./scripts/health-check.sh --comprehensive

# Check specific components
curl https://api.zapin.app/health
curl https://api.zapin.app/health/database
curl https://api.zapin.app/health/redis
curl https://api.zapin.app/health/evolution
```

#### Manual Verification
```bash
# Test API endpoints
curl -X POST https://api.zapin.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password"}'

# Test WebSocket connection
wscat -c wss://api.zapin.app/ws

# Test file upload
curl -X POST https://api.zapin.app/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test.jpg"
```

## Maintenance

### Regular Maintenance Tasks

#### Daily
- [ ] Check system health
- [ ] Review error logs
- [ ] Verify backup completion
- [ ] Monitor resource usage

#### Weekly
- [ ] Update system packages
- [ ] Analyze database performance
- [ ] Review security logs
- [ ] Test disaster recovery procedures

#### Monthly
- [ ] Update application dependencies
- [ ] Review and rotate logs
- [ ] Performance optimization review
- [ ] Security audit

### Update Procedures

#### Application Updates
```bash
# Backup before update
./scripts/backup-system.sh full --name "pre-update-$(date +%Y%m%d)"

# Deploy new version
./scripts/deploy.sh --environment production --version v1.2.0

# Verify deployment
./scripts/health-check.sh --comprehensive
```

#### System Updates
```bash
# Update system packages
sudo apt update && sudo apt upgrade

# Update Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Update Docker
sudo apt update && sudo apt install docker.io
```

---

This deployment guide provides comprehensive instructions for deploying the Zapin WhatsApp SaaS platform in production environments. For additional support, refer to the troubleshooting section or contact the development team.