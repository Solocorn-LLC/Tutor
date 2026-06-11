import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from 'next-auth'

const mocks = vi.hoisted(() => ({
  selectMock: vi.fn(),
  tutorHasStudent: vi.fn(),
}))

vi.mock('@/lib/db/drizzle', () => ({
  drizzleDb: { select: mocks.selectMock },
}))

vi.mock('./tutor-student-access', () => ({
  tutorHasStudent: mocks.tutorHasStudent,
}))

import { canReadUploadKey, canDeleteUploadKey } from './upload-access'

function chainable(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  }
}

function makeSession(userId: string, role: string): Session {
  return { user: { id: userId, role, onboardingComplete: true } } as Session
}

describe('canReadUploadKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('documents/{ownerId}/...', () => {
    it('allows the owner', async () => {
      const allowed = await canReadUploadKey(makeSession('user-1', 'STUDENT'), [
        'documents',
        'user-1',
        'file.pdf',
      ])
      expect(allowed).toBe(true)
    })

    it('allows a tutor with that student enrolled', async () => {
      mocks.tutorHasStudent.mockResolvedValue(true)
      const allowed = await canReadUploadKey(makeSession('tutor-1', 'TUTOR'), [
        'documents',
        'student-1',
        'file.pdf',
      ])
      expect(allowed).toBe(true)
      expect(mocks.tutorHasStudent).toHaveBeenCalledWith('tutor-1', 'student-1')
    })

    it('denies an unrelated user', async () => {
      const allowed = await canReadUploadKey(makeSession('student-2', 'STUDENT'), [
        'documents',
        'student-1',
        'file.pdf',
      ])
      expect(allowed).toBe(false)
    })
  })

  describe('submissions/{studentId}/{taskId}/...', () => {
    it('allows the owning student', async () => {
      const allowed = await canReadUploadKey(makeSession('student-1', 'STUDENT'), [
        'submissions',
        'student-1',
        'task-1',
        'file.pdf',
      ])
      expect(allowed).toBe(true)
    })

    it('allows a tutor with that student enrolled', async () => {
      mocks.tutorHasStudent.mockResolvedValue(true)
      const allowed = await canReadUploadKey(makeSession('tutor-1', 'TUTOR'), [
        'submissions',
        'student-1',
        'task-1',
        'file.pdf',
      ])
      expect(allowed).toBe(true)
      expect(mocks.tutorHasStudent).toHaveBeenCalledWith('tutor-1', 'student-1')
    })

    it('denies an unrelated student', async () => {
      const allowed = await canReadUploadKey(makeSession('student-2', 'STUDENT'), [
        'submissions',
        'student-1',
        'task-1',
        'file.pdf',
      ])
      expect(allowed).toBe(false)
    })
  })

  describe('tutors/{tutorId}/resources/...', () => {
    const key = ['tutors', 'tutor-1', 'resources', 'abc.pdf']

    it('allows the owning tutor without a DB lookup', async () => {
      const allowed = await canReadUploadKey(makeSession('tutor-1', 'TUTOR'), key)
      expect(allowed).toBe(true)
      expect(mocks.selectMock).not.toHaveBeenCalled()
    })

    it('allows access to a public/owned resource', async () => {
      mocks.selectMock.mockImplementationOnce(() => chainable([{ resourceId: 'res-1' }]))
      const allowed = await canReadUploadKey(makeSession('other-tutor', 'TUTOR'), key)
      expect(allowed).toBe(true)
    })

    it('allows a recipient the resource was shared with', async () => {
      mocks.selectMock
        .mockImplementationOnce(() => chainable([])) // direct owner/public lookup misses
        .mockImplementationOnce(() => chainable([{ shareId: 'share-1' }])) // resourceShare hit
      const allowed = await canReadUploadKey(makeSession('student-1', 'STUDENT'), key)
      expect(allowed).toBe(true)
    })

    it('denies an unrelated user', async () => {
      mocks.selectMock
        .mockImplementationOnce(() => chainable([]))
        .mockImplementationOnce(() => chainable([]))
      const allowed = await canReadUploadKey(makeSession('student-2', 'STUDENT'), key)
      expect(allowed).toBe(false)
    })
  })

  it('denies unrecognized path patterns by default', async () => {
    const allowed = await canReadUploadKey(makeSession('user-1', 'STUDENT'), [
      'some',
      'other',
      'path.pdf',
    ])
    expect(allowed).toBe(false)
    expect(mocks.selectMock).not.toHaveBeenCalled()
  })
})

describe('canDeleteUploadKey', () => {
  it('allows deleting your own document', () => {
    expect(
      canDeleteUploadKey(makeSession('user-1', 'STUDENT'), 'documents/user-1/file.pdf')
    ).toBe(true)
  })

  it('denies deleting another user document', () => {
    expect(
      canDeleteUploadKey(makeSession('user-1', 'STUDENT'), 'documents/user-2/file.pdf')
    ).toBe(false)
  })

  it('allows a student deleting their own submission', () => {
    expect(
      canDeleteUploadKey(
        makeSession('student-1', 'STUDENT'),
        'submissions/student-1/task-1/file.pdf'
      )
    ).toBe(true)
  })

  it('allows a tutor deleting their own resource', () => {
    expect(
      canDeleteUploadKey(makeSession('tutor-1', 'TUTOR'), 'tutors/tutor-1/resources/abc.pdf')
    ).toBe(true)
  })

  it('denies deleting another tutor resource, even if shared', () => {
    expect(
      canDeleteUploadKey(makeSession('tutor-2', 'TUTOR'), 'tutors/tutor-1/resources/abc.pdf')
    ).toBe(false)
  })

  it('denies unrecognized path patterns by default', () => {
    expect(canDeleteUploadKey(makeSession('user-1', 'STUDENT'), 'some/other/path.pdf')).toBe(
      false
    )
  })
})
