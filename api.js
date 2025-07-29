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
