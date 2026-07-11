import dns from 'dns/promises'
import net from 'net'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    // Not a well-formed dotted-quad — treat as unsafe rather than "public".
    return true
  }
  const [a, b] = parts
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) || // link-local / cloud metadata (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT (100.64.0.0/10)
  )
}

/**
 * Classify an IP literal as private/loopback/link-local. Handles IPv4, IPv6, and
 * — critically — IPv4-mapped IPv6 (`::ffff:169.254.169.254` and its hex form
 * `::ffff:a9fe:a9fe`), which otherwise bypass a naive IPv4-only check and reach
 * the cloud-metadata endpoint.
 */
function isPrivateIp(ip: string): boolean {
  // Strip an IPv6 zone id, e.g. fe80::1%eth0
  const lower = ip.split('%')[0].toLowerCase()

  if (net.isIPv4(lower)) return isPrivateIpv4(lower)

  // IPv4-mapped / IPv4-compatible IPv6 → extract and classify the embedded IPv4.
  if (lower.startsWith('::ffff:') || lower.startsWith('::')) {
    const rest = lower.replace(/^::(ffff:)?/, '')
    if (rest.includes('.') && net.isIPv4(rest)) return isPrivateIpv4(rest)
    // Hex-encoded mapped form: ::ffff:a9fe:a9fe
    const groups = rest.split(':')
    if (groups.length === 2 && groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) {
      const hi = parseInt(groups[0], 16)
      const lo = parseInt(groups[1], 16)
      const v4 = [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join('.')
      return isPrivateIpv4(v4)
    }
  }

  // Native IPv6 ranges.
  if (lower === '::1') return true // loopback
  if (lower === '::' || lower === '::0') return true // unspecified
  if (/^fe[89ab]/.test(lower)) return true // link-local fe80::/10
  if (/^f[cd]/.test(lower)) return true // unique local fc00::/7
  return false
}

export async function assertSafeProxyUrl(rawUrl: string): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error('Unsupported protocol')
  }

  // URL.hostname keeps the surrounding brackets on IPv6 literals (e.g. "[::1]"),
  // which would make net.isIP() return 0 and skip IP classification entirely.
  const hostname = parsed.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Local hosts are not allowed')
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Private network URLs are not allowed')
    return parsed
  }

  // NOTE: the hostname is resolved and vetted here, but the subsequent fetch
  // re-resolves it, leaving a DNS-rebinding window. Callers should also validate
  // every redirect hop; pinning the vetted IP into the connection is a follow-up.
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some((address) => isPrivateIp(address.address))) {
    throw new Error('Private network URLs are not allowed')
  }

  return parsed
}
