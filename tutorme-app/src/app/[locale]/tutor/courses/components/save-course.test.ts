import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the CSRF fetch wrapper so we can assert exactly which endpoints are hit.
const fetchWithCsrf = vi.fn()
vi.mock('@/lib/api/fetch-csrf', () => ({
  fetchWithCsrf: (...args: unknown[]) => fetchWithCsrf(...args),
}))

import { saveCourse } from './save-course'

// jsdom doesn't reliably expose a global localStorage under vitest; provide a
// simple in-memory stub so the draft path (localStorage.setItem) is testable.
const memStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memStore.set(k, v)
  },
  removeItem: (k: string) => {
    memStore.delete(k)
  },
  clear: () => memStore.clear(),
})

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

/** URLs passed to fetchWithCsrf across all calls, in order. */
function calledUrls(): string[] {
  return fetchWithCsrf.mock.calls.map(c => String(c[0]))
}

describe('saveCourse — publish/materialize behaviour', () => {
  beforeEach(() => {
    fetchWithCsrf.mockReset()
    localStorage.clear()
  })

  it('draft mode writes localStorage and hits no API', async () => {
    const res = await saveCourse({
      courseId: 'course-123',
      lessons: [{ id: 'l1' }],
      mode: 'draft',
    })
    expect(res.success).toBe(true)
    expect(fetchWithCsrf).not.toHaveBeenCalled()
    expect(localStorage.getItem('insights-course-builder:course-123')).toContain('l1')
  })

  it('publishing a NEW course with empty lessons creates it and SKIPS the wiping PUT', async () => {
    // The POST create already adds a default lesson; sending an empty PUT would
    // wipe it and trip the server floor guard. saveCourse must skip that PUT.
    fetchWithCsrf.mockResolvedValueOnce(okJson({ courses: [{ id: 'new-db-id' }] }))

    const res = await saveCourse({
      courseId: 'insights-draft',
      lessons: [],
      mode: 'publish',
      courseName: 'Fresh Course',
    })

    expect(res.success).toBe(true)
    expect(res.courseId).toBe('new-db-id')
    const urls = calledUrls()
    expect(urls).toHaveLength(1)
    expect(urls[0]).toBe('/api/tutor/courses')
    expect(urls.some(u => u.endsWith('/course'))).toBe(false)
  })

  it('publishing a NEW course WITH lessons creates it then PUTs the content', async () => {
    fetchWithCsrf
      .mockResolvedValueOnce(okJson({ courses: [{ id: 'new-db-id' }] })) // POST create
      .mockResolvedValueOnce(okJson({ ok: true })) // PUT /course

    const res = await saveCourse({
      courseId: 'insights-draft',
      lessons: [{ id: 'l1' }],
      mode: 'publish',
      courseName: 'Fresh Course',
    })

    expect(res.success).toBe(true)
    expect(res.courseId).toBe('new-db-id')
    const urls = calledUrls()
    expect(urls).toHaveLength(2)
    expect(urls[0]).toBe('/api/tutor/courses')
    expect(urls[1]).toBe('/api/tutor/courses/new-db-id/course')
  })

  it('carries categories into the create payload', async () => {
    fetchWithCsrf.mockResolvedValueOnce(okJson({ courses: [{ id: 'new-db-id' }] }))

    await saveCourse({
      courseId: 'insights-draft',
      lessons: [],
      mode: 'publish',
      courseName: 'Fresh Course',
      categories: ['AP Biology'],
    })

    const createBody = JSON.parse(fetchWithCsrf.mock.calls[0][1].body)
    expect(createBody.categories).toEqual(['AP Biology'])
  })

  it('saving an EXISTING published course PUTs content without creating', async () => {
    fetchWithCsrf.mockResolvedValueOnce(okJson({ ok: true })) // PUT /course only

    const res = await saveCourse({
      courseId: 'real-uuid-123',
      lessons: [{ id: 'l1' }],
      mode: 'live',
      isExistingDbCourse: true,
    })

    expect(res.success).toBe(true)
    const urls = calledUrls()
    expect(urls).toHaveLength(1)
    expect(urls[0]).toBe('/api/tutor/courses/real-uuid-123/course')
  })

  it('publish on an EXISTING DB course PUTs content without creating', async () => {
    // A published course may still carry mode='publish' from some UI states;
    // when isExistingDbCourse is true we must not re-create it.
    fetchWithCsrf.mockResolvedValueOnce(okJson({ ok: true })) // PUT /course only

    const res = await saveCourse({
      courseId: 'existing-pub-123',
      lessons: [{ id: 'l1', title: 'Lesson 1' }],
      mode: 'publish',
      isExistingDbCourse: true,
    })

    expect(res.success).toBe(true)
    const urls = calledUrls()
    expect(urls).toHaveLength(1)
    expect(urls[0]).toBe('/api/tutor/courses/existing-pub-123/course')
  })

  it('propagateToVariants is forwarded in the PUT body for published variants', async () => {
    fetchWithCsrf.mockResolvedValueOnce(okJson({ ok: true }))

    await saveCourse({
      courseId: 'pub-variant-123',
      lessons: [{ id: 'l1' }],
      mode: 'live',
      isExistingDbCourse: true,
      propagateToVariants: true,
    })

    const body = JSON.parse(fetchWithCsrf.mock.calls[0][1].body)
    expect(body.propagateToVariants).toBe(true)
    expect(body.lessons).toEqual([{ id: 'l1' }])
  })

  it('setIndependent is forwarded in the PUT body', async () => {
    fetchWithCsrf.mockResolvedValueOnce(okJson({ ok: true }))

    await saveCourse({
      courseId: 'pub-variant-123',
      lessons: [{ id: 'l1' }],
      mode: 'live',
      isExistingDbCourse: true,
      setIndependent: true,
    })

    const body = JSON.parse(fetchWithCsrf.mock.calls[0][1].body)
    expect(body.setIndependent).toBe(true)
  })

  it('returns the server error message when PUT fails', async () => {
    fetchWithCsrf.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'cannot delete 1 lesson(s) with material deployed' }),
    })

    const res = await saveCourse({
      courseId: 'pub-with-deployments',
      lessons: [{ id: 'l1' }],
      mode: 'live',
      isExistingDbCourse: true,
    })

    expect(res.success).toBe(false)
    expect(res.error).toContain('cannot delete')
  })

  it('draft mode stores developmentMode and previewDifficulty when non-default', async () => {
    await saveCourse({
      courseId: 'draft-123',
      lessons: [{ id: 'l1' }],
      mode: 'draft',
      developmentMode: 'multi',
      previewDifficulty: 'beginner',
    })

    const stored = JSON.parse(localStorage.getItem('insights-course-builder:draft-123') ?? '{}')
    expect(stored.options).toEqual({ developmentMode: 'multi', previewDifficulty: 'beginner' })
  })
})
