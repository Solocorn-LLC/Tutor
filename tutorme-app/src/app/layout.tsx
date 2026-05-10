import { ReactNode } from 'react'
import { getLocale, getMessages } from 'next-intl/server'
import { Providers } from './components/Providers'
import { PerformanceProviders } from './components/PerformanceProviders'
import './globals.css'

export const metadata = {
  title: {
    default: 'Solocorn - AI-Powered Educational Platform',
    template: '%s | Solocorn',
  },
  description:
    'AI-human hybrid tutoring platform with 24/7 Socratic AI tutoring and live group clinics',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    other: [
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Solocorn',
  },
  other: {
    'theme-color': '#10b981',
    'msapplication-TileColor': '#10b981',
  },
}

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('tutorme-theme');
    var html = document.documentElement;
    if (stored) {
      var parsed = JSON.parse(stored);
      if (parsed.theme) html.setAttribute('data-theme', parsed.theme);
      var mode = parsed.mode || 'system';
      var resolved = mode === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : mode;
      html.classList.add(resolved);
    } else {
      html.setAttribute('data-theme', 'aura');
      html.classList.add('light');
    }
  } catch (e) {}
})();
`

async function getOptimizedLocaleData() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()])
  return { locale, messages }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, messages } = await getOptimizedLocaleData()

  return (
    <html lang={locale} className="font-sans" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover"
        />
        <meta name="theme-color" content="#10b981" />
        <meta name="format-detection" content="telephone=no" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16" />
        <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">
        <Providers locale={locale} messages={messages}>
          <PerformanceProviders>{children}</PerformanceProviders>
        </Providers>
      </body>
    </html>
  )
}
