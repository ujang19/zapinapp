// Script untuk menguji berbagai endpoint API Evolution

const EVOLUTION_CONFIG = {
  baseURL: 'https://core.zapin.tech',
  baseURLV2: 'https://core.zapin.tech/v2',
  globalApiKey: 'yHC2Wulppn9wDp1Qt2JkNF714x3Lj2tY',
  instanceName: 'truelove'
};

// Fungsi untuk test endpoint
async function testEndpoint(url, method = 'GET', body = null) {
  try {
    const options = {
      method: method,
      headers: {
        'apikey': EVOLUTION_CONFIG.globalApiKey
      }
    };
    
    if (body && method !== 'GET') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    
    console.log(`\n🔍 Testing: ${method} ${url}`);
    
    const response = await fetch(url, options);
    const data = await response.text();
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    try {
      const jsonData = JSON.parse(data);
      console.log('Response:', JSON.stringify(jsonData, null, 2));
      return { success: response.ok, status: response.status, data: jsonData };
    } catch (e) {
      console.log('Response (text):', data);
      return { success: response.ok, status: response.status, data: data };
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testAllEndpoints() {
  console.log('🚀 Testing Evolution API Endpoints');
  console.log('Instance Name:', EVOLUTION_CONFIG.instanceName);
  console.log('API Key:', EVOLUTION_CONFIG.globalApiKey.substring(0, 10) + '...');
  
  const endpoints = [
    // Test base URL
    { url: EVOLUTION_CONFIG.baseURL, method: 'GET', name: 'Base URL' },
    { url: EVOLUTION_CONFIG.baseURLV2, method: 'GET', name: 'Base URL V2' },
    
    // Test instance endpoints (v2)
    { 
      url: `${EVOLUTION_CONFIG.baseURLV2}/instance/connectionState/${EVOLUTION_CONFIG.instanceName}`, 
      method: 'GET', 
      name: 'Connection State (v2)' 
    },
    { 
      url: `${EVOLUTION_CONFIG.baseURLV2}/instance/fetchInstances`, 
      method: 'GET', 
      name: 'Fetch Instances (v2)' 
    },
    
    // Test instance endpoints (v1)
    { 
      url: `${EVOLUTION_CONFIG.baseURL}/instance/connectionState/${EVOLUTION_CONFIG.instanceName}`, 
      method: 'GET', 
      name: 'Connection State (v1)' 
    },
    { 
      url: `${EVOLUTION_CONFIG.baseURL}/instance/fetchInstances`, 
      method: 'GET', 
      name: 'Fetch Instances (v1)' 
    },
    
    // Test alternative endpoints
    { 
      url: `${EVOLUTION_CONFIG.baseURL}/instances`, 
      method: 'GET', 
      name: 'Instances List' 
    },
    { 
      url: `${EVOLUTION_CONFIG.baseURL}/instances/${EVOLUTION_CONFIG.instanceName}`, 
      method: 'GET', 
      name: 'Instance Detail' 
    },
    { 
      url: `${EVOLUTION_CONFIG.baseURL}/instances/${EVOLUTION_CONFIG.instanceName}/status`, 
      method: 'GET', 
      name: 'Instance Status' 
    },
    
    // Test health/info endpoints
    { 
      url: `${EVOLUTION_CONFIG.baseURL}/health`, 
      method: 'GET', 
      name: 'Health Check' 
    },
    { 
      url: `${EVOLUTION_CONFIG.baseURL}/info`, 
      method: 'GET', 
      name: 'API Info' 
    },
    { 
      url: `${EVOLUTION_CONFIG.baseURL}/version`, 
      method: 'GET', 
      name: 'API Version' 
    }
  ];
  
  const results = [];
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint.url, endpoint.method);
    results.push({
      name: endpoint.name,
      url: endpoint.url,
      ...result
    });
    
    // Delay untuk menghindari rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  console.log('\n📊 SUMMARY:');
  console.log('=' * 50);
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful: ${successful.length}`);
  successful.forEach(r => {
    console.log(`   - ${r.name}: ${r.status}`);
  });
  
  console.log(`\n❌ Failed: ${failed.length}`);
  failed.forEach(r => {
    console.log(`   - ${r.name}: ${r.status || 'Error'} - ${r.error || 'Unknown error'}`);
  });
  
  if (successful.length > 0) {
    console.log('\n🎉 Working endpoints found! Use these for API calls.');
  } else {
    console.log('\n⚠️  No working endpoints found. Check API configuration.');
  }
  
  return results;
}

// Fungsi untuk test kirim pesan dengan endpoint yang berhasil
async function testSendMessage(baseUrl, phoneNumber = '6281234567890') {
  const endpoints = [
    `${baseUrl}/message/sendText/${EVOLUTION_CONFIG.instanceName}`,
    `${baseUrl}/messages/send`,
    `${baseUrl}/send-message`,
    `${baseUrl}/api/send-message`
  ];
  
  const payload = {
    number: phoneNumber,
    text: 'Test message from truelove instance'
  };
  
  console.log('\n📱 Testing Send Message Endpoints:');
  
  for (const url of endpoints) {
    console.log(`\n🔍