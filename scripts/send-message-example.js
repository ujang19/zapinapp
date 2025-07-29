// Menggunakan fetch API bawaan Node.js (Node 18+)

// Konfigurasi Evolution API
const EVOLUTION_CONFIG = {
  baseURL: 'https://core.zapin.tech',
  globalApiKey: '1E5F2A282042-407D-B5D2-15DCEC97C775',
  instanceName: 'truelove',
  instanceKey: 'e7c4d979e759250d886fe36b71532a5ccd40d03d7e5e97f893a1303f6ab26218'
};

// Fungsi untuk mengirim pesan teks
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
    console.log('Payload:', payload);
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }
    
    console.log('✅ Pesan berhasil dikirim!');
    console.log('Response:', data);
    
    return data;
  } catch (error) {
    console.error('❌ Error mengirim pesan:');
    console.error('Error:', error.message);
    throw error;
  }
}

// Fungsi untuk mendapatkan status instance
async function getInstanceStatus() {
  try {
    const url = `${EVOLUTION_CONFIG.baseURL}/instance/connectionState/${EVOLUTION_CONFIG.instanceName}`;
    
    const options = {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_CONFIG.globalApiKey
      }
    };
    
    console.log('🔍 Mengecek status instance...');
    console.log('URL:', url);
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }
    
    console.log('📊 Status Instance:', data);
    
    return data;
  } catch (error) {
    console.error('❌ Error mengecek status:');
    console.error('Error:', error.message);
    throw error;
  }
}

// Fungsi untuk mendapatkan informasi instance
async function getInstanceInfo() {
  try {
    const url = `${EVOLUTION_CONFIG.baseURL}/instance/fetchInstances`;
    
    const options = {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_CONFIG.globalApiKey
      }
    };
    
    console.log('🔍 Mengambil informasi instance...');
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }
    
    console.log('📋 Informasi Instance:', data);
    
    return data;
  } catch (error) {
    console.error('❌ Error mengambil informasi:');
    console.error('Error:', error.message);
    throw error;
  }
}

// Contoh penggunaan
async function main() {
  try {
    console.log('🔧 Konfigurasi Evolution API:');
    console.log('- Base URL:', EVOLUTION_CONFIG.baseURL);
    console.log('- Instance Name:', EVOLUTION_CONFIG.instanceName);
    console.log('- Global API Key:', EVOLUTION_CONFIG.globalApiKey.substring(0, 10) + '...');
    console.log('');
    
    // Cek status instance
    await getInstanceStatus();
    console.log('');
    
    // Ambil informasi instance
    await getInstanceInfo();
    console.log('');
    
    // Contoh mengirim pesan (uncomment untuk mengirim pesan sungguhan)
    // const phoneNumber = '6285723651569'; // Ganti dengan nomor tujuan
    // const message = 'Halo! Ini pesan test dari instance truelove.';
    // await sendTextMessage(phoneNumber, message);
    
    console.log('✅ Semua operasi selesai!');
    
  } catch (error) {
    console.error('❌ Error dalam main function:', error.message);
  }
}

// Export functions untuk digunakan di tempat lain
module.exports = {
  sendTextMessage,
  getInstanceStatus,
  getInstanceInfo,
  EVOLUTION_CONFIG
};

// Jalankan main function jika script dijalankan langsung
if (require.main === module) {
  main();
}