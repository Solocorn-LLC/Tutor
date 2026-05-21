import { withSentryConfig } from '@sentry/nextjs'
import createNextIntlPlugin from 'next-intl/plugin'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/** Same-origin uploads + OAuth avatar hosts. Extend via NEXT_IMAGE_ALLOWED_HOSTNAMES (comma-separated hostnames). */
function imageRemotePatterns() {
  const defaults = [
    'lh3.googleusercontent.com',
    'avatars.githubusercontent.com',
    'platform-lookaside.fbsbx.com',
    'media.licdn.com',
    'cdn.discordapp.com',
    'secure.gravatar.com',
    'image.mux.com',
    '*.public.blob.vercel-storage.com',
  ]
  const fromEnv = (process.env.NEXT_IMAGE_ALLOWED_HOSTNAMES ?? '')
    .split(',')
    .map(h => h.trim())
    .filter(Boolean)
  const hostnames = [...new Set([...defaults, ...fromEnv])]
  return [
    ...hostnames.map(hostname => ({
      protocol: 'https',
      hostname,
      pathname: '/**',
    })),
    { protocol: 'http', hostname: 'localhost', pathname: '/**' },
  ]
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // 7.1 Frontend performance: bundle size and code splitting
  images: {
    remotePatterns: imageRemotePatterns(),
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
  },
  serverExternalPackages: ['pg', 'pg-native', 'jspdf', 'jspdf-autotable', 'mathjax'],
  webpack: (config, { isServer }) => {
    // Fix for jspdf/fflate Node.js worker issue
    // Redirect node-specific fflate to browser version
    config.resolve.alias = {
      ...config.resolve.alias,
      'fflate/lib/node.cjs': false,
      'fflate/lib/node.js': false,
    }

    // Handle jspdf node-specific imports
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      }
    }

    // Ignore optional native dependencies that cause build warnings
    config.externals.push(
      'fast-crc32c',
      'request'
    )

    return config
  },
  // Serve the Vite landing page at root instead of the Next.js App Router page
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/',
          destination: '/index.html',
        },
        {
          source: '/tutor/classroom',
          destination: '/tutor/insights?view=classroom',
        },
        {
          source: '/:locale/tutor/classroom',
          destination: '/:locale/tutor/insights?view=classroom',
        },
      ],
    }
  },

  // Security headers (CSP, X-Frame-Options, etc.) are set by proxy.ts
  // to avoid duplication and ensure consistent policy.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ]
  },
}

const nextIntlConfig = withNextIntl(nextConfig)

// Only wrap with Sentry if org and project are configured
const sentryOrg = process.env.SENTRY_ORG
const sentryProject = process.env.SENTRY_PROJECT

export default sentryOrg && sentryProject
  ? withSentryConfig(nextIntlConfig, {
      org: sentryOrg,
      project: sentryProject,
      silent: !process.env.CI,
    })
  : nextIntlConfig
