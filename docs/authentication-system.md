# Zapin Authentication System

This document describes the comprehensive authentication system implemented for the Zapin WhatsApp SaaS platform.

## Overview

The authentication system provides:
- Multi-tenant user registration and login
- JWT-based authentication with refresh tokens
- API key management for external integrations
- Role-based access control
- Secure password handling with bcrypt
- Session management with Redis
- Protected routes and middleware

## Architecture

### Backend Components

#### 1. Authentication Service (`src/services/authService.ts`)
- **User Registration**: Creates new users with tenant setup
- **User Login**: Validates credentials and generates tokens
- **Token Management**: JWT generation, validation, and refresh
- **Password Management**: Secure hashing and validation
- **API Key Management**: Generation and management of API keys

#### 2. Authentication Routes (`src/api/routes/auth.ts`)
- `POST /auth/register` - Register new user with tenant
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh JWT token
- `POST /auth/logout` - User logout
- `GET /auth/me` - Get current user profile
- `POST /auth/change-password` - Change user password
- `POST /auth/api-keys` - Create API key
- `GET /auth/api-keys` - List API keys
- `DELETE /auth/api-keys/:keyId` - Revoke API key

#### 3. Authentication Middleware (`src/api/middleware/auth.ts`)
- JWT token validation
- API key validation
- User and tenant context injection
- Permission checking
- Token blacklist verification

### Frontend Components

#### 1. Authentication Utilities (`src/lib/auth.ts`)
- **AuthClient**: Client-side authentication management
- **AuthServer**: Server-side authentication for Next.js
- Token storage and management
- API request helpers with automatic token refresh

#### 2. React Hooks (`src/hooks/useAuth.ts`)
- `useAuth()` - Main authentication hook
- `useApiRequest()` - Authenticated API requests
- `useApiKeys()` - API key management
- `usePasswordManagement()` - Password change functionality
- `useFormValidation()` - Form validation utilities

#### 3. UI Components (`src/components/auth/`)
- `LoginForm` - User login interface
- `RegisterForm` - User registration with tenant creation
- Authentication layouts and forms

#### 4. Protected Pages
- Dashboard layout with authentication checks
- User profile management
- API key management interface
- Settings page

## Security Features

### 1. Password Security
- **Bcrypt Hashing**: Passwords hashed with salt rounds of 12
- **Password Validation**: Enforces strong password requirements
- **Password Change**: Secure password update process

### 2. JWT Security
- **Secret Key**: Uses strong JWT secret from environment
- **Token Expiration**: Configurable token expiration (default 7 days)
- **Refresh Tokens**: Separate refresh tokens for extended sessions
- **Token Blacklisting**: Redis-based token blacklisting on logout

### 3. API Key Security
- **Scoped Permissions**: API keys have specific permission scopes
- **Expiration**: Optional expiration dates for API keys
- **Usage Tracking**: Last used timestamps for monitoring
- **Secure Generation**: Cryptographically secure key generation

### 4. Session Management
- **Redis Storage**: Session data stored in Redis
- **Automatic Cleanup**: Expired sessions automatically removed
- **Multi-device Support**: Multiple active sessions per user

### 5. Route Protection
- **Middleware Protection**: Server-side route protection
- **Client-side Guards**: React-based route protection
- **Automatic Redirects**: Seamless redirect handling

## Database Schema

### Users Table
```sql
- id: String (CUID)
- email: String (unique)
- name: String
- password: String (hashed)
- role: UserRole (ADMIN, USER)
- isActive: Boolean
- tenantId: String (foreign key)
- createdAt: DateTime
- updatedAt: DateTime
```

### Tenants Table
```sql
- id: String (CUID)
- name: String
- slug: String (unique)
- plan: PlanType (BASIC, PRO, ENTERPRISE)
- status: TenantStatus (ACTIVE, SUSPENDED, CANCELLED)
- createdAt: DateTime
- updatedAt: DateTime
```

### Sessions Table
```sql
- id: String (CUID)
- token: String (unique)
- userId: String (foreign key)
- expiresAt: DateTime
- createdAt: DateTime
```

### API Keys Table
```sql
- id: String (CUID)
- name: String
- key: String (unique)
- scopes: String[]
- isActive: Boolean
- lastUsedAt: DateTime
- expiresAt: DateTime
- userId: String (foreign key)
- tenantId: String (foreign key)
- createdAt: DateTime
- updatedAt: DateTime
```

## Environment Variables

```env
# Authentication
JWT_SECRET="your-super-secret-jwt-key-minimum-32-characters-long"
JWT_EXPIRES_IN="7d"

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/zapin_db"

# Redis
REDIS_URL="redis://localhost:6379"

# API Configuration
API_URL="http://localhost:3001"
APP_URL="http://localhost:3000"
```

## Usage Examples

### User Registration
```typescript
import { AuthClient } from '../lib/auth';

const user = await AuthClient.register({
  email: 'user@example.com',
  password: 'securePassword123',
  name: 'John Doe',
  tenantName: 'My Company',
  tenantSlug: 'my-company'
});
```

### User Login
```typescript
const user = await AuthClient.login('user@example.com', 'password');
```

### API Key Creation
```typescript
import { useApiKeys } from '../hooks/useAuth';

const { createApiKey } = useApiKeys();

const apiKey = await createApiKey({
  name: 'Production API',
  scopes: ['messages:send', 'instances:read'],
  expiresAt: '2024-12-31T23:59:59Z'
});
```

### Protected API Request
```typescript
import { useApiRequest } from '../hooks/useAuth';

const { apiRequest } = useApiRequest();

const data = await apiRequest('/api/protected-endpoint', {
  method: 'POST',
  body: JSON.stringify({ message: 'Hello' })
});
```

## Testing

### Manual Testing Checklist
- [ ] User registration with tenant creation
- [ ] User login with valid credentials
- [ ] User login with invalid credentials
- [ ] Token refresh functionality
- [ ] User logout and token invalidation
- [ ] Password change functionality
- [ ] API key creation and management
- [ ] Protected route access
- [ ] Automatic token refresh on API calls
- [ ] Session persistence across browser refresh

### Security Testing
- [ ] Password hashing verification
- [ ] JWT token validation
- [ ] Token expiration handling
- [ ] API key scope enforcement
- [ ] SQL injection prevention
- [ ] XSS protection
- [ ] CSRF protection
- [ ] Rate limiting

## Deployment Considerations

### Production Security
1. **Environment Variables**: Ensure all secrets are properly configured
2. **HTTPS**: Use HTTPS in production for all authentication endpoints
3. **CORS**: Configure CORS properly for your domain
4. **Rate Limiting**: Implement rate limiting on authentication endpoints
5. **Monitoring**: Set up monitoring for failed login attempts
6. **Backup**: Regular database backups including user data

### Performance Optimization
1. **Redis Configuration**: Optimize Redis for session storage
2. **Database Indexing**: Ensure proper indexes on user lookup fields
3. **Token Caching**: Cache frequently accessed tokens
4. **Connection Pooling**: Use connection pooling for database access

## Troubleshooting

### Common Issues
1. **JWT Secret Not Set**: Ensure JWT_SECRET environment variable is configured
2. **Redis Connection**: Verify Redis is running and accessible
3. **Database Connection**: Check DATABASE_URL configuration
4. **CORS Issues**: Verify CORS configuration for your frontend domain
5. **Token Expiration**: Check token expiration settings

### Debug Mode
Enable debug logging by setting `DEBUG=zapin:*` in environment variables.

## Future Enhancements

### Planned Features
- [ ] Two-factor authentication (2FA)
- [ ] Social login integration (Google, GitHub)
- [ ] Advanced role-based permissions
- [ ] Audit logging for authentication events
- [ ] Password reset functionality
- [ ] Account lockout after failed attempts
- [ ] Single Sign-On (SSO) integration
- [ ] Mobile app authentication