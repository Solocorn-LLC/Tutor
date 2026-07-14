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
    try {
      await execAsync(cmd('soffice'), opts)
    } catch {
      await execAsync(cmd('libreoffice'), opts)
    }

    const pdfPath = path.join(workDir, `${path.basename(inputPath, path.extname(inputPath))}.pdf`)
    try {
      await access(pdfPath)
    } catch {
      return null
    }
    return await readFile(pdfPath)
  } catch {
    return null
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
