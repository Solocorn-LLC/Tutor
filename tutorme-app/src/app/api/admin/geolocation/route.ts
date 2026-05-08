/**
 * IP Geolocation API Route
 * Server-side proxy for ip-api.com to avoid CORS issues
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/middleware'
import { requireAdmin } from '@/lib/admin/auth'
import { Permissions } from '@/lib/admin/permissions'

export interface GeoCoordinates {
  lat: number
  lon: number
  city?: string
  country?: string
  region?: string
}

// Simple in-memory cache (per-request only - use Redis for production)
const geoCache = new Map<string, GeoCoordinates>()
const MAX_GEO_CACHE_ENTRIES = 5000

function parseIPv4(ip: string): number[] | null {
  const parts = ip.trim().split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const value = Number(part)
    if (!Number.isInteger(value) || value < 0 || value > 255) return null
    octets.push(value)
  }
  return octets
}

function isPrivateOrLoopbackIPv4(octets: number[]): boolean {
  const [a, b] = octets
  if (a === 10) return true
  if (a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

function setGeoCache(ip: string, coords: GeoCoordinates) {
  if (geoCache.size >= MAX_GEO_CACHE_ENTRIES) {
    const oldestKey = geoCache.keys().next().value as string | undefined
    if (oldestKey) geoCache.delete(oldestKey)
  }
  geoCache.set(ip, coords)
}

/**
 * GET /api/admin/geolocation?ip=x.x.x.x
 * Fetch geolocation for a single IP
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, Permissions.SECURITY_READ)
  if (!auth.session) return auth.response!

  const ip = request.nextUrl.searchParams.get('ip')

  if (!ip) {
    return NextResponse.json({ error: 'IP address required' }, { status: 400 })
  }

  const parsedIp = parseIPv4(ip)
  if (!parsedIp) {
    return NextResponse.json({ error: 'Invalid IP format' }, { status: 400 })
  }

  // Check cache
  if (geoCache.has(ip)) {
    return NextResponse.json(geoCache.get(ip))
  }

  // Handle private IPs - cannot geolocate
  if (isPrivateOrLoopbackIPv4(parsedIp)) {
    return NextResponse.json({ error: 'Private IP address cannot be geolocated' }, { status: 400 })
  }

  try {
    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,lat,lon,city,country,regionName`,
      {
        signal: AbortSignal.timeout(5000),
        headers: { Accept: 'application/json' },
      }
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    if (data.status !== 'success') {
      return NextResponse.json(
        { error: 'Geolocation lookup failed', status: data.status },
        { status: 404 }
      )
    }

    const coords: GeoCoordinates = {
      lat: data.lat,
      lon: data.lon,
      city: data.city,
      country: data.country,
      region: data.regionName,
    }

    setGeoCache(ip, coords)
    return NextResponse.json(coords)
  } catch (error) {
    console.warn(`Geolocation fetch failed for ${ip}:`, error)
    return NextResponse.json({ error: 'Geolocation service unavailable' }, { status: 503 })
  }
}

/**
 * POST /api/admin/geolocation
 * Batch fetch geolocation for multiple IPs
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, Permissions.SECURITY_READ)
  if (!auth.session) return auth.response!

  try {
    const body = await request.json()
    const { ips } = body as { ips: string[] }

    if (!Array.isArray(ips) || ips.length === 0) {
      return NextResponse.json({ error: 'IPs array required' }, { status: 400 })
    }

    if (ips.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 IPs per request' }, { status: 400 })
    }

    const parsedIps = ips.map(ip => ({ ip, parsed: parseIPv4(ip) }))
    const invalidIps = parsedIps.filter(p => !p.parsed).map(p => p.ip)
    if (invalidIps.length > 0) {
      return NextResponse.json({ error: 'Invalid IP format', invalidIps }, { status: 400 })
    }

    const results = new Map<string, GeoCoordinates>()

    // Process sequentially to respect rate limits
    for (const { ip, parsed } of parsedIps) {
      // Check cache first
      if (geoCache.has(ip)) {
        results.set(ip, geoCache.get(ip)!)
        continue
      }

      // Handle private IPs
      if (parsed && isPrivateOrLoopbackIPv4(parsed)) {
        continue
      }

      try {
        const response = await fetch(
          `http://ip-api.com/json/${ip}?fields=status,lat,lon,city,country,regionName`,
          {
            signal: AbortSignal.timeout(5000),
            headers: { Accept: 'application/json' },
          }
        )

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()

        if (data.status === 'success') {
          const coords: GeoCoordinates = {
            lat: data.lat,
            lon: data.lon,
            city: data.city,
            country: data.country,
            region: data.regionName,
          }
          setGeoCache(ip, coords)
          results.set(ip, coords)
        }
      } catch (error) {
        console.warn(`Geolocation fetch failed for ${ip}:`, error)
      }

      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    return NextResponse.json({ results: Object.fromEntries(results) })
  } catch (error) {
    console.error('Batch geolocation error:', error)
    return handleApiError(error, 'Internal server error', 'api/admin/geolocation/route.ts')
  }
}
