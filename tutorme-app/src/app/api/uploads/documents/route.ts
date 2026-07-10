import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, handleApiError } from '@/lib/api/middleware'
import type { Session } from 'next-auth'
import path from 'path'
import os from 'os'
import { mkdir, writeFile, access, unlink, readFile } from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import { Buffer } from 'buffer'
import { isGcsConfigured, uploadLocalFile, refreshGcsUrl } from '@/lib/storage/gcs'
import { storeFile } from '@/lib/storage/service'

const execAsync = promisify(exec)

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024

export const runtime = 'nodejs'

const ALLOWED_MIME_PREFIXES = [
  'application/pdf',
  'image/',
  'application/msword',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.',
]

function isAllowedMimeType(type: string): boolean {
  return ALLOWED_MIME_PREFIXES.some(prefix => {
    if (prefix.endsWith('/') || prefix.endsWith('.')) {
      return type.startsWith(prefix)
    }
    return type === prefix
  })
}

function guessMimeTypeFromFileName(fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase()
  switch (ext) {
    case '.pdf':
      return 'application/pdf'
    case '.doc':
      return 'application/msword'
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case '.ppt':
      return 'application/vnd.ms-powerpoint'
    case '.pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    default:
      return null
  }
}

function shouldConvertToPdf(mimeType: string): boolean {
  return (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.ms-powerpoint' ||
    mimeType.startsWith('application/vnd.openxmlformats-officedocument.')
  )
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Convert a document to PDF using LibreOffice (soffice).
 * Returns the absolute path to the generated PDF, or null if conversion fails.
 */
async function convertToPdf(inputPath: string, outputDir: string): Promise<string | null> {
  try {
    const baseArgs = [
      '--headless',
      '--nologo',
      '--nofirststartwizard',
      '--norestore',
      '--nolockcheck',
      '--nodefault',
      '--convert-to',
      'pdf',
      '--outdir',
      outputDir,
      inputPath,
    ]

    try {
      await execAsync(`soffice ${baseArgs.map(a => `"${a}"`).join(' ')}`, {
        timeout: 120000,
        env: { ...process.env, HOME: outputDir },
      })
    } catch {
      await execAsync(`libreoffice ${baseArgs.map(a => `"${a}"`).join(' ')}`, {
        timeout: 120000,
        env: { ...process.env, HOME: outputDir },
      })
    }

    const baseName = path.basename(inputPath, path.extname(inputPath))
    const pdfPath = path.join(outputDir, `${baseName}.pdf`)
    if (await fileExists(pdfPath)) {
      return pdfPath
    }
    return null
  } catch {
    return null
  }
}

export const POST = withCsrf(
  withAuth(async (request: NextRequest, session: Session) => {
    // ── DIAGNOSTIC (temporary) ──────────────────────────────────────────────
    // Stage-by-stage tracing to pinpoint why large PDFs (e.g. a 10.5MB SAT
    // paper) fail to upload while smaller papers succeed. Logs size + each
    // step's elapsed ms and the exact error/stack on failure. Remove once the
    // root cause is fixed. Correlate by the `rid` prefix in Cloud Run logs.
    const rid = `upl_${Date.now().toString(36)}`
    const t0 = Date.now()
    const diag = (stage: string, extra?: Record<string, unknown>) =>
      console.log(
        `[uploads/documents ${rid}] ${stage} (+${Date.now() - t0}ms)`,
        extra ? JSON.stringify(extra) : ''
      )
    let stage = 'start'
    try {
      diag('received request')
      const formData = await request.formData()
      stage = 'parsed-formdata'
      const file = formData.get('file')

      // Duck typing to avoid `instanceof File` issues in different Node.js environments
      if (!file || typeof (file as any).arrayBuffer !== 'function') {
        return NextResponse.json({ error: 'File is required' }, { status: 400 })
      }

      const fileObj = file as File
      diag('parsed formData', {
        name: fileObj.name,
        size: fileObj.size,
        sizeMB: +(fileObj.size / 1048576).toFixed(2),
        type: fileObj.type,
      })

      if (fileObj.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
      }

      const safeName = sanitizeFileName(fileObj.name || 'document')
      const guessedType = guessMimeTypeFromFileName(safeName)
      const providedType = fileObj.type || ''
      const fileType =
        providedType && providedType !== 'application/octet-stream'
          ? providedType
          : guessedType || 'application/octet-stream'

      if (!isAllowedMimeType(fileType)) {
        return NextResponse.json({ error: 'Disallowed file type' }, { status: 400 })
      }

      const timestamp = Date.now()
      const userId = session.user.id
      const relativeDir = path.posix.join('uploads', 'documents', userId)
      const absoluteDir = path.join(os.tmpdir(), 'tutorme_uploads', 'documents', userId)

      await mkdir(absoluteDir, { recursive: true })

      const storedName = `${timestamp}-${safeName}`
      const absolutePath = path.join(absoluteDir, storedName)
      stage = 'buffering'
      const bytes = Buffer.from(await fileObj.arrayBuffer())
      diag('buffered arrayBuffer', { bytes: bytes.length })
      stage = 'writing-temp'
      await writeFile(absolutePath, bytes)
      diag('wrote temp file', { absolutePath })

      let finalPath = absolutePath
      let finalName = storedName
      let finalMime = fileType
      let convertedToPdf = false

      // If the file is not already a PDF, attempt to convert it to PDF.
      if (fileType !== 'application/pdf' && shouldConvertToPdf(fileType)) {
        const pdfAbsolutePath = await convertToPdf(absolutePath, absoluteDir)
        if (pdfAbsolutePath) {
          finalPath = pdfAbsolutePath
          finalName = path.basename(pdfAbsolutePath)
          finalMime = 'application/pdf'
          convertedToPdf = true
        }
      }

      // Cleanup temp files in all paths (success or failure)
      const cleanupTempFiles = async () => {
        try {
          await unlink(absolutePath)
        } catch {
          // Ignore cleanup errors
        }
        if (convertedToPdf) {
          try {
            await unlink(finalPath)
          } catch {
            // Ignore cleanup errors
          }
        }
      }

      if (isGcsConfigured()) {
        try {
          const gcsKey = `documents/${userId}/${finalName}`
          stage = 'gcs-upload'
          diag('gcs upload start', { gcsKey, finalMime, convertedToPdf })
          const uploadResult = await uploadLocalFile(finalPath, gcsKey, finalMime, true)
          diag('gcs upload done')

          // Generate a fresh presigned URL instead of relying on the public URL
          // which may 403 when uniform bucket-level access is enabled
          stage = 'refresh-signed-url'
          const signedUrl = await refreshGcsUrl(uploadResult.url, 7 * 24 * 3600)
          diag('signed url refreshed', { hasUrl: !!signedUrl })

          await cleanupTempFiles()
          diag('SUCCESS (gcs)', { hasUrl: !!signedUrl, key: gcsKey })

          return NextResponse.json({
            url: signedUrl,
            key: gcsKey,
            name: finalName,
            originalUrl: signedUrl,
            originalName: storedName,
            size: fileObj.size,
            type: finalMime,
            isPdf: finalMime === 'application/pdf',
          })
        } catch (uploadError: any) {
          diag('GCS FAILED', {
            stage,
            message: uploadError?.message,
            code: uploadError?.code,
            name: uploadError?.name,
            stack: uploadError?.stack?.split('\n').slice(0, 4).join(' | '),
          })
          await cleanupTempFiles()
          throw new Error(`GCS Upload Failed: ${uploadError.message}`)
        }
      }

      // Fallback to persistent local storage if GCS is not configured
      stage = 'local-store'
      diag('gcs not configured — using local storage')
      const buffer = await readFile(finalPath)
      const storageKey = `documents/${userId}/${finalName}`
      const result = await storeFile(buffer, storageKey, finalMime)
      await cleanupTempFiles()
      diag('SUCCESS (local)', { hasUrl: !!result.url, key: result.key })

      return NextResponse.json({
        url: result.url,
        key: result.key,
        name: finalName,
        originalUrl: result.url,
        originalName: storedName,
        size: fileObj.size,
        type: finalMime,
        isPdf: finalMime === 'application/pdf',
      })
    } catch (err: any) {
      diag('UNCAUGHT FAILURE', {
        stage,
        message: err?.message,
        code: err?.code,
        name: err?.name,
        stack: err?.stack?.split('\n').slice(0, 5).join(' | '),
      })
      return handleApiError(err, 'Upload failed', 'api/uploads/documents/route.ts')
    }
  })
)
