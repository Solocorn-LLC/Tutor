import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDemoRecorder, DEMO_RECORDING_MAX_MS, formatRecordingDuration } from './useDemoRecorder'
import {
  validateDemoVideoFile,
  formatDemoVideoBytes,
  isDemoVideoContentTypeAllowed,
} from './useDemoVideoUpload'

function createMockMediaStream(): MediaStream {
  return {
    getTracks: vi.fn(() => [{ stop: vi.fn() }]),
    getVideoTracks: vi.fn(() => []),
    getAudioTracks: vi.fn(() => []),
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    clone: vi.fn(),
    getTrackById: vi.fn(),
    active: true,
    id: 'mock-stream',
    onaddtrack: null,
    onremovetrack: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaStream
}

let recorderInstance: MockMediaRecorder | null = null

class MockMediaStream {
  getTracks = vi.fn(() => [{ stop: vi.fn() }])
  getVideoTracks = vi.fn(() => [])
  getAudioTracks = vi.fn(() => [])
  addTrack = vi.fn()
  removeTrack = vi.fn()
  clone = vi.fn(() => new MockMediaStream())
  getTrackById = vi.fn()
  active = true
  id = 'mock-stream'
  onaddtrack = null
  onremovetrack = null
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  dispatchEvent = vi.fn()

  constructor(_tracks?: MediaStreamTrack[]) {
    // tracks ignored in mock
  }
}

class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive'
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  private chunks: Blob[] = []
  private stream: MediaStream
  private timeslice?: number

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    this.stream = stream
    this.timeslice = options?.mimeType ? undefined : 1000
  }

  start(timeslice?: number) {
    this.state = 'recording'
    this.timeslice = timeslice
  }

  stop() {
    if (this.state === 'inactive') return
    this.state = 'inactive'
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(this.chunks, { type: 'video/webm' }) } as BlobEvent)
    }
    if (this.onstop) {
      this.onstop()
    }
  }

  pause() {}
  resume() {}
  requestData() {
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(this.chunks, { type: 'video/webm' }) } as BlobEvent)
    }
  }

  addChunk(blob: Blob) {
    this.chunks.push(blob)
  }

  static isTypeSupported(type: string) {
    return type === 'video/webm' || type === 'video/webm;codecs=vp9,opus'
  }
}

class GlobalMockMediaRecorder {
  static isTypeSupported = MockMediaRecorder.isTypeSupported

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    recorderInstance = new MockMediaRecorder(stream, options)
    return recorderInstance as unknown as GlobalMockMediaRecorder
  }

  start(timeslice?: number) {
    recorderInstance?.start(timeslice)
  }

  stop() {
    recorderInstance?.stop()
  }

  pause() {}
  resume() {}
  requestData() {
    recorderInstance?.requestData()
  }

  set ondataavailable(handler: ((event: BlobEvent) => void) | null) {
    if (recorderInstance) recorderInstance.ondataavailable = handler
  }

  get ondataavailable() {
    return recorderInstance?.ondataavailable ?? null
  }

  set onstop(handler: (() => void) | null) {
    if (recorderInstance) recorderInstance.onstop = handler
  }

  get onstop() {
    return recorderInstance?.onstop ?? null
  }

  set onerror(handler: (() => void) | null) {
    if (recorderInstance) recorderInstance.onerror = handler
  }

  get onerror() {
    return recorderInstance?.onerror ?? null
  }

  get state() {
    return recorderInstance?.state ?? 'inactive'
  }
}

describe('useDemoRecorder', () => {
  const originalMediaDevices = navigator.mediaDevices
  let mockCameraStream: MediaStream

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockCameraStream = createMockMediaStream()

    // @ts-expect-error - jsdom does not define mediaDevices
    navigator.mediaDevices = {
      getUserMedia: vi.fn(async () => mockCameraStream),
    }

    // @ts-expect-error - jsdom does not define MediaStream
    global.MediaStream = MockMediaStream

    // @ts-expect-error - replace global MediaRecorder with mock
    global.MediaRecorder = GlobalMockMediaRecorder

    recorderInstance = null
  })

  afterEach(() => {
    vi.useRealTimers()
    // @ts-expect-error
    navigator.mediaDevices = originalMediaDevices
    recorderInstance = null
  })

  it('starts recording and updates state', async () => {
    const { result } = renderHook(() => useDemoRecorder())

    await act(async () => {
      await result.current.startRecording()
    })

    expect(result.current.state).toBe('recording')
    expect(result.current.previewStream).toBeTruthy()
    expect(result.current.error).toBeNull()
  })

  it('stops recording and produces a blob', async () => {
    const { result } = renderHook(() => useDemoRecorder())

    await act(async () => {
      await result.current.startRecording()
    })

    expect(recorderInstance).toBeTruthy()
    recorderInstance?.addChunk(new Blob(['chunk'], { type: 'video/webm' }))

    await act(async () => {
      result.current.stopRecording()
    })

    await waitFor(() => expect(result.current.state).toBe('stopped'))
    expect(result.current.recordedBlob).toBeTruthy()
    expect(result.current.recordedBlob?.type).toMatch(/^video\/webm/)
    expect(result.current.previewStream).toBeNull()
  })

  it('auto-stops at the 10 minute limit', async () => {
    const { result } = renderHook(() => useDemoRecorder())

    await act(async () => {
      await result.current.startRecording()
    })

    expect(result.current.state).toBe('recording')

    await act(async () => {
      vi.advanceTimersByTime(DEMO_RECORDING_MAX_MS + 1000)
    })

    await waitFor(() => expect(result.current.state).toBe('stopped'))
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(DEMO_RECORDING_MAX_MS - 1000)
  })

  it('shows a permission-denied error when getUserMedia rejects', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn(async () => {
      const err = new Error('Permission denied')
      err.name = 'NotAllowedError'
      throw err
    })

    const { result } = renderHook(() => useDemoRecorder())

    await act(async () => {
      await result.current.startRecording()
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toMatch(/Permission denied/)
  })

  it('shows an error when camera/mic access is not available', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn(async () => {
      const err = new Error('No camera found')
      err.name = 'NotFoundError'
      throw err
    })

    const { result } = renderHook(() => useDemoRecorder())

    await act(async () => {
      await result.current.startRecording()
    })

    expect(result.current.state).toBe('error')
  })

  it('reset returns to idle and clears blob', async () => {
    const { result } = renderHook(() => useDemoRecorder())

    await act(async () => {
      await result.current.startRecording()
    })
    recorderInstance?.addChunk(new Blob(['chunk'], { type: 'video/webm' }))
    await act(async () => {
      result.current.stopRecording()
    })

    await waitFor(() => expect(result.current.state).toBe('stopped'))
    expect(result.current.recordedBlob).toBeTruthy()

    await act(async () => {
      result.current.reset()
    })

    expect(result.current.state).toBe('idle')
    expect(result.current.recordedBlob).toBeNull()
  })
})

describe('formatRecordingDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatRecordingDuration(0)).toBe('0:00')
    expect(formatRecordingDuration(65000)).toBe('1:05')
    expect(formatRecordingDuration(10 * 60 * 1000)).toBe('10:00')
  })
})

describe('useDemoVideoUpload utilities', () => {
  it('validates allowed file types', () => {
    const file = new File(['x'], 'video.webm', { type: 'video/webm' })
    expect(validateDemoVideoFile(file)).toBeNull()
    expect(isDemoVideoContentTypeAllowed('video/webm')).toBe(true)
    expect(isDemoVideoContentTypeAllowed('video/avi')).toBe(false)
  })

  it('rejects oversized files', () => {
    const bigFile = new File(['x'], 'video.mp4', { type: 'video/mp4' })
    Object.defineProperty(bigFile, 'size', { value: 1024 * 1024 * 501 })
    expect(validateDemoVideoFile(bigFile)).toMatch(/File size must be under/)
  })

  it('formats bytes', () => {
    expect(formatDemoVideoBytes(0)).toBe('0 B')
    expect(formatDemoVideoBytes(1024)).toBe('1 KB')
    expect(formatDemoVideoBytes(1024 * 1024 * 500)).toBe('500 MB')
  })
})
