#!/usr/bin/env node

/**
 * Demo script untuk mengirim pesan WhatsApp menggunakan Evolution API
 * Berdasarkan konfigurasi yang sudah terbukti bekerja
 */

// Konfigurasi Evolution API yang sudah terbukti bekerja
const EVOLUTION_CONFIG = {
  baseURL: 'https://core.zapin.tech',
  globalApiKey: '1E5F2A282042-407D-B5D2-15DCEC97C775',
  instanceName: 'truelove'
};

/**
 * Fungsi untuk mengirim pesan teks
 */
async function sendTextMessage(phoneNumber, message) {
  try {
    const url = `${EVOLUTION_CONFIG.baseURL}/message/sendText/${EVOLUTION_CONFIG.instanceName}`;
    
    const payload = {
      number: phoneNumber,
      text: message
    };
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_CONFIG.globalApiKey
      },
      body: JSON.stringify(payload)
    };
    
    console.log('🚀 Mengirim pesan...');
    console.log('URL:', url);
    console.log('Nomor tujuan:', phoneNumber);
    console.log('Pesan:', message);
    console.log('');
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }
    
    console.log('✅ Pesan berhasil dikirim!');
    console.log('Response:', JSON.stringify(data, null, 2));
    
    return data;
  } catch (error) {
    console.error('❌ Error mengirim pesan:');
    console.error('Error:', error.message);
    throw error;
  }
}

/**
 * Fungsi untuk mengirim pesan media (gambar)
 */
async function sendMediaMessage(phoneNumber, mediaUrl, caption = '') {
  try {
    const url = `${EVOLUTION_CONFIG.baseURL}/message/sendMedia/${EVOLUTION_CONFIG.instanceName}`;
    
    const payload = {
      number: phoneNumber,
      mediatype: 'image',
      media: mediaUrl,
      caption: caption
    };
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_CONFIG.globalApiKey
      },
      body: JSON.stringify(payload)
    };
    
    console.log('🖼️ Mengirim media...');
    console.log('URL:', url);
    console.log('Nomor tujuan:', phoneNumber);
    console.log('Media URL:', mediaUrl);
    console.log('Caption:', caption);
    console.log('');
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }
    
    console.log('✅ Media berhasil dikirim!');
    console.log('Response:', JSON.stringify(data, null, 2));
    
    return data;
  } catch (error) {
    console.error('❌ Error mengirim media:');
    console.error('Error:', error.message);
    throw error;
  }
}

/**
 * Fungsi untuk mengecek status instance
 */
async function checkInstanceStatus() {
  try {
    const url = `${EVOLUTION_CONFIG.baseURL}/instance/connectionState/${EVOLUTION_CONFIG.instanceName}`;
    
    const options = {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_CONFIG.globalApiKey
      }
    };
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }
    
    console.log('📊 Status Instance:', data.instance.state);
    return data.instance.state === 'open';
  } catch (error) {
    console.error('❌ Error mengecek status:', error.message);
    return false;
  }
}

/**
 * Demo penggunaan
 */
async function demo() {
  try {
    console.log('🔧 Demo Pengiriman Pesan WhatsApp');
    console.log('=' .repeat(40));
    console.log('Instance:', EVOLUTION_CONFIG.instanceName);
    console.log('Base URL:', EVOLUTION_CONFIG.baseURL);
    console.log('');
    
    // Cek status instance
    console.log('1️⃣ Mengecek status instance...');
    const isConnected = await checkInstanceStatus();
    
    if (!isConnected) {
      console.log('❌ Instance tidak terhubung. Pastikan WhatsApp sudah tersambung.');
      return;
    }
    
    console.log('✅ Instance terhubung!');
    console.log('');
    
    // Contoh 1: Kirim pesan teks
    console.log('2️⃣ Contoh mengirim pesan teks:');
    const phoneNumber = '6285723651569'; // Nomor dari contoh user
    const textMessage = 'Halo! Ini adalah pesan demo dari Evolution API. 🚀';
    
    await sendTextMessage(phoneNumber, textMessage);
    console.log('');
    
    // Contoh 2: Kirim pesan media (uncomment jika ingin mencoba)
    /*
    console.log('3️⃣ Contoh mengirim media:');
    const mediaUrl = 'https://via.placeholder.com/300x200/0066cc/ffffff?text=Demo+Image';
    const caption = 'Ini adalah gambar demo dari Evolution API! 📸';
    
    await sendMediaMessage(phoneNumber, mediaUrl, caption);
    console.log('');
    */
    
    console.log('🎉 Demo selesai!');
    
  } catch (error) {
    console.error('❌ Error dalam demo:', error.message);
  }
}

/**
 * Fungsi untuk mengirim pesan interaktif
 */
async function sendInteractiveMessage() {
  console.log('\n📝 Contoh penggunaan lainnya:');
  console.log('');
  
  // Contoh cURL
  console.log('🔧 Contoh menggunakan cURL:');
  console.log(`curl --request POST \\`);
  console.log(`  --url '${EVOLUTION_CONFIG.baseURL}/message/sendText/${EVOLUTION_CONFIG.instanceName}' \\`);
  console.log(`  --header 'Content-Type: application/json' \\`);
  console.log(`  --header 'apikey: ${EVOLUTION_CONFIG.globalApiKey}' \\`);
  console.log(`  --data '{`);
  console.log(`    "number": "6285723651569",`);
  console.log(`    "text": "Halo dari cURL!"`);
  console.log(`  }'`);
  console.log('');
  
  // Contoh JavaScript
  console.log('💻 Contoh menggunakan JavaScript/Node.js:');
  console.log(`const response = await fetch('${EVOLUTION_CONFIG.baseURL}/message/sendText/${EVOLUTION_CONFIG.instanceName}', {`);
  console.log(`  method: 'POST',`);
  console.log(`  headers: {`);
  console.log(`    'Content-Type': 'application/json',`);
  console.log(`    'apikey': '${EVOLUTION_CONFIG.globalApiKey}'`);
  console.log(`  },`);
  console.log(`  body: JSON.stringify({`);
  console.log(`    number: '6285723651569',`);
  console.log(`    text: 'Halo dari JavaScript!'`);
  console.log(`  })`);
  console.log(`});`);
  console.log('');
}

// Export functions
module.exports = {
  sendTextMessage,
  sendMediaMessage,
  checkInstanceStatus,
  EVOLUTION_CONFIG
};

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('📖 Panduan Penggunaan:');
    console.log('');
    console.log('node demo-send-message.js              - Jalankan demo lengkap');
    console.log('node demo-send-message.js --examples   - Tampilkan contoh kode');
    console.log('node demo-send-message.js --help       - Tampilkan bantuan ini');
    console.log('');
  } else if (args.includes('--examples')) {
    sendInteractiveMessage();
  } else {
    demo();
  }
}