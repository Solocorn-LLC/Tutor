/**
 * Convert an Office document (Word / PowerPoint, modern or legacy) to PDF using
 * LibreOffice (`soffice`), which is installed in the runtime image.
 *
 * Unlike pulling embedded images out of the OOXML zip, LibreOffice renders the
 * TRUE document — text, raster images, AND vector shapes / hand-drawn diagrams —
 * and it reads legacy binary .doc/.ppt too. Rasterising the resulting PDF is
 * therefore the only way to let a vision model see every figure regardless of
 * how it was authored.
 *
 * Runs entirely inside a throwaway temp directory that is always cleaned up.
 * Returns the PDF bytes, or null if conversion fails (caller falls back to text).
 */
import path from 'path'
import os from 'os'
import { mkdtemp, writeFile, readFile, rm, access } from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const CONVERT_TIMEOUT_MS = 120_000

export async function convertOfficeToPdf(input: Buffer, fileName: string): Promise<Buffer | null> {
  // Sanitize to a safe basename — the value reaches a shell command line.
  const safeName = (path.basename(fileName) || 'document').replace(/[^a-zA-Z0-9._-]/g, '_')
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'off2pdf-'))
  const inputPath = path.join(workDir, safeName)
  const startedAt = Date.now()

  try {
    await writeFile(inputPath, input)

    const args = [
      '--headless',
      '--nologo',
      '--nofirststartwizard',
      '--norestore',
      '--nolockcheck',
      '--nodefault',
      '--convert-to',
      'pdf',
      '--outdir',
      workDir,
      inputPath,
    ]
    const cmd = (bin: string) => `${bin} ${args.map(a => `"${a}"`).join(' ')}`
    // `soffice` on Debian; fall back to the `libreoffice` alias. HOME is pointed
    // at the temp dir so LibreOffice writes its profile there, not into $HOME.
    const opts = { timeout: CONVERT_TIMEOUT_MS, env: { ...process.env, HOME: workDir } }
    // Grab a short tail of the failure output — soffice reports unsupported
    // formats / crashes there, which is otherwise invisible in production.
    const detail = (e: unknown): string => {
      const err = e as { message?: string; stderr?: string }
      return (err?.stderr || err?.message || String(e)).slice(0, 300).replace(/\s+/g, ' ').trim()
    }
    let binary = 'soffice'
    try {
      await execAsync(cmd('soffice'), opts)
    } catch (sofficeErr) {
      console.warn(
        `[office-to-pdf] soffice failed for ${safeName}, retrying via libreoffice: ${detail(sofficeErr)}`
      )
      binary = 'libreoffice'
      try {
        await execAsync(cmd('libreoffice'), opts)
      } catch (libreErr) {
        console.error(
          `[office-to-pdf] LibreOffice conversion FAILED for ${safeName} (${input.length} bytes): ${detail(libreErr)}`
        )
        return null
      }
    }

    const pdfPath = path.join(workDir, `${path.basename(inputPath, path.extname(inputPath))}.pdf`)
    try {
      await access(pdfPath)
    } catch {
      console.error(
        `[office-to-pdf] ${binary} ran but produced no PDF for ${safeName} (${input.length} bytes)`
      )
      return null
    }
    const pdf = await readFile(pdfPath)
    console.info(
      `[office-to-pdf] converted ${safeName} via ${binary}: ${input.length} → ${pdf.length} bytes in ${Date.now() - startedAt}ms`
    )
    return pdf
  } catch (err) {
    console.error(
      `[office-to-pdf] unexpected error converting ${safeName}:`,
      err instanceof Error ? err.message : err
    )
    return null
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
