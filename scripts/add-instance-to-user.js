const { PrismaClient } = require('@prisma/client');
const { randomBytes } = require('crypto');

const prisma = new PrismaClient();

// Configuration dari environment variables
const EVOLUTION_API_BASE_URL = "https://core.zapin.tech/v2";
const EVOLUTION_GLOBAL_API_KEY = "yHC2Wulppn9wDp1Qt2JkNF714x3Lj2tY";
const WEBHOOK_BASE_URL = "http://localhost:3001";

// Data instance yang akan ditambahkan
const INSTANCE_DATA = {
  userEmail: 'demo@zapin.tech',
  instanceName: 'truelove',
  deviceId: '17bad3dc-b5ce-48d7-b886-25a91af1ec8d',
  evolutionInstanceId: 'truelove', // Sesuai dengan instance name
  phoneNumber: null, // Akan diisi setelah koneksi
  status: 'CONNECTED', // Karena device sudah aktif
  webhookUrl: `${WEBHOOK_BASE_URL}/webhook/truelove`,
  settings: {
    rejectCall: false,
    msgCall: '',
    groupsIgnore: false,
    alwaysOnline: true,
    readMessages: true,
    readStatus: true,
    syncFullHistory: false,
  }
};

// Generate evolution key
function generateEvolutionKey() {
  return randomBytes(32).toString('hex');
}

async function addInstanceToUser() {
  try {
    console.log('🔍 Mencari user dengan email:', INSTANCE_DATA.userEmail);
    
    // Cari user berdasarkan email
    const user = await prisma.user.findUnique({
      where: { email: INSTANCE_DATA.userEmail.toLowerCase() },
      include: { tenant: true }
    });

    if (!user) {
      throw new Error(`User dengan email ${INSTANCE_DATA.userEmail} tidak ditemukan`);
    }

    if (!user.tenant) {
      throw new Error(`User ${INSTANCE_DATA.userEmail} tidak memiliki tenant`);
    }

    console.log('✅ User ditemukan:', {
      id: user.id,
      name: user.name,
      email: user.email,
      tenantId: user.tenantId,
      tenantName: user.tenant.name
    });

    // Cek apakah instance dengan nama yang sama sudah ada
    const existingInstance = await prisma.instance.findFirst({
      where: {
        tenantId: user.tenantId,
        name: INSTANCE_DATA.instanceName,
        isActive: true,
      },
    });

    if (existingInstance) {
      console.log('⚠️  Instance dengan nama yang sama sudah ada:', existingInstance.id);
      console.log('Instance yang ada:', {
        id: existingInstance.id,
        name: existingInstance.name,
        status: existingInstance.status,
        evolutionInstanceId: existingInstance.evolutionInstanceId
      });
      return;
    }

    // Generate evolution key
    const evolutionKey = generateEvolutionKey();
    
    console.log('🚀 Membuat instance baru...');
    
    // Buat instance di database
    const newInstance = await prisma.instance.create({
      data: {
        name: INSTANCE_DATA.instanceName,
        evolutionKey: evolutionKey,
        evolutionInstanceId: INSTANCE_DATA.evolutionInstanceId,
        phoneNumber: INSTANCE_DATA.phoneNumber,
        status: INSTANCE_DATA.status,
        qrCode: null, // Tidak perlu QR code karena sudah connected
        settings: INSTANCE_DATA.settings,
        webhookUrl: INSTANCE_DATA.webhookUrl,
        isActive: true,
        lastConnectedAt: new Date(), // Set sebagai connected sekarang
        tenantId: user.tenantId,
      },
    });

    console.log('✅ Instance berhasil dibuat:', {
      id: newInstance.id,
      name: newInstance.name,
      evolutionInstanceId: newInstance.evolutionInstanceId,
      evolutionKey: newInstance.evolutionKey,
      status: newInstance.status,
      webhookUrl: newInstance.webhookUrl,
      tenantId: newInstance.tenantId
    });

    console.log('\n📋 Ringkasan:');
    console.log('- User:', user.name, '(' + user.email + ')');
    console.log('- Tenant:', user.tenant.name);
    console.log('- Instance Name:', newInstance.name);
    console.log('- Evolution Instance ID:', newInstance.evolutionInstanceId);
    console.log('- Evolution Key:', newInstance.evolutionKey);
    console.log('- Device ID:', INSTANCE_DATA.deviceId);
    console.log('- Status:', newInstance.status);
    console.log('- Webhook URL:', newInstance.webhookUrl);
    
    console.log('\n🎉 Instance berhasil ditambahkan ke user demo@zapin.tech!');
    
    // Informasi untuk konfigurasi Evolution API
    console.log('\n🔧 Konfigurasi Evolution API:');
    console.log('- Base URL:', EVOLUTION_API_BASE_URL);
    console.log('- Global API Key:', EVOLUTION_GLOBAL_API_KEY);
    console.log('- Instance Name:', newInstance.evolutionInstanceId);
    console.log('- Instance Key:', newInstance.evolutionKey);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Jalankan script
if (require.main === module) {
  addInstanceToUser();
}

module.exports = { addInstanceToUser };