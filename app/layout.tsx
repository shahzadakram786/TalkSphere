import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
  preload: true,
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
  preload: true,
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f172a' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
}

export const metadata: Metadata = {
  title: {
    default: 'TalkSphere - Connect & Communicate',
    template: '%s | TalkSphere',
  },
  description: 'Real-time voice and text communication platform. Join rooms, collaborate, and connect with others instantly.',
  keywords: ['voice chat', 'text communication', 'real-time', 'video call', 'meeting', 'collaboration'],
  authors: [{ name: 'TalkSphere' }],
  creator: 'TalkSphere',
  publisher: 'TalkSphere',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://talksphere.app'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://talksphere.app',
    siteName: 'TalkSphere',
    title: 'TalkSphere - Connect & Communicate',
    description: 'Real-time voice and text communication platform',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'TalkSphere',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TalkSphere',
    description: 'Real-time voice and text communication platform',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/Untitled design/Talksphere-light.png', sizes: '32x32', media: '(prefers-color-scheme: light)' },
      { url: '/Untitled design/Talksphere-dark.png', sizes: '32x32', media: '(prefers-color-scheme: dark)' },
      { url: '/Untitled design/favicon.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-ico.ico',
    shortcut: '/Untitled design/favicon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="font-sans antialiased min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary scrollbar-thin" suppressHydrationWarning>
        <div id="root">
          {children}
        </div>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
