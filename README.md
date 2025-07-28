# Zapin WhatsApp SaaS Platform

A comprehensive, production-ready multi-tenant WhatsApp SaaS platform built with Next.js, Fastify, Prisma, and Evolution API integration.

## 🚀 Features

- **Multi-tenant Architecture**: Complete tenant isolation with role-based access control
- **WhatsApp Integration**: Full Evolution API integration for WhatsApp messaging
- **Real-time Communication**: WebSocket support for live messaging
- **Comprehensive Testing**: Unit, integration, E2E, performance, and security tests
- **Production Ready**: Docker containers, CI/CD pipelines, monitoring, and disaster recovery
- **Scalable Infrastructure**: Load balancing, caching, and horizontal scaling support
- **Security First**: Authentication, authorization, rate limiting, and security hardening
- **Monitoring & Observability**: Prometheus metrics, health checks, and alerting
- **Backup & Recovery**: Automated backups with disaster recovery procedures

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Monitoring](#monitoring)
- [Backup & Recovery](#backup--recovery)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)
- [License](#license)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- PostgreSQL 15+
- Redis 7+
- Docker and Docker Compose
- Evolution API instance

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/zapin-whatsapp-saas.git
   cd zapin-whatsapp-saas
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up database**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. **Start development servers**
   ```bash
   npm run dev
   ```

6. **Access the application**
   - Frontend: http://localhost:3000
   - API: http://localhost:3001
   - Health Check: http://localhost:3001/api/health

## 🏗️ Architecture

### System Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   Web Frontend  │    │   API Backend   │
│     (Nginx)     │────│    (Next.js)    │────│   (Fastify)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                       ┌─────────────────┐             │
                       │   Evolution API │             │
                       │   (WhatsApp)    │─────────────┤
                       └─────────────────┘             │
                                                        │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │      Redis      │    │   File Storage  │
│   (Database)    │────│     (Cache)     │────│      (S3)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Key Components

- **Frontend**: Next.js with TypeScript, Tailwind CSS
- **Backend**: Fastify API with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis for session and data caching
- **Queue**: Redis-based job queue for background tasks
- **Storage**: AWS S3 for file storage
- **Monitoring**: Prometheus + Grafana stack
- **Logging**: Winston with structured logging

## 📦 Installation

### Docker Installation (Recommended)

1. **Development Environment**
   ```bash
   docker-compose -f docker-compose.development.yml up -d
   ```

2. **Production Environment**
   ```bash
   docker-compose -f docker-compose.production.yml up -d
   ```

### Manual Installation

1. **System Dependencies**
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install nodejs npm postgresql redis-server nginx

   # CentOS/RHEL
   sudo yum install nodejs npm postgresql redis nginx
   ```

2. **Application Setup**
   ```bash
   npm install
   npm run build
   npm run db:migrate
   ```

3. **Service Configuration**
   ```bash
   # Copy service files
   sudo cp config/systemd/*.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable zapin-api zapin-app
   sudo systemctl start zapin-api zapin-app
   ```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Application
NODE_ENV=production
APP_URL=https://zapin.app
API_URL=https://api.zapin.app

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/zapin

# Redis
REDIS_URL=redis://localhost:6379

# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-api-key

# Security
JWT_SECRET=your-jwt-secret-32-chars-minimum
ENCRYPTION_KEY=your-encryption-key-32-chars-long

# External Services
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_S3_BUCKET=your-s3-bucket
```

### Configuration Management

Use the configuration deployment script for environment-specific settings:

```bash
# Deploy development configuration
./scripts/config-deploy.sh deploy development

# Deploy production configuration
./scripts/config-deploy.sh deploy production --backup

# Validate configuration
./scripts/config-deploy.sh validate production
```

## 🛠️ Development

### Project Structure

```
zapin-whatsapp-saas/
├── src/                    # Source code
│   ├── api/               # API routes and middleware
│   ├── components/        # React components
│   ├── lib/              # Shared libraries
│   ├── pages/            # Next.js pages
│   ├── services/         # Business logic services
│   └── types/            # TypeScript type definitions
├── tests/                 # Test files
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   ├── e2e/              # End-to-end tests
│   ├── performance/      # Performance tests
│   └── security/         # Security tests
├── scripts/              # Deployment and utility scripts
├── config/               # Configuration files
├── docs/                 # Documentation
└── prisma/               # Database schema and migrations
```

### Development Commands

```bash
# Development
npm run dev              # Start development servers
npm run build           # Build for production
npm run start           # Start production servers

# Database
npm run db:generate     # Generate Prisma client
npm run db:migrate      # Run database migrations
npm run db:seed         # Seed database with test data
npm run db:studio       # Open Prisma Studio

# Testing
npm run test            # Run all tests
npm run test:unit       # Run unit tests
npm run test:integration # Run integration tests
npm run test:e2e        # Run end-to-end tests
npm run test:performance # Run performance tests
npm run test:security   # Run security tests

# Code Quality
npm run lint            # Run ESLint
npm run format          # Format code with Prettier
npm run type-check      # TypeScript type checking
```

### Development Workflow

1. **Feature Development**
   ```bash
   git checkout -b feature/new-feature
   npm run dev
   # Make changes
   npm run test
   npm run lint
   git commit -m "feat: add new feature"
   git push origin feature/new-feature
   ```

2. **Code Review Process**
   - Create pull request
   - Automated CI/CD checks run
   - Code review by team members
   - Merge after approval

## 🧪 Testing

### Test Strategy

The project includes comprehensive testing at multiple levels:

- **Unit Tests**: Test individual functions and components
- **Integration Tests**: Test API endpoints and service interactions
- **End-to-End Tests**: Test complete user workflows
- **Performance Tests**: Load testing and performance benchmarks
- **Security Tests**: Vulnerability assessment and security testing

### Running Tests

```bash
# Run all tests
npm run test

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:performance
npm run test:security

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Test Configuration

Tests are configured using Jest and Playwright:

- **Jest**: Unit and integration tests
- **Playwright**: End-to-end tests
- **Artillery**: Performance tests
- **Custom**: Security tests

## 🚀 Deployment

### VPS Deployment

Use the automated deployment scripts:

```bash
# Initial server setup
./scripts/setup-environment.sh --environment production

# Deploy application
./scripts/deploy.sh --environment production

# SSL setup
./scripts/ssl-setup.sh --domain zapin.app --email admin@zapin.app
```

### Docker Deployment

```bash
# Build production image
docker build -f Dockerfile.production -t zapin-api .

# Deploy with Docker Compose
docker-compose -f docker-compose.production.yml up -d

# Check deployment
docker-compose -f docker-compose.production.yml ps
```

### CI/CD Pipeline

The project includes GitHub Actions workflows for:

- **Continuous Integration**: Automated testing and code quality checks
- **Security Scanning**: Dependency and container vulnerability scanning
- **Automated Deployment**: Deploy to staging and production environments
- **Release Management**: Automated releases with semantic versioning

### Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] SSL certificates installed
- [ ] Monitoring configured
- [ ] Backup systems active
- [ ] Health checks passing
- [ ] Performance tests passed
- [ ] Security scans completed

## 📊 Monitoring

### Health Checks

The application provides comprehensive health checks:

```bash
# Application health
curl https://api.zapin.app/health

# Database health
curl https://api.zapin.app/health/database

# Redis health
curl https://api.zapin.app/health/redis

# Evolution API health
curl https://api.zapin.app/health/evolution
```

### Metrics and Monitoring

- **Prometheus**: Metrics collection
- **Grafana**: Visualization and dashboards
- **AlertManager**: Alert routing and management
- **Custom Metrics**: Application-specific metrics

### Logging

Structured logging with Winston:

```bash
# View logs
tail -f logs/combined.log

# View error logs
tail -f logs/error.log

# View access logs
tail -f /var/log/nginx/access.log
```

### Alerting

Configure alerts for:

- High error rates
- Performance degradation
- Resource exhaustion
- Security incidents
- Service unavailability

## 💾 Backup & Recovery

### Automated Backups

```bash
# Full system backup
./scripts/backup-system.sh full --encrypt --s3

# Database backup
./scripts/backup-system.sh database

# Files backup
./scripts/backup-system.sh files

# Configuration backup
./scripts/backup-system.sh config
```

### Backup Schedule

Set up automated backups:

```bash
# Install backup scheduler
./scripts/backup-scheduler.sh install --enable-s3 --enable-encryption

# Check backup status
./scripts/backup-scheduler.sh status

# Monitor backups
./scripts/backup-scheduler.sh monitor
```

### Recovery Procedures

```bash
# Interactive recovery wizard
./scripts/recovery-system.sh interactive

# Full system recovery
./scripts/recovery-system.sh full --backup backup_name

# Database recovery
./scripts/recovery-system.sh database --backup db_backup_name
```

### Disaster Recovery

For complete disaster recovery procedures, see [Disaster Recovery Plan](docs/disaster-recovery-plan.md).

```bash
# Check DR status
./scripts/disaster-recovery.sh status

# Execute failover
./scripts/disaster-recovery.sh failover --scenario server-failure

# Validate DR readiness
./scripts/disaster-recovery.sh validate
```

## 📚 API Documentation

### Authentication

All API endpoints require authentication using JWT tokens:

```bash
# Login
curl -X POST https://api.zapin.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'

# Use token
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://api.zapin.app/instances
```

### Core Endpoints

#### Instances Management
- `GET /api/instances` - List WhatsApp instances
- `POST /api/instances` - Create new instance
- `GET /api/instances/:id` - Get instance details
- `PUT /api/instances/:id` - Update instance
- `DELETE /api/instances/:id` - Delete instance

#### Messaging
- `POST /api/instances/:id/messages` - Send message
- `GET /api/instances/:id/messages` - Get message history
- `POST /api/instances/:id/media` - Send media message

#### Webhooks
- `POST /api/webhooks/evolution` - Evolution API webhook
- `GET /api/webhooks/status` - Webhook status

For complete API documentation, see [API Guide](docs/zapin-send-message-api-guide.md).

## 🔧 Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check database status
sudo systemctl status postgresql

# Check connection
psql -h localhost -U zapin_user -d zapin -c "SELECT 1;"

# View database logs
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

#### Redis Connection Issues
```bash
# Check Redis status
sudo systemctl status redis

# Test connection
redis-cli ping

# View Redis logs
sudo tail -f /var/log/redis/redis-server.log
```

#### Application Issues
```bash
# Check application logs
tail -f logs/combined.log

# Check process status
pm2 status

# Restart services
sudo systemctl restart zapin-api zapin-app
```

### Performance Issues

```bash
# Check system resources
htop
df -h
free -h

# Check database performance
./scripts/db-management.sh analyze

# Run performance tests
npm run test:performance
```

### Security Issues

```bash
# Run security scan
npm run test:security

# Check for vulnerabilities
npm audit

# Update dependencies
npm update
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup for Contributors

1. Fork the repository
2. Clone your fork
3. Create a feature branch
4. Make your changes
5. Add tests for your changes
6. Ensure all tests pass
7. Submit a pull request

### Code Standards

- Follow TypeScript best practices
- Write comprehensive tests
- Use conventional commit messages
- Update documentation as needed
- Ensure security best practices

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/your-org/zapin-whatsapp-saas/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/zapin-whatsapp-saas/discussions)
- **Email**: support@zapin.app

## 🙏 Acknowledgments

- [Evolution API](https://github.com/EvolutionAPI/evolution-api) for WhatsApp integration
- [Next.js](https://nextjs.org/) for the frontend framework
- [Fastify](https://www.fastify.io/) for the backend framework
- [Prisma](https://www.prisma.io/) for database management
- All contributors and the open-source community

---

**Built with ❤️ by the Zapin Team**

For more detailed information, please refer to the documentation in the `docs/` directory.