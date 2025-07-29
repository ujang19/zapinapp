#!/usr/bin/env node

/**
 * Script untuk menguji berbagai endpoint Evolution API
 * Mencoba menemukan struktur URL yang benar
 */

const config = {
  baseURLs: [
    'https://core.zapin.tech',
    'https://core.zapin.tech/api',
    'https://core.zapin.tech/evolution',
    'https://core.zapin.tech/v1'
  ],
  globalApiKey: 'yHC2Wulppn5Ej8Nt7Qs9Xm3Kf6Lp2Rv8Bw4Zc1Hg7Jk0',
  instanceName: 'truelove'
};

/**
 * Test endpoint dengan berbagai variasi URL
 */
async function testEndpoint(baseURL, endpoint) {
  const url = `${baseURL}${endpoint}`;
  
  try {
    console.log(`🔍 Testing: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.globalApiKey
      }
    });
    
    const responseText = await response.text();
    
    console.log(`   Status: ${response.status}`);
    if (response.status === 200) {
      console.log(`   ✅ SUCCESS: ${responseText.substring(0, 200)}...`);
      return { success: true, url, response: responseText };
    } else {
      console.log(`   ❌ Error: ${responseText.substring(0, 100)}...`);
      return { success: false, url, error: responseText };
    }
  } catch (error) {
    console.log(`   ❌ Network Error: ${error.message}`);
    return { success: false, url, error: error.message };
  }
}

/**
 * Test berbagai kombinasi endpoint
 */
async function testAllEndpoints() {
  console.log('🚀 Memulai pengujian endpoint Evolution API...\n');
  
  const endpoints = [
    '/instance/connectionState/' + config.instanceName,
    '/instance/connect/' + config.instanceName,
    '/instance/' + config.instanceName,
    '/instances/' + config.instanceName,
    '/api/instance/connectionState/' + config.instanceName,
    '/api/instance/' + config.instanceName,
    '/evolution/instance/connectionState/' + config.instanceName,
    '/evolution/instance/' + config.instanceName,
    '/v1/instance/connectionState/' + config.instanceName,
    '/v1/instance/' + config.instanceName
  ];
  
  const results = [];
  
  for (const baseURL of config.baseURLs) {
    console.log(`\n📡 Testing base URL: ${baseURL}`);
    console.log('=' .repeat(50));
    
    for (const endpoint of endpoints) {
      const result = await testEndpoint(baseURL, endpoint);
      results.push(result);
      
      // Jeda kecil untuk menghindari rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Tampilkan ringkasan hasil
  console.log('\n📊 RINGKASAN HASIL:');
  console.log('=' .repeat(50));
  
  const successfulEndpoints = results.filter(r => r.success);
  
  if (successfulEndpoints.length > 0) {
    console.log('\n✅ ENDPOINT YANG BERHASIL:');
    successfulEndpoints.forEach(result => {
      console.log(`   ${result.url}`);
    });
  } else {
    console.log('\n❌ Tidak ada endpoint yang berhasil.');
    console.log('\n🔍 ENDPOINT YANG DICOBA:');
    results.forEach(result => {
      console.log(`   ${result.url} - Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    });
  }
  
  return successfulEndpoints;
}

/**
 * Test endpoint dasar untuk melihat struktur API
 */
async function testBasicEndpoints() {
  console.log('\n🔧 Testing basic endpoints...');
  
  const basicEndpoints = [
    '',
    '/health',
    '/status',
    '/api',
    '/docs',
    '/swagger'
  ];
  
  for (const baseURL of config.baseURLs) {
    for (const endpoint of basicEndpoints) {
      await testEndpoint(baseURL, endpoint);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🔧 Konfigurasi:');
    console.log(`   Instance Name: ${config.instanceName}`);
    console.log(`   Global API Key: ${config.globalApiKey.substring(0, 10)}...`);
    console.log(`   Base URLs to test: ${config.baseURLs.length}`);
    
    // Test basic endpoints first
    await testBasicEndpoints();
    
    // Test instance-specific endpoints
    const successfulEndpoints = await testAllEndpoints();
    
    if (successfulEndpoints.length > 0) {
      console.log('\n🎉 Berhasil menemukan endpoint yang valid!');
      console.log('\nAnda dapat menggunakan salah satu URL berikut:');
      successfulEndpoints.forEach(result => {
        console.log(`   ${result.url}`);
      });
    } else {
      console.log('\n⚠️  Tidak ada endpoint yang berhasil.');
      console.log('\nKemungkinan penyebab:');
      console.log('   1. API Key tidak valid');
      console.log('   2. Instance name salah');
      console.log('   3. Base URL tidak benar');
      console.log('   4. Instance belum dibuat di Evolution API');
      console.log('   5. Evolution API sedang down');
    }
    
  } catch (error) {
    console.error('❌ Error dalam main function:', error.message);
  }
}

// Jalankan script
if (require.main === module) {
  main();
}

module.exports = { testEndpoint, testAllEndpoints, config };