// Format yang kamu inginkan - SUDAH DIDUKUNG!
const url = 'http://localhost:3001/api/v1/message/sendText/truelove3';
const options = {
  method: 'POST',
  headers: {
    'apikey': 'truelove3-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    "number": "6285723651569",
    "text": "haiiii"
  })
};

// TAMBAHKAN INI untuk eksekusi!
async function sendMessage() {
  try {
    console.log('🚀 Mengirim pesan...');
    console.log('URL:', url);
    console.log('Options:', options);
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    console.log('✅ Response:', data);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Jalankan function
sendMessage();
