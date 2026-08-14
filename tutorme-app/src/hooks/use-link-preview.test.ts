import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLinkPreview } from './use-link-preview'

describe('useLinkPreview', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  it('fetches metadata with credentials included', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: 'https://example.com',
        title: 'Example',
        description: 'An example site',
      }),
    })

    const { result } = renderHook(() => useLinkPreview('Check out https://example.com', 0))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/link-preview',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: expect.stringContaining('https://example.com'),
        })
      )
    })

    await waitFor(() => {
      expect(result.current).toHaveLength(1)
      expect(result.current[0].metadata?.title).toBe('Example')
    })
  })
})
