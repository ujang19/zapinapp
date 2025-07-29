// Simple test to verify apikey header authentication works
// Using built-in fetch (Node.js 18+)

// Test configuration
const BASE_URL = 'http://localhost:3001';
const API_KEY = 'zap_test_api_key_12345678901234567890';

async function testApiKeyAuth() {
  console.log('Testing apikey header authentication...');
  
  try {
    const response1 = await fetch(`${BASE_URL}/api/v1/messages/send`, {
      method: 'POST',
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        number: '+1234567890',
        message: 'Test message with apikey header'
      })
    });
    
    const data1 = await response1.json();
    console.log('✅ apikey header test:', response1.status, response1.statusText);
    console.log('Response:', data1);
  } catch (error) {
    console.log('❌ apikey header test failed:', error.message);
  }
  
  // Test 2: Using Authorization Bearer header (legacy)
  try {
    const response2 = await fetch(`${BASE_URL}/api/v1/messages/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        number: '+1234567890',
        message: 'Test message with Authorization Bearer header'
      })
    });
    
    const data2 = await response2.json();
    console.log('✅ Authorization Bearer test:', response2.status, response2.statusText);
    console.log('Response:', data2);
  } catch (error) {
    console.log('❌ Authorization Bearer test failed:', error.message);
  }
  
  // Test 3: No authentication (should fail)
  try {
    const response3 = await fetch(`${BASE_URL}/api/v1/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        number: '+1234567890',
        message: 'Test message without authentication'
      })
    });
    
    const data3 = await response3.json();
    console.log('❌ No auth test (should fail):', response3.status, response3.statusText);
    console.log('Response:', data3);
  } catch (error) {
    console.log('✅ No auth test correctly failed:', error.message);
   }
}

// Run the tests
if (require.main === module) {
  testApiKeyAuth().catch(error => {
    console.log('❌ Test suite failed:', error.message);
  });
}

module.exports = { testApiKeyAuth };