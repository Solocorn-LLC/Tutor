import { describe, it, expect } from 'vitest'
import { assertSafeProxyUrl } from './proxy-url'

// IP-literal hosts skip DNS resolution, so these assertions are deterministic.
describe('assertSafeProxyUrl', () => {
  const blocked = [
    'http://127.0.0.1/',
    'http://10.0.0.1/',
    'http://192.168.1.1/',
    'http://172.16.0.1/',
    'http://169.254.169.254/latest/meta-data/', // cloud metadata
    'http://100.64.0.1/',
    'http://[::1]/',
    'http://[::ffff:169.254.169.254]/', // IPv4-mapped IPv6 — the bypass this fixes
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:a9fe:a9fe]/', // hex-encoded mapped metadata IP
    'http://[fe80::1]/',
    'http://[fc00::1]/',
    'http://localhost/',
    'http://foo.localhost/',
    'ftp://example.com/', // disallowed protocol
    'file:///etc/passwd',
  ]

  const allowed = ['http://8.8.8.8/', 'http://1.1.1.1/', 'http://[2606:4700:4700::1111]/']

  for (const url of blocked) {
    it(`blocks ${url}`, async () => {
      await expect(assertSafeProxyUrl(url)).rejects.toThrow()
    })
  }

  for (const url of allowed) {
    it(`allows ${url}`, async () => {
      await expect(assertSafeProxyUrl(url)).resolves.toBeInstanceOf(URL)
    })
  }
})
