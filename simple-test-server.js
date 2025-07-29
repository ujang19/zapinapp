const http = require('http');
const url = require('url');

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Health check endpoint
  if (parsedUrl.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    return;
  }
  
  // Messages endpoint
  if (parsedUrl.pathname === '/api/v1/messages/send' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const authHeader = req.headers.authorization;
        const apiKeyHeader = req.headers.apikey;
        
        // Check authentication
        if (!authHeader && !apiKeyHeader) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required. Provide either Authorization header or apikey header.'
            }
          }));
          return;
        }
        
        let authType = 'unknown';
        let authValue = '';
        
        // Prioritize apikey header (Evolution API style)
        if (apiKeyHeader) {
          authType = 'apikey';
          authValue = apiKeyHeader;
        } else if (authHeader && authHeader.startsWith('Bearer ')) {
          authType = 'bearer';
          authValue = authHeader.substring(7);
        }
        
        // Validate the test API key
        const validApiKey = 'zap_test_api_key_12345678901234567890';
        if (authValue !== validApiKey) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: {
              code: 'INVALID_API_KEY',
              message: 'Invalid API key provided.'
            }
          }));
          return;
        }
        
        // Success response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            messageId: 'msg_' + Math.random().toString(36).substring(2, 15),
            status: 'sent',
            authType: authType,
            message: data.message || 'Test message',
            timestamp: new Date().toISOString()
          }
        }));
        
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Invalid JSON in request body.'
          }
        }));
      }
    });
    
    return;
  }
  
  // 404 for other endpoints
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found.'
    }
  }));
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Simple test server running on http://localhost:${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  /api/health`);
  console.log(`   POST /api/v1/messages/send`);
  console.log(`📝 Test with: node test-apikey-auth.js`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed.');
    process.exit(0);
  });
});