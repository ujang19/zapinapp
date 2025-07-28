📌 Tujuan Sistem

Zapin adalah sistem multi-tenant SaaS API gateway untuk WhatsApp berbasis Evolution API v2.2.x. Zapin berperan sebagai layer proxy dan manajemen di atas Evolution API, dengan fokus pada:

Isolasi tenant (pengguna dan data)

API proxy tanpa ubah format

Sistem quota dan rate limiting per tenant

Autentikasi JWT + API Key

Feature flag berbasis paket

Logging, monitoring, dan observability tingkat production

Dukungan webhook, campaign, dan integrasi AI Agent

Zapin hanya mengakses Evolution API dari server internal (proxy), dan user tidak boleh mengetahui atau mengakses core.zapin.tech secara langsung.

🧱 Arsitektur Umum

1. Frontend

Framework: Next.js (App Router) dengan next-enterprise

UI Layer: shadcn/ui + Tremor

Auth: Better Auth dengan JWT, session via Prisma

State Management: React Context + SWR/React Query

Fitur:

Autentikasi

Dashboard multi-tenant

Pengelolaan instance, webhook, AI bot

Quota dan usage stats

API key manager + “Upgrade to access” logic berbasis plan

2. Backend (Proxy API)

Framework: Fastify + TypeScript

Fungsi Utama:

Verifikasi JWT atau API Key

Mapping tenant & instance

Inject evolutionKey (per tenant-instance)

Proxy request ke core.zapin.tech/v2/* tanpa ubah format

Cek quota, log usage

Penting: Tidak boleh mengubah struktur API request/response dari Evolution.

Contoh Proxy Implementation:

fastify.all('/v1/*', async (req, reply) => {
  const evolutionKey = await getEvolutionKey(req.tenant.id);
  const url = `https://core.zapin.tech/v2${req.url.slice(3)}`;
  const result = await fetch(url, {
    method: req.method,
    headers: {
      'Authorization': `apikey ${evolutionKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req.body),
  });
  const data = await result.json();
  reply.code(result.status).send(data);
});

🔐 Otentikasi dan Akses

Better Auth

JWT-based authentication

Role-based access control: superadmin, admin, member

Session management via Prisma sessions table

API Key

Digunakan untuk akses API publik (tanpa login UI)

Setiap tenant bisa buat banyak API key dengan scope, expiry, dan name

Disimpan di table api_keys, direlasikan dengan tenantId

Header Format (Public API)

Authorization: Bearer {API_KEY_TENANT}

🔁 Alur API Request

A. JWT Auth (user login via dashboard)

User login

Kirim request ke https://api.zapin.tech/v1/...

Middleware:

Verifikasi JWT → extract user + tenant

Validasi instance & evolutionKey

Validasi quota (Redis)

Proxy langsung ke core.zapin.tech/v2/...

Response diteruskan tanpa modifikasi

B. Public API (via API Key)

Client kirim request ke https://api.zapin.tech/v1/...

Header: Authorization: Bearer {API_KEY}

Validasi API key → resolve tenant + scope

Proxy + quota + log seperti di atas

Semua request masuk diverifikasi oleh middleware auth + quota checker

🗃️ Database Schema (Prisma + PostgreSQL)

Struktur shared-schema, semua entity pakai tenantId

instances menyimpan evolutionKey (per device)

Tabel penting:

tenants, users, instances, sessions

api_keys, message_logs, usage_stats, feature_flags, ai_bots, webhooks

📊 Quota & Rate Limiting

Disimpan di Redis dengan struktur: quota:{tenantId}:{instanceId}

Gunakan rate-limiter-flexible

Setiap request mencatat usage (untuk statistik + limit)

Header tambahan:

X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 783
X-RateLimit-Reset: 1667267200

🧩 Feature Flag

Disimpan di table feature_flags (relasi ke tenant)

Backend cek flag untuk logic modular

UI menampilkan tombol “Upgrade” jika flag tidak aktif

Lifecycle: aktif → uji → rollout → hapus

📈 Observability

Sentry: error tracking frontend/backend

Prometheus: metrics, RPS, latency

Axiom / Logtail: structured logs (JSON, include tenantId, traceId)

OpenTelemetry: tracing antar modul (opsional)

🚀 CI/CD & Infrastruktur

CI: GitHub Actions → lint, test, build, deploy

Docker: semua service di-containerize

Environments: development, staging, production

Reverse Proxy: Nginx

Process Manager: PM2 atau systemd

✅ Contoh Endpoint Request

Send Text Message (via JWT/API key)

POST /v1/messages/send-text
Authorization: Bearer <JWT or API_KEY>
Content-Type: application/json

{
  "instanceId": "uuid",
  "recipient": "+628123456789",
  "text": "Hello World"
}

➡️ Proxied ke: POST https://core.zapin.tech/v2/messages/send-text

🚫 Aturan Wajib

Backend Zapin tidak boleh mengekspos global key Evolution

Semua permintaan ke core dilakukan dari proxy internal

Tidak boleh mengubah format input/output API Evolution

Semua akses harus melalui middleware validasi Zapin

🧠 Tujuan Akhir Sistem

Menjadi WhatsApp Gateway multi-tenant berbasis Evolution API yang:

Aman & scalable

Mendukung pengelolaan tenant secara fleksibel

Menerapkan quota & observability tingkat production

Siap integrasi AI Bot, campaign, dan plugin 3rd party

