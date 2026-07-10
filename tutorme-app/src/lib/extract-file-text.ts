// @ts-nocheck
/**
 * Extract plain text from uploaded files: .txt, .md, .pdf, .docx, .pptx, .xlsx, images (OCR).
 * Used by the course/subject materials upload flow.
 */

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const type = file.type

  // Plain text
  if (
    type === 'text/plain' ||
    type.startsWith('text/') ||
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    name.endsWith('.markdown')
  ) {
    return readAsText(file)
  }

  // PDF
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return extractPdfText(file)
  }

  // Word .docx
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return extractDocxText(file)
  }

  // Legacy .doc
  if (name.endsWith('.doc')) {
    try {
      return await extractDocxText(file)
    } catch {
      return readAsText(file).catch(() => '')
    }
  }

  // PowerPoint .pptx — parse via JSZip as OOXML
  if (
    type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    name.endsWith('.pptx')
  ) {
    return extractPptxText(file)
  }

  // Legacy .ppt — best effort zip parse, fallback to placeholder
  if (name.endsWith('.ppt')) {
    try {
      return await extractPptxText(file)
    } catch {
      return `[PowerPoint file: ${file.name} — save as .pptx for best text extraction]`
    }
  }

  // Excel .xlsx
  if (
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    name.endsWith('.xlsx')
  ) {
    return extractXlsxText(file)
  }

  // Images: OCR
  if (type.startsWith('image/')) {
    return extractImageText(file)
  }

  // Likely unreadable binary formats
  if (
    name.endsWith('.xls') ||
    name.endsWith('.zip') ||
    name.endsWith('.exe') ||
    type.includes('zip') ||
    type.includes('ms-') ||
    type.includes('binary')
  ) {
    return `[Binary file: ${file.name}]`
  }

  // Fallback: try as text
  return readAsText(file).catch(() => `[Imported ${file.name}]`)
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

// Client-side PDF text extraction is best-effort: its output is only a preview /
// fallback (the server re-extracts for DMI generation). It runs *before* the
// upload in the builder, so it must never hang or block the upload on a big,
// many-page document (e.g. a 56-page SAT paper). We therefore cap the pages we
// read and race the whole thing against a hard timeout, returning whatever text
// we've gathered so far rather than stalling.
const PDF_MAX_PAGES = 40
const PDF_EXTRACT_TIMEOUT_MS = 15_000

async function extractPdfText(file: File): Promise<string> {
  const parts: string[] = []

  const run = (async () => {
    const pdfjs = await import('pdfjs-dist')
    if (typeof window !== 'undefined') {
      const opts = (pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } }).GlobalWorkerOptions
      if (opts && !opts.workerSrc) {
        opts.workerSrc = '/pdf.worker.min.mjs'
      }
    }
    const data = await file.arrayBuffer()
    const doc = await pdfjs.getDocument({ data }).promise
    const numPages = Math.min(doc.numPages, PDF_MAX_PAGES)
    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item: { str?: string }) => (item as { str?: string }).str ?? '')
        .join(' ')
      parts.push(pageText)
    }
    return parts.join('\n\n').trim()
  })()

  // If parsing stalls (huge PDF, worker failing to load and falling back to the
  // main thread, etc.), give up after the budget and hand back partial text so
  // the caller can proceed with the upload instead of appearing to freeze.
  const timeout = new Promise<string>(resolve =>
    setTimeout(() => resolve(parts.join('\n\n').trim()), PDF_EXTRACT_TIMEOUT_MS)
  )

  return (await Promise.race([run, timeout])) || ''
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return (result.value || '').trim()
}

/**
 * Extract text from PPTX files.
 * PPTX is an OOXML format — essentially a ZIP file containing XML slide files.
 * Each slide is at ppt/slides/slide{N}.xml and text is in <a:t> elements.
 */
async function extractPptxText(file: File): Promise<string> {
  try {
    const JSZip = (await import('jszip')).default
    const arrayBuffer = await readAsArrayBuffer(file)
    const zip = await JSZip.loadAsync(arrayBuffer)

    // Collect all slide files, sorted by slide number
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] ?? '0')
        const numB = parseInt(b.match(/\d+/)?.[0] ?? '0')
        return numA - numB
      })

    if (slideFiles.length === 0) {
      // Try notes or other XML files inside ppt/
      const fallbackFiles = Object.keys(zip.files).filter(
        n => n.endsWith('.xml') && n.startsWith('ppt/')
      )
      if (fallbackFiles.length === 0) {
        return `[Could not extract text from ${file.name}]`
      }
      slideFiles.push(...fallbackFiles.slice(0, 10))
    }

    const slideTexts: string[] = []

    for (let i = 0; i < slideFiles.length; i++) {
      const slideFile = zip.files[slideFiles[i]]
      const xmlContent = await slideFile.async('string')
      const slideText = extractTextFromXml(xmlContent)
      if (slideText.trim()) {
        slideTexts.push(`--- Slide ${i + 1} ---\n${slideText}`)
      }
    }

    const result = slideTexts.join('\n\n').trim()
    return result || `[No text content found in ${file.name}]`
  } catch (err) {
    console.error('PPTX extraction error:', err)
    return `[Failed to extract text from ${file.name}. Try saving as PDF first.]`
  }
}

/**
 * Strip XML tags and extract text from <a:t> elements in OOXML slide XML.
 * This handles the DrawingML namespace used by all Office formats.
 */
function extractTextFromXml(xml: string): string {
  // Extract content from <a:t> tags (DrawingML text runs)
  const textRuns: string[] = []

  // Match all <a:t>...</a:t> content
  const atMatches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || []
  for (const match of atMatches) {
    const text = match
      .replace(/<a:t[^>]*>/, '')
      .replace(/<\/a:t>/, '')
      .trim()
    if (text) textRuns.push(text)
  }

  // Also look for <t> tags in a broader context (Word-like elements)
  if (textRuns.length === 0) {
    const tMatches = xml.match(/<r:t[^>]*>([^<]*)<\/r:t>/g) || []
    for (const match of tMatches) {
      const text = match
        .replace(/<r:t[^>]*>/, '')
        .replace(/<\/r:t>/, '')
        .trim()
      if (text) textRuns.push(text)
    }
  }

  // Group by paragraphs: detect paragraph breaks from <a:p> boundaries
  // We'll do a simpler approach: extract the raw text and clean it up
  const paragraphs: string[] = []
  const currentParagraph: string[] = []

  const paragraphXml = xml.split(/<a:p[ >]/)

  for (const paraXml of paragraphXml.slice(1)) {
    const runMatches = paraXml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || []
    const paraTextParts: string[] = []
    for (const rm of runMatches) {
      const t = rm.replace(/<a:t[^>]*>/, '').replace(/<\/a:t>/, '')
      if (t) paraTextParts.push(t)
    }
    const paraText = paraTextParts.join('').trim()
    if (paraText) {
      paragraphs.push(paraText)
    }
  }

  if (paragraphs.length > 0) {
    return paragraphs.join('\n')
  }

  // Fallback: just join textRuns
  return textRuns.join(' ')
}

/**
 * Extract text from XLSX files using the exceljs library.
 */
async function extractXlsxText(file: File): Promise<string> {
  try {
    const ExcelJS = await import('exceljs')
    const arrayBuffer = await file.arrayBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(arrayBuffer)
    const lines: string[] = []
    workbook.eachWorksheet(sheet => {
      const sheetLines: string[] = []
      sheet.eachRow(row => {
        const rowText = row.values
          ?.filter((v): v is string | number => v !== null && v !== undefined)
          .join('\t')
        if (rowText) {
          sheetLines.push(rowText)
        }
      })
      if (sheetLines.length > 0) {
        lines.push(`=== Sheet: ${sheet.name} ===`)
        lines.push(...sheetLines)
      }
    })
    return lines.join('\n\n').trim() || `[No text content in ${file.name}]`
  } catch {
    return `[Failed to extract text from ${file.name}]`
  }
}

async function extractImageText(file: File): Promise<string> {
  const mod = await import('tesseract.js')
  const api =
    (
      mod as {
        default?: {
          recognize: (
            image: File,
            lang?: string,
            opts?: object
          ) => Promise<{ data: { text?: string } }>
        }
        recognize?: (
          image: File,
          lang?: string,
          opts?: object
        ) => Promise<{ data: { text?: string } }>
      }
    ).default ?? mod
  const { data } = await api.recognize(file, 'eng', { logger: () => {} })
  return (data?.text || '').trim()
}
