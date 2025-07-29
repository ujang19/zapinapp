// Remove the require line since fetch is built-in in Node.js 18+
// const fetch = require('node-fetch'); // Remove this line

const options = {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer truelove3-token',  // Use Bearer instead of apikey
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    number: '6285723651569',
    text: 'haiiii'
  })
};

const url = 'http://localhost:3001/api/v1/message/sendText/truelove3';

console.log('🚀 Mengirim pesan...');
console.log('URL:', url);
console.log('Options:', options);

fetch(url, options)
  .then(response => response.json())
  .then(data => {
    console.log('✅ Response:', data);
  })
  .catch(error => {
    console.error('❌ Error:', error);
  });
