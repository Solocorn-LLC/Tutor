/**
 * One-time migration: render LEGACY raw-Office task/assessment source documents
 * to PDF so students get an inline viewer instead of a download-only link.
 *
 * Deploy-time conversion (#1058) fixes an Office `sourceDocument` the moment it
 * is deployed. This proactively fixes the ones that may never be re-deployed —
 * uploads whose LibreOffice conversion failed, and assets predating upload-time
 * conversion — by rendering each to a PDF stored at `<fileKey>.pdf` (the same
 * deterministic key the runtime uses, so the two never diverge) and pointing the
 * stored `builderData` document at it.
 *
 * DRY RUN by default — reports what it WOULD convert and writes nothing. Pass
 * `--apply` to render + store PDFs and update `CourseLesson.builderData`.
 *
 * Run against the target database (needs GCS env for storage too):
 *   DATABASE_URL=... npx tsx src/scripts/convert-legacy-office-docs.ts          # dry run
 *   DATABASE_URL=... npx tsx src/scripts/convert-legacy-office-docs.ts --apply  # convert
 */
import { isNotNull, eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { courseLesson } from '@/lib/db/schema'
import { isOfficeSourceMime, officeToPdfKey, pdfFileName } from '@/lib/documents/ensure-viewable'
import { convertOfficeToPdf } from '@/lib/documents/office-to-pdf'
import { readFileBuffer, storeFile, fileExists } from '@/lib/storage/service'

const APPLY = process.argv.includes('--apply')

type Doc = { fileName?: string; fileUrl?: string; fileKey?: string; mimeType?: string }
type Item = { sourceDocument?: Doc; extensions?: Array<{ sourceDocument?: Doc }> }

const stats = { scanned: 0, office: 0, alreadyDone: 0, converted: 0, failed: 0, skipped: 0 }

// Render one Office doc to PDF and repoint it in place. Returns true if the doc
// object was mutated (or, in dry-run, WOULD be).
async function processDoc(doc: Doc | undefined, label: string): Promise<boolean> {
  if (!doc) return false
  stats.scanned++
  if (!isOfficeSourceMime(doc.mimeType, doc.fileName)) return false
  stats.office++

  if (!doc.fileKey) {
    console.warn(`  · ${label}: Office doc has no fileKey — cannot convert, skipping`)
    stats.skipped++
    return false
  }

  const convertedKey = officeToPdfKey(doc.fileKey)

  if (await fileExists(convertedKey)) {
    // A PDF already exists (runtime already converted it) — just repoint.
    console.log(`  ✓ ${label}: PDF already present (${convertedKey})`)
    stats.alreadyDone++
  } else if (!APPLY) {
    console.log(`  ~ ${label}: WOULD convert ${doc.fileKey} → ${convertedKey}`)
    return true
  } else {
    const input = await readFileBuffer(doc.fileKey)
    if (!input) {
      console.warn(`  ! ${label}: source bytes missing for ${doc.fileKey}, skipping`)
      stats.failed++
      return false
    }
    const pdf = await convertOfficeToPdf(input, doc.fileName || 'document')
    if (!pdf) {
      console.warn(`  ! ${label}: LibreOffice conversion failed for ${doc.fileKey}, skipping`)
      stats.failed++
      return false
    }
    await storeFile(pdf, convertedKey, 'application/pdf')
    console.log(`  ✓ ${label}: converted ${doc.fileKey} → ${convertedKey} (${pdf.length} bytes)`)
    stats.converted++
  }

  if (!APPLY) return true
  doc.fileKey = convertedKey
  doc.mimeType = 'application/pdf'
  doc.fileName = pdfFileName(doc.fileName)
  return true
}

async function run(): Promise<void> {
  console.log(`\n[convert-legacy-office-docs] ${APPLY ? 'APPLY' : 'DRY RUN'} — scanning lessons…\n`)

  const lessons = await drizzleDb
    .select({ lessonId: courseLesson.lessonId, builderData: courseLesson.builderData })
    .from(courseLesson)
    .where(isNotNull(courseLesson.builderData))

  let lessonsChanged = 0

  for (const lesson of lessons) {
    const data = lesson.builderData as Record<string, unknown> | null
    if (!data || typeof data !== 'object') continue

    let changed = false
    for (const bucket of ['tasks', 'assessments', 'homework'] as const) {
      const items = Array.isArray(data[bucket]) ? (data[bucket] as Item[]) : []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const base = `${lesson.lessonId} ${bucket}[${i}]`
        if (await processDoc(item?.sourceDocument, base)) changed = true
        const exts = Array.isArray(item?.extensions) ? item.extensions : []
        for (let e = 0; e < exts.length; e++) {
          if (await processDoc(exts[e]?.sourceDocument, `${base}.ext[${e}]`)) changed = true
        }
      }
    }

    if (changed && APPLY) {
      await drizzleDb
        .update(courseLesson)
        .set({ builderData: data })
        .where(eq(courseLesson.lessonId, lesson.lessonId))
      lessonsChanged++
    } else if (changed) {
      lessonsChanged++
    }
  }

  console.log(`\n─── Summary (${APPLY ? 'APPLY' : 'DRY RUN'}) ───`)
  console.log(`  lessons scanned : ${lessons.length}`)
  console.log(`  lessons w/ changes : ${lessonsChanged}`)
  console.log(`  docs scanned : ${stats.scanned}`)
  console.log(`  office docs : ${stats.office}`)
  console.log(`  already had PDF : ${stats.alreadyDone}`)
  console.log(`  converted : ${stats.converted}`)
  console.log(`  no fileKey (skipped): ${stats.skipped}`)
  console.log(`  failed : ${stats.failed}`)
  if (!APPLY) console.log(`\n  Re-run with --apply to perform the conversions.`)
  console.log('')
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[convert-legacy-office-docs] fatal:', err)
    process.exit(1)
  })
