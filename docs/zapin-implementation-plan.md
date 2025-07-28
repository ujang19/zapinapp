# Zapin WhatsApp SaaS Platform - Complete Implementation Plan

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Development Phases](#development-phases)
5. [Technical Specifications](#technical-specifications)
6. [Setup Instructions](#setup-instructions)
7. [Development Workflow](#development-workflow)
8. [Deployment Strategy](#deployment-strategy)
9. [Team Structure](#team-structure)
10. [Timeline & Milestones](#timeline--milestones)

---

## Project Overview

**Zapin** adalah platform SaaS multi-tenant untuk manajemen WhatsApp yang komprehensif, dibangun dengan arsitektur modern dan scalable menggunakan next-enterprise boilerplate untuk frontend dan Fastify untuk backend.

### 🎯 **Core Objectives**
- Menyediakan platform lengkap untuk WhatsApp management
- Wrapper API yang identik dengan Evolution API dengan quota control
- Dashboard UI yang user-friendly untuk non-technical users
- Bot management system (Typebot & OpenAI)
- Multi-tenant architecture dengan billing system
- Production-ready dengan monitoring dan observability

---

## Technology Stack

### 🎨 **Frontend (next-enterprise)**
```json
{
  "framework": "Next.js 15 (App Directory)",
  "styling": "Tailwind CSS v4",
  "ui_components": "Radix UI + CVA",
  "state_management": "Zustand + React Query",
  "authentication": "Better Auth",
  "forms": "React Hook Form + Zod",
  "testing": "Jest + React Testing Library + Playwright",
  "documentation": "Storybook",
  "bundler": "Turbopack",
  "package_manager": "pnpm",
  "deployment": "Vercel + Custom AWS Infrastructure"
}
```

### ⚡ **Backend (Fastify)**
```json
{
  "framework": "Fastify + TypeScript",
  "database": "PostgreSQL + Prisma ORM",
  "cache": "Redis",
  "queue": "Bull MQ",
  "authentication": "JWT + API Keys",
  "validation": "Zod",
  "monitoring": "Prometheus + Grafana + Sentry",
  "logging": "Winston + Axiom",
  "testing": "Jest + Supertest",
  "deployment": "Docker + Kubernetes"
}
```

### 🗄️ **Infrastructure**
```json
{
  "cloud_provider": "AWS",
  "container_orchestration": "Kubernetes (EKS)",
  "database": "RDS PostgreSQL",
  "cache": "ElastiCache Redis",
  "cdn": "CloudFront",
  "load_balancer": "Application Load Balancer",
  "monitoring": "CloudWatch + Prometheus",
  "ci_cd": "GitHub Actions",
  "iac": "Terraform"
}
```

---

## Project Structure

### 📁 **Monorepo Structure**
```
zapin-platform/
├── apps/
│   ├── dashboard/              # Next.js frontend (next-enterprise)
│   ├── api/                   # Fastify backend
│   └── docs/                  # Documentation site
├── packages/
│   ├── ui/                    # Shared UI components
│   ├── types/                 # Shared TypeScript types
│   ├── config/                # Shared configurations
│   └── utils/                 # Shared utilities
├── infrastructure/
│   ├── terraform/             # Infrastructure as Code
│   ├── kubernetes/            # K8s manifests
│   └── docker/               # Docker configurations
├── docs/                      # Project documentation
└── tools/                     # Development tools
```

### 🎨 **Frontend Structure (next-enterprise based)**
```
apps/dashboard/
├── src/
│   ├── app/                   # Next.js 15 App Directory
│   │   ├── (auth)/           # Authentication pages
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── dashboard/        # Main dashboard
│   │   │   ├── page.tsx
│   │   │   └── loading.tsx
│   │   ├── instances/        # WhatsApp instance management
│   │   │   ├── page.tsx
│   │   │   ├── [id]/
│   │   │   └── create/
│   │   ├── bots/            # Bot management
│   │   │   ├── page.tsx
│   │   │   ├── typebot/
│   │   │   └── openai/
│   │   ├── analytics/       # Usage analytics
│   │   ├── billing/         # Billing & subscription
│   │   ├── api-keys/        # API key management
│   │   ├── settings/        # Account settings
│   │   └── api/            # API routes
│   ├── components/
│   │   ├── ui/             # Radix UI + CVA components
│   │   ├── dashboard/      # Dashboard components
│   │   ├── instances/      # Instance components
│   │   ├── bots/          # Bot components
│   │   ├── forms/         # Form components
│   │   └── charts/        # Analytics charts
│   ├── lib/
│   │   ├── auth.ts        # Better Auth config
│   │   ├── api.ts         # API client
│   │   ├── utils.ts       # Utilities
│   │   ├── validations.ts # Zod schemas
│   │   └── constants.ts   # Constants
│   ├── hooks/             # Custom React hooks
│   ├── stores/            # Zustand stores
│   ├── types/             # TypeScript types
│   └── styles/            # Global styles
├── tests/                 # Test files
├── stories/               # Storybook stories
└── public/               # Static assets
```

### ⚡ **Backend Structure**
```
apps/api/
├── src/
│   ├── routes/
│   │   ├── auth/          # Authentication routes
│   │   ├── instances/     # Instance management
│   │   ├── bots/         # Bot management
│   │   ├── analytics/    # Analytics endpoints
│   │   ├── billing/      # Billing endpoints
│   │   ├── webhooks/     # Webhook handlers
│   │   └── v1/          # Public API (Evolution proxy)
│   ├── services/
│   │   ├── instanceService.ts
│   │   ├── botService.ts
│   │   ├── quotaService.ts
│   │   ├── evolutionService.ts
│   │   ├── webhookService.ts
│   │   └── billingService.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── quota.ts
│   │   ├── validation.ts
│   │   └── proxy.ts
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── redis.ts
│   │   ├── queue.ts
│   │   ├── monitoring.ts
│   │   └── evolution.ts
│   ├── types/
│   └── utils/
├── prisma/               # Database schema
├── tests/               # Test files
└── docker/             # Docker configs
```

---

## Development Phases

### 🚀 **Phase 1: Foundation Setup (Week 1-2)**

#### **Frontend Setup**
```bash
# 1. Initialize next-enterprise
npx create-next-app@latest zapin-dashboard --example https://github.com/Blazity/next-enterprise

# 2. Customize for Zapin
cd zapin-dashboard
pnpm install

# 3. Setup additional dependencies
pnpm add @tanstack/react-query zustand @hookform/resolvers zod
pnpm add @radix-ui/react-dialog @radix-ui/react-dropdown-menu
pnpm add recharts lucide-react date-fns
pnpm add -D @types/node
```

#### **Backend Setup**
```bash
# 1. Initialize Fastify project
mkdir zapin-api && cd zapin-api
npm init -y
npm install fastify @fastify/cors @fastify/helmet @fastify/rate-limit
npm install prisma @prisma/client redis ioredis
npm install jsonwebtoken bcryptjs zod
npm install winston prometheus-client @sentry/node
npm install -D typescript @types/node ts-node nodemon jest supertest
```

#### **Database Setup**
```sql
-- Initialize PostgreSQL with Prisma
npx prisma init
npx prisma migrate dev --name init
npx prisma generate
```

### 🏗️ **Phase 2: Core Backend Development (Week 3-6)**

#### **Week 3: Authentication & Database**
- [ ] Setup Prisma schema untuk multi-tenant
- [ ] Implement JWT authentication system
- [ ] Create API key management
- [ ] Setup Redis untuk caching dan sessions
- [ ] Implement user registration/login

#### **Week 4: Instance Management**
- [ ] Evolution API client implementation
- [ ] Instance creation dan management
- [ ] QR code handling untuk WhatsApp connection
- [ ] Webhook system untuk real-time updates
- [ ] Instance monitoring dan health checks

#### **Week 5: Quota & Billing System**
- [ ] Quota management dengan Redis
- [ ] Plan-based feature access control
- [ ] Usage tracking dan analytics
- [ ] Billing calculation system
- [ ] Payment integration (Stripe/local payment)

#### **Week 6: Public API Wrapper**
- [ ] Universal proxy untuk Evolution API
- [ ] Request/response transformation
- [ ] Rate limiting per tenant
- [ ] API documentation generation
- [ ] Error handling dan logging

### 🎨 **Phase 3: Frontend Development (Week 7-10)**

#### **Week 7: Authentication & Layout**
```typescript
// Setup Better Auth
// apps/dashboard/src/lib/auth.ts
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24 // 1 day
  }
})
```

- [ ] Setup Better Auth integration
- [ ] Create authentication pages (login/register)
- [ ] Implement dashboard layout dengan sidebar
- [ ] Setup navigation dan routing
- [ ] Create responsive design system

#### **Week 8: Instance Management UI**
```typescript
// Instance management components
// apps/dashboard/src/components/instances/InstanceCard.tsx
export function InstanceCard({ instance }: { instance: Instance }) {
  const [qrCode, setQrCode] = useState<string | null>(null)
  
  return (
    <Card className="p-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{instance.name}</CardTitle>
          <Badge variant={instance.status === 'connected' ? 'success' : 'destructive'}>
            {instance.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Instance details */}
      </CardContent>
      <CardFooter>
        <Button onClick={() => handleConnect(instance.id)}>
          {instance.status === 'connected' ? 'Manage' : 'Connect'}
        </Button>
      </CardFooter>
    </Card>
  )
}
```

- [ ] Instance list dan grid view
- [ ] Instance creation wizard
- [ ] QR code modal untuk connection
- [ ] Instance settings management
- [ ] Real-time status updates

#### **Week 9: Bot Management UI**
- [ ] Bot creation forms (Typebot & OpenAI)
- [ ] Bot configuration interface
- [ ] Bot analytics dashboard
- [ ] Session management
- [ ] Bot testing interface

#### **Week 10: Analytics & Billing UI**
- [ ] Usage analytics charts
- [ ] Quota monitoring dashboard
- [ ] Billing history dan invoices
- [ ] Plan upgrade/downgrade
- [ ] API key management interface

### 🤖 **Phase 4: Bot Integration (Week 11-12)**

#### **Week 11: Typebot Integration**
```typescript
// Bot service implementation
export class BotService {
  async createTypebot(params: CreateTypebotParams) {
    // Validate instance ownership
    const instance = await this.validateInstance(params.tenantId, params.instanceId)
    
    // Create in Evolution API
    const response = await this.evolutionApi.createTypebot(
      instance.evolutionKey,
      instance.evolutionInstanceId,
      {
        enabled: true,
        url: params.typebotUrl,
        typebot: params.typebotId,
        triggerType: params.triggerType,
        triggerValue: params.triggerValue
      }
    )
    
    // Store in database
    return prisma.bot.create({
      data: {
        tenantId: params.tenantId,
        instanceId: params.instanceId,
        type: 'typebot',
        evolutionBotId: response.typebotId,
        config: params.config
      }
    })
  }
}
```

- [ ] Typebot creation dan configuration
- [ ] Flow testing interface
- [ ] Session monitoring
- [ ] Analytics integration

#### **Week 12: OpenAI Integration**
- [ ] OpenAI bot creation
- [ ] Model selection dan configuration
- [ ] Prompt engineering interface
- [ ] Cost tracking untuk OpenAI usage
- [ ] Conversation analytics

### 🚀 **Phase 5: Testing & Optimization (Week 13-14)**

#### **Week 13: Testing Implementation**
```typescript
// Frontend testing
// apps/dashboard/tests/components/InstanceCard.test.tsx
import { render, screen } from '@testing-library/react'
import { InstanceCard } from '@/components/instances/InstanceCard'

describe('InstanceCard', () => {
  it('renders instance information correctly', () => {
    const mockInstance = {
      id: '1',
      name: 'Test Instance',
      status: 'connected',
      phoneNumber: '+1234567890'
    }
    
    render(<InstanceCard instance={mockInstance} />)
    
    expect(screen.getByText('Test Instance')).toBeInTheDocument()
    expect(screen.getByText('connected')).toBeInTheDocument()
  })
})
```

- [ ] Unit tests untuk semua components
- [ ] Integration tests untuk API endpoints
- [ ] E2E tests dengan Playwright
- [ ] Performance testing
- [ ] Security testing

#### **Week 14: Performance Optimization**
- [ ] Bundle size optimization
- [ ] Database query optimization
- [ ] Caching strategy implementation
- [ ] CDN setup untuk static assets
- [ ] Load testing dan optimization

### 🌐 **Phase 6: Deployment & DevOps (Week 15-16)**

#### **Week 15: Infrastructure Setup**
```yaml
# infrastructure/terraform/main.tf
provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source = "./modules/vpc"
  
  cidr_block = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b"]
}

module "eks" {
  source = "./modules/eks"
  
  cluster_name = "zapin-cluster"
  vpc_id = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
}

module "rds" {
  source = "./modules/rds"
  
  engine = "postgres"
  engine_version = "15.4"
  instance_class = "db.t3.medium"
  vpc_id = module.vpc.vpc_id
}
```

- [ ] AWS infrastructure dengan Terraform
- [ ] Kubernetes cluster setup
- [ ] Database dan Redis setup
- [ ] Load balancer dan CDN configuration
- [ ] SSL certificates dan domain setup

#### **Week 16: CI/CD Pipeline**
```yaml
# .github/workflows/deploy.yml
name: Deploy Zapin Platform

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Run tests
        run: pnpm test
      
      - name: Build applications
        run: pnpm build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Kubernetes
        run: |
          kubectl apply -f infrastructure/kubernetes/
          kubectl rollout status deployment/zapin-api
          kubectl rollout status deployment/zapin-dashboard
```

- [ ] GitHub Actions workflow setup
- [ ] Docker image building dan pushing
- [ ] Kubernetes deployment automation
- [ ] Environment-specific configurations
- [ ] Monitoring dan alerting setup

---

## Technical Specifications

### 🔐 **Authentication System**

```typescript
// Authentication middleware
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization
  
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing authorization header' })
  }

  const token = authHeader.slice(7)
  
  try {
    // Try JWT first
    const jwtPayload = await verifyJWT(token)
    if (jwtPayload) {
      const user = await prisma.user.findUnique({
        where: { id: jwtPayload.userId },
        include: { tenant: true }
      })
      
      if (user?.tenant) {
        request.user = user
        request.tenant = user.tenant
        return
      }
    }
  } catch (error) {
    // Try API key
    const apiKey = await prisma.apiKey.findUnique({
      where: { key: token, isActive: true },
      include: { tenant: true }
    })
    
    if (apiKey && (!apiKey.expiresAt || apiKey.expiresAt > new Date())) {
      request.tenant = apiKey.tenant
      request.apiKey = apiKey
      return
    }
  }
  
  return reply.code(401).send({ error: 'Invalid authentication' })
}
```

### 📊 **Quota Management System**

```typescript
// Quota service with Redis
export class QuotaService {
  private redis: Redis
  
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL)
  }
  
  async checkQuota(tenantId: string, endpoint: string): Promise<QuotaResult> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    })
    
    const plan = PLANS[tenant.plan]
    const key = `quota:${tenantId}:${this.getQuotaType(endpoint)}`
    
    const current = await this.redis.get(key) || 0
    const limit = plan[this.getQuotaType(endpoint)]
    
    return {
      allowed: current < limit,
      current: parseInt(current),
      limit,
      resetTime: await this.getResetTime(key)
    }
  }
  
  async consumeQuota(tenantId: string, endpoint: string): Promise<void> {
    const key = `quota:${tenantId}:${this.getQuotaType(endpoint)}`
    
    await this.redis.multi()
      .incr(key)
      .expire(key, this.getExpiration(endpoint))
      .exec()
  }
}
```

### 🤖 **Bot Management System**

```typescript
// Universal bot service
export class BotService {
  async createBot(params: CreateBotParams): Promise<Bot> {
    const instance = await this.validateInstance(params.tenantId, params.instanceId)
    
    let evolutionResponse
    
    switch (params.type) {
      case 'typebot':
        evolutionResponse = await this.evolutionApi.createTypebot(
          instance.evolutionKey,
          instance.evolutionInstanceId,
          params.config
        )
        break
        
      case 'openai':
        // First create credentials
        const creds = await this.evolutionApi.setOpenAICreds(
          instance.evolutionKey,
          instance.evolutionInstanceId,
          { apiKey: params.config.apiKey }
        )
        
        evolutionResponse = await this.evolutionApi.createOpenAIBot(
          instance.evolutionKey,
          instance.evolutionInstanceId,
          { ...params.config, openaiCredsId: creds.id }
        )
        break
    }
    
    return prisma.bot.create({
      data: {
        tenantId: params.tenantId,
        instanceId: params.instanceId,
        type: params.type,
        evolutionBotId: evolutionResponse.id,
        config: params.config,
        isActive: true
      }
    })
  }
}
```

---

## Setup Instructions

### 🚀 **Quick Start**

```bash
# 1. Clone repository
git clone https://github.com/your-org/zapin-platform.git
cd zapin-platform

# 2. Install dependencies
pnpm install

# 3. Setup environment variables
cp .env.example .env.local
# Edit .env.local with your configurations

# 4. Setup database
cd apps/api
npx prisma migrate dev
npx prisma generate
npx prisma db seed

# 5. Start development servers
cd ../..
pnpm dev

# Frontend: http://localhost:3000
# Backend: http://localhost:3001
# Storybook: http://localhost:6006
```

### 🔧 **Environment Variables**

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/zapin"
REDIS_URL="redis://localhost:6379"

# Authentication
JWT_SECRET="your-super-secret-jwt-key-32-chars-min"
NEXTAUTH_SECRET="your-nextauth-secret"
NEXTAUTH_URL="http://localhost:3000"

# Evolution API
EVOLUTION_API_BASE_URL="https://core.zapin.tech/v2"
EVOLUTION_GLOBAL_API_KEY="your-evolution-global-key"

# External Services
SENTRY_DSN="your-sentry-dsn"
STRIPE_SECRET_KEY="your-stripe-secret"
OPENAI_API_KEY="your-openai-key"

# Monitoring
PROMETHEUS_ENDPOINT="http://localhost:9090"
GRAFANA_URL="http://localhost:3001"
```

---

## Development Workflow

### 🔄 **Git Workflow**

```bash
# Feature development
git checkout -b feature/instance-management
git add .
git commit -m "feat: add instance creation functionality"
git push origin feature/instance-management

# Create PR → Review → Merge to main
# Automatic deployment to staging
# Manual promotion to production
```

### 🧪 **Testing Strategy**

```bash
# Run all tests
pnpm test

# Frontend tests
pnpm test:frontend

# Backend tests
pnpm test:backend

# E2E tests
pnpm test:e2e

# Performance tests
pnpm test:performance
```

### 📦 **Build & Deployment**

```bash
# Build all applications
pnpm build

# Build specific app
pnpm build:dashboard
pnpm build:api

# Deploy to staging
pnpm deploy:staging

# Deploy to production
pnpm deploy:production
```

---

## Deployment Strategy

### 🌐 **Multi-Environment Setup**

```yaml
# Development
- Local development dengan Docker Compose
- Hot reload untuk rapid development
- Local database dan Redis

# Staging
- AWS EKS cluster
- RDS PostgreSQL
- ElastiCache Redis
- CloudFront CDN
- Automatic deployment dari main branch

# Production
- AWS EKS cluster dengan multi-AZ
- RDS PostgreSQL dengan read replicas
- ElastiCache Redis cluster
- CloudFront dengan custom domain
- Manual deployment dengan approval
```

### 🔒 **Security Considerations**

```typescript
// Security middleware
app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
})

app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
})

app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
})
```

---

## Team Structure

### 👥 **Recommended Team**

```
Project Manager (1)
├── Frontend Team (2-3)
│   ├── Senior React Developer (Next.js expert)
│   ├── UI/UX Developer (Design system)
│   └── Frontend Developer (Components)
├── Backend Team (2-3)
│   ├── Senior Node.js Developer (Fastify expert)
│   ├── Backend Developer (API development)
│   └── Database Developer (PostgreSQL/Redis)
├── DevOps Engineer (1)
│   ├── AWS Infrastructure
│   ├── Kubernetes management
│   └── CI/CD pipeline
└── QA Engineer (1)
    ├── Test automation
    ├── Performance testing
    └── Security testing
```

### 📋 **Responsibilities**

- **Frontend Team**: Dashboard UI, component library, user experience
- **Backend Team**: API development, database design, integration
- **DevOps**: Infrastructure, deployment, monitoring
- **QA**: Testing strategy, automation, quality assurance

---

## Timeline & Milestones

### 📅 **16-Week Development Plan**

```mermaid
gantt
    title Zapin Platform Development Timeline
    dateFormat  YYYY-MM-DD
    section Foundation
    Project Setup           :done, setup, 2024-01-01, 2w
    
    section Backend Core
    Auth & Database        :active, auth, after setup, 1w
    Instance Management    :instance, after auth, 1w
    Quota & Billing       :quota, after instance, 1w
    Public API Wrapper    :api, after quota, 1w
    
    section Frontend Core
    Auth & Layout         :ui-auth, after api, 1w
    Instance UI           :ui-instance, after ui-auth, 1w
    Bot Management UI     :ui-bot, after ui-instance, 1w
    Analytics UI          :ui-analytics, after ui-bot, 1w
    
    section Integration
    Bot Integration       :bots, after ui-analytics, 2w
    
    section Quality
    Testing & Optimization :testing, after bots, 2w
    
    section Deployment
    Infrastructure & CI/CD :deploy, after testing, 2w
```

### 🎯 **Key Milestones**

- **Week 2**: ✅ Foundation setup complete
- **Week 6**: ✅ Backend core functionality complete
- **Week 10**: ✅ Frontend dashboard complete
- **Week 12**: ✅ Bot integration complete
- **Week 14**: ✅ Testing and optimization complete
- **Week 16**: 🚀 **Production deployment ready**

### 📊 **Success Metrics**

- **Performance**: < 2s page load time, 99.9% uptime
- **Quality**: > 90% test coverage, < 1% error rate
- **User Experience**: < 5s instance connection time
- **Scalability**: Support 1000+ concurrent users
- **Security**: Zero critical vulnerabilities

---

## Conclusion

Plan implementasi ini memberikan roadmap lengkap untuk membangun platform Zapin yang production-ready dalam 16 minggu. Dengan menggunakan next-enterprise sebagai foundation frontend dan arsitektur backend yang scalable, platform ini akan mampu menangani kebutuhan enterprise dengan performa dan reliability yang tinggi.

**Key Success Factors:**
- Menggunakan proven technologies dan best practices
- Implementasi testing yang comprehensive
- Infrastructure yang scalable dan secure
- Team yang experienced dengan clear responsibilities
- Monitoring dan observability yang proper

Platform ini akan menjadi solusi WhatsApp management yang komprehensif dengan kemampuan multi-tenant, bot integration, dan API wrapper yang lengkap.