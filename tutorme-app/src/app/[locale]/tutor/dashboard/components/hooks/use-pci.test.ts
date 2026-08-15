import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

import { usePci } from './use-pci'
import { getThread, emptyThread } from './pci-reducer'
import type { PciThread } from './pci-reducer'

const taskTarget = { kind: 'task' as const }

function deps(overrides: Partial<Parameters<typeof usePci>[0]> = {}) {
  return {
    loadedTaskId: 't1',
    loadedAssessmentId: null,
    taskBuilder: {
      activeExtensionId: null,
      extensions: [],
      taskContent: 'content',
      taskPci: '',
      title: 'My Task',
      details: '',
    },
    assessmentBuilder: { taskContent: '', taskPci: '', title: '', details: '' },
    setCurrentPci: vi.fn(),
    taskSourceDocument: undefined,
    currentAssessmentDocument: undefined,
    autoCreateTask: () => ({ id: 't1' }),
    autoCreateAssessment: () => null,
    renderPdfToImages: async () => [],
    pdfPageCache: new Map<string, string[]>(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('usePci', () => {
  it('sends a task message and stores the assistant reply + draft, clears input', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'M1 A1', pciDraft: 'RUBRIC', guardrailWarnings: [] }),
    }) as unknown as typeof fetch

    const { result } = renderHook(() => usePci(deps()))
    act(() => result.current.setPciInput(taskTarget, 'mark by method'))
    await act(async () => {
      await result.current.handlePciSend('task')
    })

    const t = getThread(result.current.pci, taskTarget)
    expect(t.messages).toEqual([
      { role: 'user', content: 'mark by method' },
      { role: 'assistant', content: 'M1 A1' },
    ])
    expect(t.draft).toBe('RUBRIC')
    expect(t.loading).toBe(false)
    expect(t.input).toBe('') // cleared on a real send
  })

  it('does nothing when the input is blank', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    const { result } = renderHook(() => usePci(deps()))
    await act(async () => {
      await result.current.handlePciSend('task')
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks PCI when the task has no content, file, or custom title', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    const { result } = renderHook(() =>
      usePci(
        deps({
          taskBuilder: {
            activeExtensionId: null,
            extensions: [],
            taskContent: '',
            taskPci: '',
            title: 'Task 1',
            details: '',
          },
        })
      )
    )
    act(() => result.current.setPciInput(taskTarget, 'generate content'))
    await act(async () => {
      await result.current.handlePciSend('task')
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      'Add content, upload a file, or edit this item before using the AI assistant.'
    )
  })

  it('records an error hint and stops loading when the request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    }) as unknown as typeof fetch

    const { result } = renderHook(() => usePci(deps()))
    act(() => result.current.setPciInput(taskTarget, 'q'))
    await act(async () => {
      await result.current.handlePciSend('task')
    })

    const t = getThread(result.current.pci, taskTarget)
    expect(t.errorHint).toContain('boom')
    expect(t.loading).toBe(false)
    expect(t.messages.at(-1)?.role).toBe('assistant')
    expect(toast.error).toHaveBeenCalled()
  })

  it('applyTaskPciDraft writes the draft via setCurrentPci and clears it', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'ok', pciDraft: 'FINAL', guardrailWarnings: [] }),
    }) as unknown as typeof fetch
    const setCurrentPci = vi.fn()

    const { result } = renderHook(() => usePci(deps({ setCurrentPci })))
    act(() => result.current.setPciInput(taskTarget, 'q'))
    await act(async () => {
      await result.current.handlePciSend('task')
    })
    act(() => result.current.applyTaskPciDraft())

    // TASK-18: applies the draft AND captures an audit record (approved text +
    // the transcript of tutor turns + the LLM reply).
    expect(setCurrentPci).toHaveBeenCalledWith(
      'task',
      'FINAL',
      expect.objectContaining({
        approvedPci: 'FINAL',
        transcript: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'q' }),
          expect.objectContaining({ role: 'assistant' }),
        ]),
        approvedAt: expect.any(Number),
      })
    )
    expect(getThread(result.current.pci, taskTarget).draft).toBe('')
  })

  it('resetPci clears all threads', async () => {
    const { result } = renderHook(() => usePci(deps()))
    act(() => result.current.setPciInput(taskTarget, 'x'))
    act(() => result.current.resetPci())
    expect(getThread(result.current.pci, taskTarget).input).toBe('')
  })

  it('applyTaskPciDraft carries the structured spec into the audit record (TASK-6)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: 'ok',
        pciDraft: 'FINAL',
        pciSpec: { evaluationLogic: 'Exact match' },
        guardrailWarnings: [],
      }),
    }) as unknown as typeof fetch
    const setCurrentPci = vi.fn()
    const { result } = renderHook(() => usePci(deps({ setCurrentPci })))
    act(() => result.current.setPciInput(taskTarget, 'q'))
    await act(async () => {
      await result.current.handlePciSend('task')
    })
    act(() => result.current.applyTaskPciDraft())
    expect(setCurrentPci).toHaveBeenCalledWith(
      'task',
      'FINAL',
      expect.objectContaining({ spec: { evaluationLogic: 'Exact match' } })
    )
  })

  it('applyAssessmentPciDraft carries the structured spec into the audit record (parity)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: 'ok',
        pciDraft: 'FINAL',
        pciSpec: { evaluationLogic: 'Award method marks' },
        guardrailWarnings: [],
      }),
    }) as unknown as typeof fetch
    const setCurrentPci = vi.fn()
    const assessmentTarget = { kind: 'assessment' as const, id: 'a1' }
    const { result } = renderHook(() =>
      usePci(
        deps({
          loadedAssessmentId: 'a1',
          autoCreateAssessment: () => ({ id: 'a1' }),
          setCurrentPci,
          assessmentBuilder: {
            taskContent: 'assessment content',
            taskPci: '',
            title: 'My Assessment',
            details: '',
          },
        })
      )
    )
    act(() => result.current.setPciInput(assessmentTarget, 'q'))
    await act(async () => {
      await result.current.handlePciSend('assessment')
    })
    act(() => result.current.applyAssessmentPciDraft('a1'))
    expect(setCurrentPci).toHaveBeenCalledWith(
      'assessment',
      'FINAL',
      expect.objectContaining({ spec: { evaluationLogic: 'Award method marks' } })
    )
  })

  it('loads an initial server-side task thread and overrides localStorage', async () => {
    const initialThread: PciThread = {
      ...emptyThread(),
      messages: [
        { role: 'user', content: 'server message' },
        { role: 'assistant', content: 'server reply' },
      ],
    }
    window.localStorage.setItem(
      'tutor-pci-thread:task:t1',
      JSON.stringify({
        ...emptyThread(),
        messages: [{ role: 'user', content: 'local message' }],
      })
    )

    const { result } = renderHook(() => usePci(deps({ initialTaskThread: initialThread })))
    await waitFor(() =>
      expect(getThread(result.current.pci, taskTarget).messages).toEqual(initialThread.messages)
    )
  })

  it('loads an initial server-side assessment thread and overrides localStorage', async () => {
    const assessmentTarget = { kind: 'assessment' as const, id: 'a1' }
    const initialThread: PciThread = {
      ...emptyThread(),
      messages: [{ role: 'assistant', content: 'assessment context' }],
    }
    window.localStorage.setItem(
      'tutor-pci-thread:assessment:a1',
      JSON.stringify({
        ...emptyThread(),
        messages: [{ role: 'user', content: 'local assessment' }],
      })
    )

    const { result } = renderHook(() =>
      usePci(
        deps({
          loadedTaskId: null,
          loadedAssessmentId: 'a1',
          autoCreateAssessment: () => ({ id: 'a1' }),
          initialAssessmentThread: initialThread,
        })
      )
    )
    await waitFor(() =>
      expect(getThread(result.current.pci, assessmentTarget).messages).toEqual(
        initialThread.messages
      )
    )
  })

  it('reports thread changes to onThreadChange after a send', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: 'Assistant reply',
        pciDraft: 'Draft policy',
        guardrailWarnings: [],
      }),
    }) as unknown as typeof fetch
    const onThreadChange = vi.fn()

    const { result } = renderHook(() => usePci(deps({ onThreadChange })))
    act(() => result.current.setPciInput(taskTarget, 'hello'))
    await act(async () => {
      await result.current.handlePciSend('task')
    })

    await waitFor(() => expect(onThreadChange).toHaveBeenCalled())
    const lastCall = onThreadChange.mock.calls.at(-1)
    expect(lastCall?.[0]).toEqual(taskTarget)
    expect(getThread(result.current.pci, taskTarget).messages).toEqual(lastCall?.[1].messages)
  })

  it('reports a cleared task thread after apply', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: 'ok',
        pciDraft: 'FINAL',
        guardrailWarnings: [],
      }),
    }) as unknown as typeof fetch
    const onThreadChange = vi.fn()

    const { result } = renderHook(() => usePci(deps({ onThreadChange })))
    act(() => result.current.setPciInput(taskTarget, 'q'))
    await act(async () => {
      await result.current.handlePciSend('task')
    })
    act(() => result.current.applyTaskPciDraft())

    await waitFor(() => expect(onThreadChange).toHaveBeenCalledTimes(2))
    const lastCall = onThreadChange.mock.calls.at(-1)
    expect(lastCall?.[0]).toEqual(taskTarget)
    expect(getThread(result.current.pci, taskTarget).draft).toBe('')
  })
})
