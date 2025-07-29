# Panduan Penggunaan API WhatsApp Instance

## Instance yang Telah Ditambahkan

✅ **Instance berhasil ditambahkan ke user demo@zapin.tech**

### Detail Instance:
- **User**: Demo User (demo@zapin.tech)
- **Tenant**: Default Tenant
- **Instance Name**: truelove
- **Evolution Instance ID**: truelove
- **Evolution Key**: e7c4d979e759250d886fe36b71532a5ccd40d03d7e5e97f893a1303f6ab26218
- **Device ID**: 17bad3dc-b5ce-48d7-b886-25a91af1ec8d
- **Status**: CONNECTED
- **Webhook URL**: http://localhost:3001/webhook/truelove

### Konfigurasi Evolution API:
- **Base URL**: https://core.zapin.tech
- **Global API Key**: 1E5F2A282042-407D-B5D2-15DCEC97C775

## Cara Mengirim API Request

### 1. Menggunakan cURL

#### Cek Status Instance:
```bash
curl -X GET "https://core.zapin.tech/instance/connectionState/truelove" \
  -H "apikey: 1E5F2A282042-407D-B5D2-15DCEC97C775"
```

#### Kirim Pesan Teks:
```bash
curl -X POST "https://core.zapin.tech/message/sendText/truelove" \
  -H "Content-Type: application/json" \
  -H "apikey: 1E5F2A282042-407D-B5D2-15DCEC97C775" \
  -d '{
    "number": "6285723651569",
    "text": "Halo! Ini pesan test dari instance truelove."
  }'
```

#### Kirim Pesan Media:
```bash
curl -X POST "https://core.zapin.tech/message/sendMedia/truelove" \
  -H "Content-Type: application/json" \
  -H "apikey: 1E5F2A282042-407D-B5D2-15DCEC97C775" \
  -d '{
    "number": "6285723651569",
    "mediatype": "image",
    "media": "https://example.com/image.jpg",
    "caption": "Ini adalah gambar test"
  }'
```

### 2. Menggunakan JavaScript/Node.js

```javascript
const EVOLUTION_CONFIG = {
  baseURL: 'https://core.zapin.tech',
  globalApiKey: '1E5F2A282042-407D-B5D2-15DCEC97C775',
  instanceName: 'truelove'
};

// Fungsi untuk mengirim pesan
async function sendMessage(phoneNumber, message) {
  const url = `${EVOLUTION_CONFIG.baseURL}/message/sendText/${EVOLUTION_CONFIG.instanceName}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_CONFIG.globalApiKey
    },
    body: JSON.stringify({
      number: phoneNumber,
      text: message
    })
  });
  
  return await response.json();
}

// Contoh penggunaan
sendMessage('6285723651569', 'Halo dari truelove!')
  .then(result => console.log('Pesan terkirim:', result))
  .catch(error => console.error('Error:', error));
```

### 3. Menggunakan Python

```python
import requests
import json

EVOLUTION_CONFIG = {
    'base_url': 'https://core.zapin.tech',
    'global_api_key': '1E5F2A282042-407D-B5D2-15DCEC97C775',
    'instance_name': 'truelove'
}

def send_message(phone_number, message):
    url = f"{EVOLUTION_CONFIG['base_url']}/message/sendText/{EVOLUTION_CONFIG['instance_name']}"
    
    headers = {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_CONFIG['global_api_key']
    }
    
    payload = {
        'number': phone_number,
        'text': message
    }
    
    response = requests.post(url, headers=headers, json=payload)
    return response.json()

# Contoh penggunaan
result = send_message('6285723651569', 'Halo dari Python!')
print('Pesan terkirim:', result)
```

## Endpoint API yang Tersedia

### Instance Management:
- `GET /instance/connectionState/{instanceName}` - Cek status koneksi
- `GET /instance/fetchInstances` - Ambil semua instance
- `POST /instance/create` - Buat instance baru
- `DELETE /instance/delete/{instanceName}` - Hapus instance

### Messaging:
- `POST /message/sendText/{instanceName}` - Kirim pesan teks
- `POST /message/sendMedia/{instanceName}` - Kirim media
- `POST /message/sendAudio/{instanceName}` - Kirim audio
- `POST /message/sendDocument/{instanceName}` - Kirim dokumen
- `POST /message/sendLocation/{instanceName}` - Kirim lokasi
- `POST /message/sendContact/{instanceName}` - Kirim kontak

### Chat Management:
- `GET /chat/findChats/{instanceName}` - Cari chat
- `GET /chat/findMessages/{instanceName}` - Cari pesan
- `POST /chat/markMessageAsRead/{instanceName}` - Tandai pesan dibaca

### Group Management:
- `POST /group/create/{instanceName}` - Buat grup
- `POST /group/updateGroupPicture/{instanceName}` - Update foto grup
- `POST /group/addParticipant/{instanceName}` - Tambah anggota
- `POST /group/removeParticipant/{instanceName}` - Hapus anggota

## Troubleshooting

### Jika API mengembalikan 404:
1. Pastikan base URL benar
2. Cek apakah instance name sudah benar
3. Verifikasi API key masih valid
4. Coba endpoint alternatif dengan `/v2`:
   ```
   https://core.zapin.tech/v2/instance/connectionState/truelove
   ```

### Jika API mengembalikan 401:
1. Pastikan API key benar
2. Cek apakah API key masih aktif
3. Verifikasi header `apikey` sudah benar

### Jika API mengembalikan 500:
1. Cek apakah instance masih aktif
2. Pastikan device masih terkoneksi
3. Coba restart instance jika perlu

## Webhook Configuration

Instance sudah dikonfigurasi dengan webhook URL:
```
http://localhost:3001/webhook/truelove
```

Webhook akan menerima event:
- QRCODE_UPDATED
- CONNECTION_UPDATE
- MESSAGES_UPSERT
- MESSAGES_UPDATE
- SEND_MESSAGE
- CONTACTS_UPDATE
- Dan lainnya...

## Catatan Penting

1. **Instance sudah CONNECTED** - Tidak perlu scan QR code lagi
2. **Device ID**: 17bad3dc-b5ce-48d7-b886-25a91af1ec8d sudah aktif
3. **Webhook** sudah dikonfigurasi untuk menerima event
4. **Instance key** dapat digunakan untuk autentikasi khusus instance
5. **Nomor telepon** akan terisi otomatis setelah koneksi

## Contoh Response API

### Sukses Kirim Pesan:
```json
{
  "status": 200,
  "message": "Message sent successfully",
  "data": {
    "messageId": "3EB0C767D26A1D8E5C1A",
    "timestamp": 1640995200
  }
}
```

### Error Response:
```json
{
  "status": 400,
  "error": "Bad Request",
  "message": "Invalid phone number format"
}
```

Selamat menggunakan instance WhatsApp **truelove** yang sudah aktif! 🎉