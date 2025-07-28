# Bot Management System - Implementation Guide

## Overview

The Bot Management System for Zapin platform allows users to create, configure, and manage AI bots (Typebot and OpenAI) for their WhatsApp instances through a user-friendly dashboard interface.

## Architecture

### Backend Components

#### 1. Bot Management Service (`src/services/botService.ts`)
- **Core business logic** for bot operations
- **Multi-tenant bot isolation** with proper access controls
- **Bot session tracking** and analytics
- **Integration with Evolution API** bot endpoints
- **Bot performance monitoring** and statistics
- **Comprehensive error handling** and validation

**Key Features:**
- Create and manage Typebot and OpenAI bots
- Real-time bot session tracking
- Bot analytics and performance metrics
- Bot testing interface
- Quota management and validation

#### 2. Bot API Routes (`src/api/routes/v1/bots.ts`)
- **RESTful API endpoints** for bot management
- **CRUD operations** for both Typebot and OpenAI bots
- **Bot session management** and monitoring
- **Bot analytics** and performance metrics
- **Bot testing** and debugging endpoints

**Available Endpoints:**
```
GET    /api/v1/bots                    # List all bots
GET    /api/v1/bots/:id               # Get bot details
POST   /api/v1/bots/typebot           # Create Typebot
POST   /api/v1/bots/openai            # Create OpenAI bot
PUT    /api/v1/bots/:id               # Update bot
DELETE /api/v1/bots/:id               # Delete bot
POST   /api/v1/bots/:id/test          # Test bot
GET    /api/v1/bots/:id/analytics     # Get bot analytics
GET    /api/v1/bots/:id/sessions      # Get bot sessions
GET    /api/v1/bots/sessions/:sessionId # Get specific session
POST   /api/v1/bots/sessions/:sessionId/end # End session
GET    /api/v1/bots/available-models  # Get OpenAI models
GET    /api/v1/bots/webhook-events    # Get webhook events
```

#### 3. Security & Validation (`src/api/middleware/botSecurity.ts`)
- **Tenant-based access control** for bots
- **Input validation** for bot configurations
- **Quota checking** and rate limiting
- **Bot permission** and scope management
- **Configuration sanitization**

**Security Features:**
- Bot access validation
- Quota enforcement
- Rate limiting
- Configuration validation
- Instance compatibility checks
- Name uniqueness validation

### Frontend Components

#### 1. Main Bot Management Pages

**Bot Listing Page** (`src/app/dashboard/bots/page.tsx`)
- **Comprehensive bot overview** with stats cards
- **Filterable bot list** by type and status
- **Real-time status indicators**
- **Quick actions** (enable/disable, delete, analytics)
- **Responsive design** with mobile support

**Bot Creation Wizard** (`src/app/dashboard/bots/create/page.tsx`)
- **Step-by-step bot creation** process
- **Bot type selection** (Typebot vs OpenAI)
- **Configuration forms** with validation
- **Advanced settings** configuration
- **Real-time form validation**

**Bot Details Page** (`src/app/dashboard/bots/[id]/page.tsx`)
- **Detailed bot configuration** view
- **Edit mode** with inline editing
- **Bot testing interface**
- **Performance statistics**
- **Instance information**

**Bot Analytics Page** (`src/app/dashboard/bots/[id]/analytics/page.tsx`)
- **Comprehensive analytics dashboard**
- **Performance metrics** and trends
- **Session breakdown** and statistics
- **Top users** analysis
- **Time-based filtering** (24h, 7d, 30d)

#### 2. Reusable Components

**BotCard Component** (`src/components/bots/BotCard.tsx`)
- **Card-based bot display**
- **Status indicators** and badges
- **Quick action buttons**
- **Statistics overview**
- **Responsive design**

**BotTester Component** (`src/components/bots/BotTester.tsx`)
- **Interactive bot testing** interface
- **Real-time chat simulation**
- **Quick test messages**
- **Testing tips** and guidance
- **Message history**

#### 3. UI Components (`src/components/ui/`)
- **Textarea** component for multi-line inputs
- **Select** component with search and filtering
- **Switch** component for toggle controls
- **Consistent styling** with Tailwind CSS

### Database Schema

The bot management system uses the existing Prisma schema with these key models:

#### Bot Model
```prisma
model Bot {
  id              String    @id @default(cuid())
  name            String
  type            BotType   // TYPEBOT | OPENAI
  evolutionBotId  String?   @unique
  config          Json      // Bot-specific configuration
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relations
  tenant     Tenant       @relation(fields: [tenantId], references: [id])
  tenantId   String
  instance   Instance     @relation(fields: [instanceId], references: [id])
  instanceId String
  sessions   BotSession[]
}
```

#### BotSession Model
```prisma
model BotSession {
  id          String        @id @default(cuid())
  sessionId   String        @unique
  phoneNumber String
  status      SessionStatus @default(ACTIVE)
  context     Json?
  startedAt   DateTime      @default(now())
  endedAt     DateTime?
  updatedAt   DateTime      @updatedAt

  // Relations
  bot      Bot            @relation(fields: [botId], references: [id])
  botId    String
  messages BotMessage[]
}
```

#### BotMessage Model
```prisma
model BotMessage {
  id        String           @id @default(cuid())
  messageId String
  content   String
  type      MessageType
  direction MessageDirection
  createdAt DateTime         @default(now())

  // Relations
  session   BotSession @relation(fields: [sessionId], references: [id])
  sessionId String
}
```

## Bot Types & Configuration

### 1. Typebot Integration

**Configuration Options:**
- **Typebot URL**: The URL of your Typebot instance
- **Typebot ID**: Unique identifier for the specific bot
- **Trigger Type**: 'all' messages or specific 'keyword'
- **Trigger Value**: Keyword to trigger the bot (if keyword type)
- **Session Settings**: Timeout, delay, unknown message handling
- **Behavior Settings**: Listen to own messages, keep sessions open

**Features:**
- Visual flow-based chatbot builder integration
- Drag-and-drop conversation flows
- Conditional logic and branching
- Media and file support
- Session management

### 2. OpenAI Integration

**Configuration Options:**
- **Model Selection**: GPT-4, GPT-4 Turbo, GPT-4o, GPT-3.5 Turbo, etc.
- **System Prompt**: Instructions for the AI behavior
- **Bot Type**: Assistant or Chat Completion
- **Parameters**: Temperature, max tokens, penalties
- **Trigger Settings**: All messages or keyword-based
- **Advanced Settings**: Function calling, assistant ID

**Features:**
- Advanced AI-powered conversations
- Natural language understanding
- Context-aware responses
- Customizable personality and behavior
- Cost tracking and usage monitoring

## Security Features

### 1. Access Control
- **Tenant Isolation**: Bots are isolated per tenant
- **User Permissions**: Role-based access control
- **API Key Scoping**: Limited access based on API key permissions
- **Instance Validation**: Ensure bot belongs to accessible instance

### 2. Input Validation
- **Configuration Validation**: Type-specific validation rules
- **Data Sanitization**: Remove sensitive information from responses
- **Rate Limiting**: Prevent abuse of bot operations
- **Quota Enforcement**: Respect plan limits

### 3. Data Protection
- **Sensitive Data Handling**: Secure storage of API keys and credentials
- **Audit Logging**: Track all bot operations
- **Session Security**: Secure session management
- **Error Handling**: Prevent information leakage

## Analytics & Monitoring

### 1. Bot Performance Metrics
- **Response Time**: Average time to respond to messages
- **Success Rate**: Percentage of successful interactions
- **Error Rate**: Frequency of errors or failures
- **Session Duration**: Average length of conversations

### 2. Usage Analytics
- **Session Statistics**: Total, active, completed, abandoned sessions
- **Message Counts**: Inbound vs outbound message volumes
- **User Activity**: Top users and interaction patterns
- **Trend Analysis**: Performance over time

### 3. Real-time Monitoring
- **Live Session Tracking**: Monitor active conversations
- **Performance Alerts**: Notifications for issues
- **Usage Dashboards**: Visual representation of metrics
- **Historical Data**: Long-term trend analysis

## Testing & Debugging

### 1. Bot Testing Interface
- **Real-time Testing**: Send test messages and see responses
- **Chat Simulation**: Interactive conversation testing
- **Quick Test Messages**: Pre-defined test scenarios
- **Response Analysis**: Evaluate bot performance

### 2. Debugging Tools
- **Session Logs**: Detailed conversation history
- **Error Tracking**: Identify and resolve issues
- **Performance Monitoring**: Track response times and success rates
- **Configuration Validation**: Ensure proper setup

## Integration with Evolution API

### 1. Bot Configuration
- **Typebot Setup**: Configure Typebot integration via Evolution API
- **OpenAI Setup**: Configure OpenAI bot via Evolution API
- **Webhook Management**: Set up event handling
- **Instance Management**: Link bots to WhatsApp instances

### 2. Message Handling
- **Inbound Messages**: Process incoming WhatsApp messages
- **Outbound Responses**: Send bot responses via Evolution API
- **Media Support**: Handle images, documents, and other media
- **Group Support**: Bot functionality in group chats

## Deployment & Configuration

### 1. Environment Variables
```env
# Database
DATABASE_URL="postgresql://..."

# Redis
REDIS_URL="redis://..."

# Evolution API
EVOLUTION_API_BASE_URL="https://core.zapin.tech/v2"
EVOLUTION_GLOBAL_API_KEY="your-global-api-key"

# Webhook
WEBHOOK_BASE_URL="https://your-domain.com"
```

### 2. Database Migration
```bash
# Run Prisma migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

### 3. Dependencies
```json
{
  "@prisma/client": "^5.0.0",
  "@radix-ui/react-select": "^2.0.0",
  "@radix-ui/react-switch": "^1.0.0",
  "fastify": "^4.0.0",
  "zod": "^3.0.0",
  "redis": "^4.0.0"
}
```

## Usage Examples

### 1. Creating a Typebot
```typescript
const typebotData = {
  name: "Customer Support Bot",
  instanceId: "instance-id",
  typebotUrl: "https://typebot.io/my-bot",
  typebotId: "bot-id-123",
  triggerType: "keyword",
  triggerValue: "support",
  settings: {
    enabled: true,
    expire: 60,
    delayMessage: 1000,
    unknownMessage: "I didn't understand that."
  }
};

const response = await fetch('/api/v1/bots/typebot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(typebotData)
});
```

### 2. Creating an OpenAI Bot
```typescript
const openaiData = {
  name: "AI Assistant",
  instanceId: "instance-id",
  model: "gpt-4o-mini",
  systemPrompt: "You are a helpful customer service assistant.",
  triggerType: "all",
  settings: {
    enabled: true,
    maxTokens: 1000,
    temperature: 0.7
  }
};

const response = await fetch('/api/v1/bots/openai', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(openaiData)
});
```

### 3. Testing a Bot
```typescript
const testResult = await fetch(`/api/v1/bots/${botId}/test`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "Hello, how can you help me?",
    phoneNumber: "1234567890"
  })
});
```

## Best Practices

### 1. Bot Configuration
- **Clear Naming**: Use descriptive names for bots
- **Proper Triggers**: Set appropriate trigger conditions
- **Response Times**: Configure reasonable delays
- **Error Handling**: Provide helpful unknown message responses

### 2. Security
- **Regular Audits**: Review bot access and permissions
- **Credential Management**: Secure API keys and sensitive data
- **Rate Limiting**: Implement appropriate limits
- **Monitoring**: Track bot usage and performance

### 3. Performance
- **Optimize Prompts**: Keep system prompts concise and clear
- **Monitor Usage**: Track token usage for OpenAI bots
- **Session Management**: Properly handle session timeouts
- **Caching**: Implement caching for frequently accessed data

## Troubleshooting

### Common Issues

1. **Bot Not Responding**
   - Check if bot is active
   - Verify instance connection
   - Review trigger configuration
   - Check Evolution API connectivity

2. **High Response Times**
   - Monitor OpenAI API performance
   - Check network connectivity
   - Review bot configuration
   - Optimize system prompts

3. **Session Issues**
   - Verify session timeout settings
   - Check database connectivity
   - Review session management logic
   - Monitor memory usage

4. **Permission Errors**
   - Verify tenant access
   - Check API key permissions
   - Review user roles
   - Validate instance ownership

## Future Enhancements

### Planned Features
- **Advanced Analytics**: More detailed performance metrics
- **Bot Templates**: Pre-configured bot templates
- **A/B Testing**: Compare different bot configurations
- **Integration Hub**: Connect with more external services
- **Voice Support**: Voice message handling
- **Multi-language**: Support for multiple languages

### Technical Improvements
- **Real-time Updates**: WebSocket integration for live updates
- **Advanced Caching**: Redis-based caching for better performance
- **Queue System**: Background job processing for bot operations
- **Monitoring**: Enhanced monitoring and alerting
- **API Versioning**: Support for multiple API versions

## Conclusion

The Bot Management System provides a comprehensive solution for managing AI-powered WhatsApp bots within the Zapin platform. With support for both Typebot and OpenAI integrations, robust security features, detailed analytics, and an intuitive user interface, it enables users to create and manage sophisticated chatbot experiences for their WhatsApp instances.

The system is designed with scalability, security, and user experience in mind, providing a solid foundation for automated customer interactions and business process automation through WhatsApp.