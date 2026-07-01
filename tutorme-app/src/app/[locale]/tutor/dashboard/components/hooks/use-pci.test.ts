import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

import { usePci } from './use-pci'
import { getThread } from './pci-reducer'

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
    },
    assessmentBuilder: { taskContent: '', taskPci: '', title: '' },
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

beforeEach(() => vi.clearAllMocks())

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
})
