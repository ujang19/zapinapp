import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/toaster'

export const metadata: Metadata = {
  title: 'Zapin - WhatsApp SaaS Platform',
  description: 'Multi-tenant WhatsApp management platform with Evolution API integration',
  keywords: ['whatsapp', 'saas', 'multi-tenant', 'evolution-api', 'messaging'],
  authors: [{ name: 'Zapin Team' }],
  creator: 'Zapin Team',
  publisher: 'Zapin',
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className={`${GeistSans.className} h-full antialiased`}>
        <Providers>
          <Toaster />
          {children}
        </Providers>
      </body>
    </html>
  );
}