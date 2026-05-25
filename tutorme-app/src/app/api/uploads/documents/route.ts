import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf, handleApiError } from '@/lib/api/middleware'
import type { Session } from 'next-auth'
import path from 'path'
import os from 'os'
import { mkdir, writeFile, access, unlink } from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import { Buffer } from 'buffer'
import { isGcsConfigured, uploadLocalFile, refreshGcsUrl } from '@/lib/storage/gcs'

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
    try {
      const formData = await request.formData()
      const file = formData.get('file')

      // Duck typing to avoid `instanceof File` issues in different Node.js environments
      if (!file || typeof (file as any).arrayBuffer !== 'function') {
        return NextResponse.json({ error: 'File is required' }, { status: 400 })
      }

      const fileObj = file as File

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
      const bytes = Buffer.from(await fileObj.arrayBuffer())
      await writeFile(absolutePath, bytes)

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

      if (isGcsConfigured()) {
        try {
          const gcsKey = `documents/${userId}/${finalName}`
          const uploadResult = await uploadLocalFile(finalPath, gcsKey, finalMime, true)

          // Generate a fresh presigned URL instead of relying on the public URL
          // which may 403 when uniform bucket-level access is enabled
          const signedUrl = await refreshGcsUrl(uploadResult.url, 7 * 24 * 3600)

          // Cleanup temp files
          try {
            await unlink(absolutePath)
            if (convertedToPdf) await unlink(finalPath)
          } catch (e) {
            // Ignore cleanup errors
          }

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
          throw new Error(`GCS Upload Failed: ${uploadError.message}`)
        }
      }

      // Fallback to serving locally if GCS is not configured
      return NextResponse.json({
        url: `/api/serve-upload/documents/${userId}/${finalName}`,
        name: finalName,
        originalUrl: `/api/serve-upload/documents/${userId}/${storedName}`,
        originalName: storedName,
        size: fileObj.size,
        type: finalMime,
        isPdf: finalMime === 'application/pdf',
      })
    } catch (err: any) {
      return handleApiError(err, 'Upload failed', 'api/uploads/documents/route.ts')
    }
  })
)
