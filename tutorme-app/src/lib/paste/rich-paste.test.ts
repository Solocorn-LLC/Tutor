import { describe, it, expect, vi } from 'vitest'
import {
  extractImageFiles,
  extractImageSrcs,
  uploadImagesInHtml,
  dataUrlToFile,
  handleRichPaste,
  insertHtmlAtCaret,
} from './rich-paste'

class FakeDataTransferItem {
  constructor(
    public kind: string,
    public type: string,
    private file: File | null
  ) {}
  getAsFile() {
    return this.file
  }
}

class FakeDataTransfer {
  files: File[] = []
  items: FakeDataTransferItem[] = []
  private data: Record<string, string> = {}

  setData(type: string, value: string) {
    this.data[type] = value
  }

  getData(type: string) {
    return this.data[type] ?? ''
  }
}

function makePasteEvent(dt: FakeDataTransfer) {
  return {
    preventDefault: vi.fn(),
    clipboardData: dt as unknown as DataTransfer,
  }
}

describe('extractImageFiles', () => {
  it('returns image files from dataTransfer.files', () => {
    const dt = new FakeDataTransfer()
    const img = new File(['pixels'], 'shot.png', { type: 'image/png' })
    const txt = new File(['text'], 'notes.txt', { type: 'text/plain' })
    dt.files = [txt, img]
    expect(extractImageFiles(dt as unknown as DataTransfer)).toEqual([img])
  })

  it('falls back to dataTransfer.items when files list is empty', () => {
    const dt = new FakeDataTransfer()
    const img = new File(['pixels'], 'shot.png', { type: 'image/png' })
    dt.items = [new FakeDataTransferItem('file', 'image/png', img)]
    expect(extractImageFiles(dt as unknown as DataTransfer)).toEqual([img])
  })

  it('ignores non-image items', () => {
    const dt = new FakeDataTransfer()
    dt.items = [new FakeDataTransferItem('string', 'text/plain', null)]
    expect(extractImageFiles(dt as unknown as DataTransfer)).toEqual([])
  })
})

describe('dataUrlToFile', () => {
  it('converts a base64 data URL into a File', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const file = dataUrlToFile(dataUrl, 'my.png')
    expect(file).not.toBeNull()
    expect(file?.name).toBe('my.png')
    expect(file?.type).toBe('image/png')
    expect(file?.size).toBeGreaterThan(0)
  })

  it('returns null for malformed data URLs', () => {
    expect(dataUrlToFile('not-a-data-url')).toBeNull()
    expect(dataUrlToFile('data:image/png,plain')).toBeNull()
  })
})

describe('extractImageSrcs', () => {
  it('collects unique img src values', () => {
    const html = '<img src="a.png"><img src="b.png"><img src="a.png">'
    expect(extractImageSrcs(html)).toEqual(['a.png', 'b.png'])
  })
})

describe('uploadImagesInHtml', () => {
  it('leaves remote http(s) and relative image URLs untouched', async () => {
    const html = '<img src="https://example.com/x.png"><img src="/local/y.png">'
    const upload = vi.fn()
    const out = await uploadImagesInHtml(html, upload)
    expect(upload).not.toHaveBeenCalled()
    expect(out).toContain('https://example.com/x.png')
    expect(out).toContain('/local/y.png')
  })

  it('uploads data URI images and replaces their src', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const html = `<p><img src="${dataUrl}" alt="x"></p>`
    const upload = vi.fn().mockResolvedValue('/uploaded/x.png')
    const out = await uploadImagesInHtml(html, upload)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(out).toContain('src="/uploaded/x.png"')
    expect(out).not.toContain('data:image')
  })

  it('removes images that fail to upload', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const html = `<p><img src="${dataUrl}" alt="x"></p>`
    const upload = vi.fn().mockRejectedValue(new Error('fail'))
    const out = await uploadImagesInHtml(html, upload)
    expect(out).not.toContain('<img')
  })
})

describe('handleRichPaste', () => {
  it('prevents default and calls onImage for pasted image files', async () => {
    const dt = new FakeDataTransfer()
    const img = new File(['pixels'], 'shot.png', { type: 'image/png' })
    dt.files = [img]
    const event = makePasteEvent(dt)
    const onImage = vi.fn()
    const result = await handleRichPaste(event, { onImage })
    expect(result).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(onImage).toHaveBeenCalledWith(img)
  })

  it('uploads inline data URI images before calling onHtml', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const dt = new FakeDataTransfer()
    dt.setData('text/html', `<p><img src="${dataUrl}" alt="x"></p>`)
    const event = makePasteEvent(dt)
    const onHtml = vi.fn()
    const onUploadImage = vi.fn().mockResolvedValue('/uploaded/x.png')
    const result = await handleRichPaste(event, { onHtml, onUploadImage })
    expect(result).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(onUploadImage).toHaveBeenCalledWith(dataUrl)
    expect(onHtml).toHaveBeenCalled()
    const passedHtml = onHtml.mock.calls[0][0] as string
    expect(passedHtml).toContain('/uploaded/x.png')
    expect(passedHtml).not.toContain('data:image')
  })

  it('falls back to plain text when nothing matches', async () => {
    const dt = new FakeDataTransfer()
    dt.setData('text/plain', 'hello')
    const event = makePasteEvent(dt)
    const onText = vi.fn()
    const result = await handleRichPaste(event, { onText })
    expect(result).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(onText).toHaveBeenCalledWith('hello')
  })
})

describe('insertHtmlAtCaret', () => {
  it('is a no-op when document is undefined', () => {
    const doc = global.document
    // @ts-expect-error testing SSR guard
    global.document = undefined
    expect(() => insertHtmlAtCaret('<br>')).not.toThrow()
    global.document = doc
  })
})
