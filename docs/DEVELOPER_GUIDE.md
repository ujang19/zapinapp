# ZAPIN ENTERPRISE - DEVELOPER GUIDE

## 📋 TABLE OF CONTENTS

1. [Getting Started](#getting-started)
2. [Development Environment Setup](#development-environment-setup)
3. [Code Structure & Conventions](#code-structure--conventions)
4. [Making Changes](#making-changes)
5. [Testing Guidelines](#testing-guidelines)
6. [Database Operations](#database-operations)
7. [API Development](#api-development)
8. [Frontend Development](#frontend-development)
9. [Debugging & Troubleshooting](#debugging--troubleshooting)
10. [Code Review Process](#code-review-process)
11. [Deployment Process](#deployment-process)
12. [Best Practices](#best-practices)

---

## 🚀 GETTING STARTED

### **Prerequisites**
```bash
# Required software versions
Node.js >= 18.0.0
pnpm >= 8.0.0
Docker >= 20.0.0
Docker Compose >= 2.0.0
Git >= 2.30.0
```

### **Quick Setup**
```bash
# 1. Clone repository
git clone https://github.com/ujang19/zapinapp.git
cd zapinapp

# 2. Install dependencies
pnpm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your configuration

# 4. Start services
docker-compose up -d postgres redis

# 5. Setup database
pnpm prisma generate
pnpm prisma db push
pnpm prisma db seed

# 6. Start development server
pnpm run dev
```

### **Verify Setup**
```bash
# Check if everything is working
curl http://localhost:3000/api/health

# Expected response:
{
  "status": "healthy",
  "services": {
    "database": { "status": "healthy" },
    "redis": { "status": "healthy" }
  }
}
```

---

## 🛠️ DEVELOPMENT ENVIRONMENT SETUP

### **IDE Configuration**

#### **VS Code Extensions (Recommended)**
```json
{
  "recommendations": [
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "prisma.prisma",
    "ms-playwright.playwright",
    "ms-vscode.vscode-json"
  ]
}
```

#### **VS Code Settings**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"],
    ["cx\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ]
}
```

### **Environment Variables**
```bash
# .env.development
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# Database
DATABASE_URL="postgresql://localhost:5432/zapin_dev"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-development-jwt-secret-minimum-32-characters"
JWT_REFRESH_SECRET="your-development-refresh-secret-minimum-32-characters"

# Evolution API
EVOLUTION_API_BASE_URL="https://core.zapin.tech/v2"
EVOLUTION_GLOBAL_API_KEY="yHC2Wulppn9wDp1Qt2JkNF714x3Lj2tY"

# Webhooks
WEBHOOK_BASE_URL="http://localhost:3001"

# Development flags
LOG_LEVEL="debug"
ENABLE_REGISTRATION="true"
ENABLE_BOT_CREATION="true"
```

### **Docker Development Setup**
```yaml
# docker-compose.development.yml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: zapin_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data

  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_dev_data:/data

volumes:
  postgres_dev_data:
  redis_dev_data:
```

---

## 📁 CODE STRUCTURE & CONVENTIONS

### **Project Structure**
```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth pages group
│   ├── dashboard/         # Dashboard pages
│   ├── api/              # API routes (Next.js)
│   ├── globals.css       # Global styles
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Homepage
├── api/                   # Fastify API (separate from Next.js)
│   ├── routes/           # API route handlers
│   ├── middleware/       # API middleware
│   └── index.ts          # API entry point
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── auth/             # Auth-specific components
│   └── dashboard/        # Dashboard components
├── hooks/                 # Custom React hooks
├── lib/                   # Utility libraries
├── services/              # Business logic services
├── types/                 # TypeScript type definitions
└── middleware.ts          # Next.js middleware
```

### **Naming Conventions**

#### **Files & Directories**
```bash
# Components (PascalCase)
UserProfile.tsx
BotManagement.tsx

# Pages (kebab-case)
user-profile/page.tsx
bot-management/page.tsx

# Utilities & Services (camelCase)
authService.ts
databaseUtils.ts

# Types (camelCase with .types.ts suffix)
user.types.ts
api.types.ts

# Constants (UPPER_SNAKE_CASE)
API_CONSTANTS.ts
DATABASE_CONFIG.ts
```

#### **Code Conventions**
```typescript
// Variables & Functions (camelCase)
const userName = 'john'
const getUserProfile = () => {}

// Components (PascalCase)
const UserProfile = () => {}

// Types & Interfaces (PascalCase)
interface UserData {}
type ApiResponse = {}

// Constants (UPPER_SNAKE_CASE)
const API_BASE_URL = 'https://api.example.com'
const MAX_RETRY_ATTEMPTS = 3

// Enums (PascalCase)
enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER'
}
```

---

## ✏️ MAKING CHANGES

### **Before You Start**
```bash
# 1. Create feature branch
git checkout -b feature/add-new-bot-type

# 2. Pull latest changes
git pull origin main

# 3. Install any new dependencies
pnpm install

# 4. Run tests to ensure everything works
pnpm run test
```

### **Development Workflow**

#### **1. Frontend Changes**
```bash
# Start development server
pnpm run dev

# Make your changes in src/app/ or src/components/

# Check TypeScript errors
pnpm run type-check

# Format code
pnpm run format

# Lint code
pnpm run lint
```

#### **2. Backend Changes**
```bash
# API changes in src/api/ or src/services/

# Test API endpoints
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Check logs
tail -f logs/combined.log
```

#### **3. Database Changes**
```bash
# Modify prisma/schema.prisma

# Generate new client
pnpm prisma generate

# Push changes to database
pnpm prisma db push

# Create migration (for production)
pnpm prisma migrate dev --name add-new-field

# Reset database if needed
pnpm prisma migrate reset
```

### **Common Development Tasks**

#### **Adding a New API Endpoint**
```typescript
// 1. Create route handler in src/api/routes/
// src/api/routes/newFeature.ts
import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../middleware/auth'

export default async function newFeatureRoutes(fastify: FastifyInstance) {
  // Add auth middleware
  fastify.addHook('preHandler', authMiddleware)
  
  fastify.get('/new-feature', async (request, reply) => {
    const { tenantId } = request
    
    // Your logic here
    const data = await getNewFeatureData(tenantId)
    
    return {
      success: true,
      data
    }
  })
}

// 2. Register route in src/api/index.ts
import newFeatureRoutes from './routes/newFeature'

app.register(newFeatureRoutes, { prefix: '/api/v1' })

// 3. Add types in src/types/index.ts
export interface NewFeatureData {
  id: string
  name: string
  createdAt: Date
}
```

#### **Adding a New React Component**
```typescript
// 1. Create component file
// src/components/dashboard/NewFeatureCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NewFeatureData } from '@/types'

interface NewFeatureCardProps {
  data: NewFeatureData
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}

export function NewFeatureCard({ data, onEdit, onDelete }: NewFeatureCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{data.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Created: {data.createdAt.toLocaleDateString()}</p>
        <div className="flex gap-2 mt-4">
          {onEdit && (
            <button onClick={() => onEdit(data.id)}>Edit</button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(data.id)}>Delete</button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// 2. Use in page
// src/app/dashboard/new-feature/page.tsx
import { NewFeatureCard } from '@/components/dashboard/NewFeatureCard'

export default function NewFeaturePage() {
  const [features, setFeatures] = useState<NewFeatureData[]>([])
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {features.map(feature => (
        <NewFeatureCard
          key={feature.id}
          data={feature}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      ))}
    </div>
  )
}
```

#### **Adding Database Model**
```prisma
// 1. Add model to prisma/schema.prisma
model NewFeature {
  id        String   @id @default(cuid())
  name      String
  config    Json?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  tenantId String

  @@map("new_features")
}

// 2. Add relation to Tenant model
model Tenant {
  // ... existing fields
  newFeatures NewFeature[]
}

// 3. Generate and push
pnpm prisma generate
pnpm prisma db push
```

---

## 🧪 TESTING GUIDELINES

### **Testing Strategy**
```
🔺 E2E Tests (10%) - Critical user flows
🔺🔺 Integration Tests (20%) - API endpoints, database operations
🔺🔺🔺 Unit Tests (70%) - Individual functions, components
```

### **Running Tests**
```bash
# Run all tests
pnpm run test

# Run specific test types
pnpm run test:unit
pnpm run test:integration
pnpm run test:e2e

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage
pnpm run test:coverage

# Run specific test file
pnpm run test src/services/authService.test.ts
```

### **Writing Unit Tests**

#### **Service Testing**
```typescript
// tests/unit/services/newFeatureService.test.ts
import { NewFeatureService } from '../../../src/services/newFeatureService'
import { prisma } from '../../../src/lib/prisma'

// Mock Prisma
jest.mock('../../../src/lib/prisma', () => ({
  prisma: {
    newFeature: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    }
  }
}))

describe('NewFeatureService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createFeature', () => {
    it('should create feature successfully', async () => {
      const mockFeature = {
        id: 'feature-1',
        name: 'Test Feature',
        tenantId: 'tenant-1'
      }
      
      ;(prisma.newFeature.create as jest.Mock).mockResolvedValue(mockFeature)
      
      const result = await NewFeatureService.createFeature({
        name: 'Test Feature',
        tenantId: 'tenant-1'
      })
      
      expect(result).toEqual(mockFeature)
      expect(prisma.newFeature.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Feature',
          tenantId: 'tenant-1'
        }
      })
    })
  })
})
```

#### **Component Testing**
```typescript
// tests/unit/components/NewFeatureCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { NewFeatureCard } from '../../../src/components/dashboard/NewFeatureCard'

const mockFeature = {
  id: 'feature-1',
  name: 'Test Feature',
  createdAt: new Date('2024-01-01')
}

describe('NewFeatureCard', () => {
  it('should render feature data', () => {
    render(<NewFeatureCard data={mockFeature} />)
    
    expect(screen.getByText('Test Feature')).toBeInTheDocument()
    expect(screen.getByText('Created: 1/1/2024')).toBeInTheDocument()
  })
  
  it('should call onEdit when edit button clicked', () => {
    const onEdit = jest.fn()
    render(<NewFeatureCard data={mockFeature} onEdit={onEdit} />)
    
    fireEvent.click(screen.getByText('Edit'))
    expect(onEdit).toHaveBeenCalledWith('feature-1')
  })
})
```

### **Writing Integration Tests**
```typescript
// tests/integration/api/newFeature.test.ts
import { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api'
import { createTestUser } from '../../helpers/test-helpers'

describe('NewFeature API Integration', () => {
  let app: FastifyInstance
  let authToken: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
    
    const { token } = await createTestUser()
    authToken = token
  })

  afterAll(async () => {
    await app.close()
  })

  describe('POST /api/v1/new-feature', () => {
    it('should create new feature', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/new-feature',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          name: 'Test Feature'
        }
      })

      expect(response.statusCode).toBe(201)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data.name).toBe('Test Feature')
    })
  })
})
```

### **Writing E2E Tests**
```typescript
// tests/e2e/newFeature.spec.ts
import { test, expect } from '@playwright/test'

test.describe('New Feature Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.fill('[data-testid="email"]', 'test@example.com')
    await page.fill('[data-testid="password"]', 'password123')
    await page.click('[data-testid="login-button"]')
    await expect(page).toHaveURL('/dashboard')
  })

  test('should create new feature', async ({ page }) => {
    await page.goto('/dashboard/new-feature')
    
    // Click create button
    await page.click('[data-testid="create-feature-button"]')
    
    // Fill form
    await page.fill('[data-testid="feature-name"]', 'E2E Test Feature')
    await page.click('[data-testid="submit-feature"]')
    
    // Verify creation
    await expect(page.locator('[data-testid="success-message"]')).toContainText('Feature created successfully')
    await expect(page.locator('[data-testid="feature-card"]')).toContainText('E2E Test Feature')
  })
})
```

### **Test Helpers**
```typescript
// tests/helpers/test-helpers.ts
import { prisma } from '../../src/lib/prisma'
import { AuthService } from '../../src/services/authService'
import { faker } from '@faker-js/faker'

export async function createTestUser(overrides = {}) {
  const userData = {
    email: faker.internet.email(),
    password: 'password123',
    name: faker.person.fullName(),
    tenantName: faker.company.name(),
    ...overrides
  }
  
  const result = await AuthService.register(userData)
  return result
}

export async function createTestFeature(tenantId: string, overrides = {}) {
  const featureData = {
    name: faker.lorem.words(2),
    tenantId,
    ...overrides
  }
  
  return await prisma.newFeature.create({
    data: featureData
  })
}

export async function cleanupTestData() {
  await prisma.newFeature.deleteMany()
  await prisma.user.deleteMany()
  await prisma.tenant.deleteMany()
}
```

---

## 🗄️ DATABASE OPERATIONS

### **Common Prisma Operations**

#### **Development Commands**
```bash
# Generate Prisma client
pnpm prisma generate

# Push schema changes to database
pnpm prisma db push

# Create migration
pnpm prisma migrate dev --name add-new-feature

# Reset database
pnpm prisma migrate reset

# Seed database
pnpm prisma db seed

# Open Prisma Studio
pnpm prisma studio
```

#### **Schema Changes**
```prisma
// 1. Modify schema.prisma
model NewFeature {
  id          String   @id @default(cuid())
  name        String
  description String?  // New field
  config      Json?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant   Tenant @relation(fields: [tenantId], references: [id])
  tenantId String

  @@map("new_features")
}

// 2. Generate client
pnpm prisma generate

// 3. Push to database (development)
pnpm prisma db push

// 4. Create migration (production)
pnpm prisma migrate dev --name add-description-field
```

#### **Query Examples**
```typescript
// Basic CRUD operations
export class NewFeatureService {
  // Create
  static async createFeature(data: CreateFeatureData) {
    return await prisma.newFeature.create({
      data: {
        name: data.name,
        description: data.description,
        tenantId: data.tenantId
      }
    })
  }
  
  // Read with relations
  static async getFeaturesByTenant(tenantId: string) {
    return await prisma.newFeature.findMany({
      where: { tenantId },
      include: {
        tenant: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  }
  
  // Update
  static async updateFeature(id: string, tenantId: string, data: UpdateFeatureData) {
    return await prisma.newFeature.update({
      where: { 
        id,
        tenantId // Ensure tenant isolation
      },
      data: {
        name: data.name,
        description: data.description,
        updatedAt: new Date()
      }
    })
  }
  
  // Delete
  static async deleteFeature(id: string, tenantId: string) {
    return await prisma.newFeature.delete({
      where: { 
        id,
        tenantId
      }
    })
  }
  
  // Complex query with aggregation
  static async getFeatureStats(tenantId: string) {
    const stats = await prisma.newFeature.groupBy({
      by: ['isActive'],
      where: { tenantId },
      _count: { _all: true }
    })
    
    return {
      total: stats.reduce((sum, stat) => sum + stat._count._all, 0),
      active: stats.find(s => s.isActive)?._count._all || 0,
      inactive: stats.find(s => !s.isActive)?._count._all || 0
    }
  }
}
```

### **Database Seeding**
```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client'
import { faker } from '@faker-js/faker'

const prisma = new PrismaClient()

async function main() {
  // Create test tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Test Company',
      slug: 'test-company',
      plan: 'BASIC',
      status: 'ACTIVE'
    }
  })
  
  // Create test user
  const user = await prisma.user.create({
    data: {
      email: 'admin@test.com',
      password: '$2a$12$hashedpassword', // bcrypt hash of 'password123'
      name: 'Test Admin',
      role: 'ADMIN',
      tenantId: tenant.id
    }
  })
  
  // Create test features
  for (let i = 0; i < 5; i++) {
    await prisma.newFeature.create({
      data: {
        name: faker.lorem.words(2),
        description: faker.lorem.sentence(),
        tenantId: tenant.id
      }
    })
  }
  
  console.log('Database seeded successfully')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

---

## 🔌 API DEVELOPMENT

### **Creating New API Endpoints**

#### **1. Define Route Handler**
```typescript
// src/api/routes/newFeature.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authMiddleware } from '../middleware/auth'
import { NewFeatureService } from '../../services/newFeatureService'
import { createFeatureSchema, updateFeatureSchema } from '../../lib/validation'

export default async function newFeatureRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes
  fastify.addHook('preHandler', authMiddleware)
  
  // GET /api/v1/features
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId } = request
      const features = await NewFeatureService.getFeaturesByTenant(tenantId)
      
      return {
        success: true,
        data: features
      }
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      })
    }
  })
  
  // POST /api/v1/features
  fastify.post('/', {
    schema: {
      body: createFeatureSchema
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId } = request
      const data = request.body as CreateFeatureData
      
      const feature = await NewFeatureService.createFeature({
        ...data,
        tenantId
      })
      
      return reply.status(201).send({
        success: true,
        data: feature
      })
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message
        }
      })
    }
  })
}
```

#### **2. Add Validation Schema**
```typescript
// src/lib/validation.ts
import { z } from 'zod'

export const createFeatureSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  config: z.record(z.any()).optional()
})

export const updateFeatureSchema = createFeatureSchema.partial()

export type CreateFeatureData = z.infer<typeof createFeatureSchema>
export type UpdateFeatureData = z.infer<typeof updateFeatureSchema>
```

#### **3. Register Route**
```typescript
// src/api/index.ts
import newFeatureRoutes from './routes/newFeature'

export async function buildApp() {
  const app = fastify({
    logger: true
  })
  
  // Register routes
  await app.register(newFeatureRoutes, { prefix: '/api/v1/features' })
  
  return app
}
```

### **API Testing**
```bash
# Test endpoints with curl

# GET features
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3001/api/v1/features

# POST create feature
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Feature","description":"Test description"}' \
  http://localhost:3001/api/v1/features

# PUT update feature
curl -X PUT \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Feature"}' \
  http://localhost:3001/api/v1/features/FEATURE_ID
```

---

## 🎨 FRONTEND DEVELOPMENT

### **Creating New Pages**

#### **1. Create Page Component**
```typescript
// src/app/dashboard/new-feature/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { NewFeatureCard } from '@/components/dashboard/NewFeatureCard'
import { CreateFeatureDialog } from '@/components/dashboard/CreateFeatureDialog'
import { useAuth } from '@/hooks/useAuth'

export default function NewFeaturePage() {
  const { user } = useAuth()
  const [features, setFeatures] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  useEffect(() => {
    loadFeatures()
  }, [])

  const loadFeatures = async () => {
    try {
      const response = await fetch('/api/v1/features', {
        headers: {
          'Authorization': `Bearer ${user?.token}`
        }
      })
      const data = await response.json()
      
      if (data.success) {
        setFeatures(data.data)
      }
    } catch (error) {
      console.error('Failed to load features:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateFeature = async (featureData) => {
    try {
      const response = await fetch('/api/v1/features', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`
        },
        body: JSON.stringify(featureData)
      })
      
      if (response.ok) {
        await loadFeatures()
        setShowCreateDialog(false)
      }
    } catch (error) {
      console.error('Failed to create feature:', error)
    }
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Features</h1>
        <Button onClick={() => setShowCreateDialog(true)}>
          Create Feature
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map(feature => (
          <NewFeatureCard
            key={feature.id}
            data={feature}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <CreateFeatureDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSubmit={handleCreateFeature}
      />
    </div>
  )
}
```

#### **2. Create Components**
```typescript
// src/components/dashboard/CreateFeatureDialog.tsx
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const createFeatureSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional()
})

type CreateFeatureForm = z.infer<typeof createFeatureSchema>

interface CreateFeatureDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: CreateFeatureForm) => Promise<void>
}

export function CreateFeatureDialog({ open, onClose, onSubmit }: CreateFeatureDialogProps) {
  const [loading, setLoading] =
useState(false)
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<CreateFeatureForm>({
    resolver: zodResolver(createFeatureSchema)
  })

  const handleFormSubmit = async (data: CreateFeatureForm) => {
    setLoading(true)
    try {
      await onSubmit(data)
      reset()
    } catch (error) {
      console.error('Failed to create feature:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Feature</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="Feature name"
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>
          
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Feature description (optional)"
            />
          </div>
          
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Feature'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

### **Custom Hooks**
```typescript
// src/hooks/useFeatures.ts
import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'

export function useFeatures() {
  const { user } = useAuth()
  const [features, setFeatures] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadFeatures = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/v1/features', {
        headers: {
          'Authorization': `Bearer ${user?.token}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to load features')
      }
      
      const data = await response.json()
      setFeatures(data.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const createFeature = async (featureData) => {
    const response = await fetch('/api/v1/features', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user?.token}`
      },
      body: JSON.stringify(featureData)
    })
    
    if (!response.ok) {
      throw new Error('Failed to create feature')
    }
    
    await loadFeatures() // Refresh list
    return response.json()
  }

  const updateFeature = async (id, featureData) => {
    const response = await fetch(`/api/v1/features/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user?.token}`
      },
      body: JSON.stringify(featureData)
    })
    
    if (!response.ok) {
      throw new Error('Failed to update feature')
    }
    
    await loadFeatures()
    return response.json()
  }

  const deleteFeature = async (id) => {
    const response = await fetch(`/api/v1/features/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${user?.token}`
      }
    })
    
    if (!response.ok) {
      throw new Error('Failed to delete feature')
    }
    
    await loadFeatures()
  }

  useEffect(() => {
    if (user?.token) {
      loadFeatures()
    }
  }, [user?.token])

  return {
    features,
    loading,
    error,
    createFeature,
    updateFeature,
    deleteFeature,
    refetch: loadFeatures
  }
}
```

### **Styling with Tailwind CSS**
```typescript
// Component styling examples
export function FeatureCard({ feature }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {feature.name}
      </h3>
      <p className="text-gray-600 text-sm mb-4">
        {feature.description}
      </p>
      <div className="flex justify-between items-center">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          feature.isActive 
            ? 'bg-green-100 text-green-800' 
            : 'bg-gray-100 text-gray-800'
        }`}>
          {feature.isActive ? 'Active' : 'Inactive'}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline">Edit</Button>
          <Button size="sm" variant="destructive">Delete</Button>
        </div>
      </div>
    </div>
  )
}
```

---

## 🐛 DEBUGGING & TROUBLESHOOTING

### **Development Debugging**

#### **Frontend Debugging**
```typescript
// Enable React DevTools
// Install React Developer Tools browser extension

// Debug component state
import { useEffect } from 'react'

export function DebugComponent({ data }) {
  useEffect(() => {
    console.log('Component data:', data)
  }, [data])
  
  // Add data-testid for testing
  return (
    <div data-testid="debug-component">
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}

// Debug API calls
const debugFetch = async (url, options) => {
  console.log('API Request:', { url, options })
  
  const response = await fetch(url, options)
  const data = await response.json()
  
  console.log('API Response:', { status: response.status, data })
  
  return { response, data }
}
```

#### **Backend Debugging**
```typescript
// Add logging to services
import { logger } from '../lib/logger'

export class NewFeatureService {
  static async createFeature(data) {
    logger.info('Creating feature', { data })
    
    try {
      const feature = await prisma.newFeature.create({ data })
      logger.info('Feature created successfully', { featureId: feature.id })
      return feature
    } catch (error) {
      logger.error('Failed to create feature', { error: error.message, data })
      throw error
    }
  }
}

// Debug API requests
export async function debugMiddleware(request, reply) {
  console.log('Request:', {
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: request.body
  })
  
  reply.addHook('onSend', (request, reply, payload, done) => {
    console.log('Response:', {
      statusCode: reply.statusCode,
      payload: JSON.parse(payload)
    })
    done()
  })
}
```

### **Common Issues & Solutions**

#### **Database Issues**
```bash
# Issue: Prisma client out of sync
# Solution: Regenerate client
pnpm prisma generate

# Issue: Migration conflicts
# Solution: Reset and recreate
pnpm prisma migrate reset
pnpm prisma migrate dev

# Issue: Connection timeout
# Solution: Check connection string and network
echo $DATABASE_URL
psql $DATABASE_URL -c "SELECT 1;"
```

#### **Build Issues**
```bash
# Issue: TypeScript errors
# Solution: Check and fix types
pnpm run type-check

# Issue: ESLint errors
# Solution: Fix linting issues
pnpm run lint --fix

# Issue: Module not found
# Solution: Clear cache and reinstall
rm -rf node_modules .next
pnpm install
```

#### **Runtime Issues**
```bash
# Check application logs
tail -f logs/combined.log

# Check specific service logs
docker-compose logs -f postgres
docker-compose logs -f redis

# Monitor system resources
htop
docker stats
```

### **Debugging Tools**

#### **VS Code Debugging Configuration**
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Next.js",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/next",
      "args": ["dev"],
      "env": {
        "NODE_OPTIONS": "--inspect"
      },
      "console": "integratedTerminal",
      "serverReadyAction": {
        "pattern": "ready - started server on .+, url: (https?://.+)",
        "uriFormat": "%s",
        "action": "debugWithChrome"
      }
    },
    {
      "name": "Debug API Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/api/index.ts",
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "outFiles": ["${workspaceFolder}/**/*.js"]
    }
  ]
}
```

---

## 👥 CODE REVIEW PROCESS

### **Before Creating Pull Request**
```bash
# 1. Ensure all tests pass
pnpm run test

# 2. Check TypeScript compilation
pnpm run type-check

# 3. Fix linting issues
pnpm run lint --fix

# 4. Format code
pnpm run format

# 5. Build successfully
pnpm run build

# 6. Update documentation if needed
# Edit relevant .md files

# 7. Commit with conventional format
git add .
git commit -m "feat(features): add new feature management system"
```

### **Pull Request Template**
```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Code is commented where necessary
- [ ] Documentation updated
- [ ] No new warnings introduced
- [ ] Tests added for new functionality

## Screenshots (if applicable)
Add screenshots for UI changes.

## Additional Notes
Any additional information for reviewers.
```

### **Code Review Checklist**

#### **For Reviewers**
```markdown
## Code Quality
- [ ] Code is readable and well-structured
- [ ] Functions are small and focused
- [ ] Variable names are descriptive
- [ ] No code duplication
- [ ] Error handling is appropriate

## Security
- [ ] Input validation is present
- [ ] No sensitive data in logs
- [ ] Authentication/authorization checks
- [ ] SQL injection prevention
- [ ] XSS prevention

## Performance
- [ ] Database queries are optimized
- [ ] No N+1 query problems
- [ ] Appropriate caching used
- [ ] Large datasets handled properly

## Testing
- [ ] Adequate test coverage
- [ ] Tests are meaningful
- [ ] Edge cases covered
- [ ] Tests are maintainable

## Documentation
- [ ] Code is self-documenting
- [ ] Complex logic is commented
- [ ] API documentation updated
- [ ] README updated if needed
```

---

## 🚀 DEPLOYMENT PROCESS

### **Development Deployment**
```bash
# 1. Build application
pnpm run build

# 2. Run production build locally
pnpm run start

# 3. Test production build
curl http://localhost:3000/api/health
```

### **Staging Deployment**
```bash
# 1. Push to staging branch
git checkout staging
git merge feature/your-feature
git push origin staging

# 2. Deploy to staging (automated via GitHub Actions)
# Check deployment status in GitHub Actions

# 3. Run staging tests
pnpm run test:staging

# 4. Manual testing on staging environment
```

### **Production Deployment**
```bash
# 1. Create release branch
git checkout -b release/v1.1.0
git push origin release/v1.1.0

# 2. Create pull request to main
# Get approval from team lead

# 3. Merge to main
git checkout main
git merge release/v1.1.0

# 4. Create release tag
git tag v1.1.0
git push origin v1.1.0

# 5. Production deployment (automated)
# Monitor deployment in GitHub Actions

# 6. Post-deployment verification
curl https://api.zapin.tech/health
```

### **Rollback Process**
```bash
# If deployment fails, rollback to previous version
git checkout main
git revert HEAD
git push origin main

# Or rollback to specific version
git reset --hard v1.0.9
git push origin main --force-with-lease
```

---

## 📚 BEST PRACTICES

### **Code Organization**
```typescript
// ✅ Good: Organized imports
import React from 'react'
import { useState, useEffect } from 'react'

// External libraries
import { z } from 'zod'
import { useForm } from 'react-hook-form'

// Internal components
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'

// Types
import type { User } from '@/types'

// ❌ Bad: Mixed imports
import { Button } from '@/components/ui/button'
import React from 'react'
import type { User } from '@/types'
import { z } from 'zod'
```

### **Error Handling**
```typescript
// ✅ Good: Comprehensive error handling
export async function createFeature(data: CreateFeatureData) {
  try {
    const feature = await prisma.newFeature.create({ data })
    logger.info('Feature created', { featureId: feature.id })
    return { success: true, data: feature }
  } catch (error) {
    logger.error('Failed to create feature', { error: error.message, data })
    
    if (error.code === 'P2002') {
      throw new Error('Feature with this name already exists')
    }
    
    throw new Error('Failed to create feature')
  }
}

// ❌ Bad: No error handling
export async function createFeature(data: CreateFeatureData) {
  const feature = await prisma.newFeature.create({ data })
  return feature
}
```

### **Type Safety**
```typescript
// ✅ Good: Strong typing
interface CreateFeatureRequest {
  name: string
  description?: string
  config?: Record<string, unknown>
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

export async function createFeature(
  data: CreateFeatureRequest
): Promise<ApiResponse<Feature>> {
  // Implementation
}

// ❌ Bad: Any types
export async function createFeature(data: any): Promise<any> {
  // Implementation
}
```

### **Performance**
```typescript
// ✅ Good: Optimized queries
const features = await prisma.newFeature.findMany({
  where: { tenantId },
  select: {
    id: true,
    name: true,
    isActive: true,
    createdAt: true
  },
  orderBy: { createdAt: 'desc' },
  take: 50
})

// ❌ Bad: Unoptimized queries
const features = await prisma.newFeature.findMany({
  where: { tenantId },
  include: {
    tenant: true,
    // ... all relations
  }
})
```

### **Security**
```typescript
// ✅ Good: Input validation
const createFeatureSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional()
})

export async function createFeature(request: FastifyRequest) {
  const data = createFeatureSchema.parse(request.body)
  const { tenantId } = request // From auth middleware
  
  return await FeatureService.create({ ...data, tenantId })
}

// ❌ Bad: No validation
export async function createFeature(request: FastifyRequest) {
  const data = request.body
  return await FeatureService.create(data)
}
```

### **Testing**
```typescript
// ✅ Good: Comprehensive test
describe('createFeature', () => {
  it('should create feature with valid data', async () => {
    const mockFeature = { id: '1', name: 'Test' }
    jest.spyOn(prisma.newFeature, 'create').mockResolvedValue(mockFeature)
    
    const result = await FeatureService.createFeature({
      name: 'Test Feature',
      tenantId: 'tenant-1'
    })
    
    expect(result).toEqual(mockFeature)
    expect(prisma.newFeature.create).toHaveBeenCalledWith({
      data: { name: 'Test Feature', tenantId: 'tenant-1' }
    })
  })
  
  it('should throw error for invalid data', async () => {
    await expect(FeatureService.createFeature({
      name: '', // Invalid
      tenantId: 'tenant-1'
    })).rejects.toThrow('Name is required')
  })
})

// ❌ Bad: Minimal test
describe('createFeature', () => {
  it('should work', async () => {
    const result = await FeatureService.createFeature({})
    expect(result).toBeDefined()
  })
})
```

---

## 🎯 QUICK REFERENCE

### **Common Commands**
```bash
# Development
pnpm run dev              # Start development server
pnpm run build            # Build for production
pnpm run start            # Start production server

# Testing
pnpm run test             # Run all tests
pnpm run test:watch       # Run tests in watch mode
pnpm run test:coverage    # Generate coverage report

# Database
pnpm prisma generate      # Generate Prisma client
pnpm prisma db push       # Push schema changes
pnpm prisma studio        # Open database GUI

# Code Quality
pnpm run lint             # Run ESLint
pnpm run format           # Format with Prettier
pnpm run type-check       # Check TypeScript types

# Docker
docker-compose up -d      # Start services
docker-compose down       # Stop services
docker-compose logs -f    # View logs
```

### **File Locations**
```bash
# Configuration
.env                      # Environment variables
package.json              # Dependencies
tsconfig.json             # TypeScript config
tailwind.config.js        # Tailwind config

# Source Code
src/app/                  # Next.js pages
src/components/           # React components
src/api/                  # API routes
src/services/             # Business logic
src/lib/                  # Utilities

# Database
prisma/schema.prisma      # Database schema
prisma/seed.ts            # Database seeding

# Testing
tests/                    # Test files
jest.config.js            # Jest configuration
playwright.config.ts      # Playwright config
```

### **Important URLs**
```bash
# Development
http://localhost:3000     # Frontend
http://localhost:3001     # API server
http://localhost:5555     # Prisma Studio

# Database
postgresql://localhost:5432/zapin_dev  # Local database
redis://localhost:6379                 # Local Redis

# Production
https://zapin.tech        # Production frontend
https://api.zapin.tech    # Production API
```

---

## 📞 GETTING HELP

### **Documentation**
- [Main Documentation](../ZAPIN_ENTERPRISE_COMPLETE_DOCUMENTATION.md)
- [API Guide](./zapin-send-message-api-guide.md)
- [Platform Guide](./zapin-whatsapp-saas-platform-guide.md)

### **Debugging Steps**
1. Check application logs: `tail -f logs/combined.log`
2. Verify environment variables: `echo $DATABASE_URL`
3. Test database connection: `pnpm prisma db pull`
4. Check service status: `docker-compose ps`
5. Run health checks: `curl http://localhost:3000/api/health`

### **Common Solutions**
- **Build fails**: Clear cache with `rm -rf .next node_modules && pnpm install`
- **Database issues**: Reset with `pnpm prisma migrate reset`
- **Type errors**: Regenerate with `pnpm prisma generate`
- **Port conflicts**: Change PORT in `.env` file

---

*This developer guide provides comprehensive instructions for working with the Zapin Enterprise codebase. Keep it updated as the project evolves.*