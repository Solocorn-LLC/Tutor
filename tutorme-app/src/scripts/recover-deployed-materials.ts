/**
 * Recovery script for corrupted DeployedMaterial rows.
 *
 * Live-session task/assessment deployment could write placeholder rows with
 * title="Untitled" and empty/missing content. This happens when:
 *   - course:sync recreated room.tasks from empty builderData
 *   - task:complete self-healed a missing DeployedMaterial row from a corrupted task
 *   - a re-deploy carried the corrupted in-memory task into the DB
 *
 * This script scans DeployedMaterial, finds corrupted rows, looks up the
 * authoritative source in BuilderTask / CourseLesson.builderData, and rewrites
 * the row with a recovered snapshot while preserving live-only fields.
 *
 * Run with:
 *   cd tutorme-app
 *   npx tsx src/scripts/recover-deployed-materials.ts [--course <courseId>] [--dry-run]
 */

import {
  listCorruptedDeployedMaterials,
  recoverDeployedMaterialRow,
  writeRecoveredSnapshot,
} from '@/lib/classroom/task-recovery'

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const courseFlag = args.findIndex(arg => arg === '--course')
  const courseId = courseFlag >= 0 ? args[courseFlag + 1] : undefined

  if (courseFlag >= 0 && !courseId) {
    console.error(
      'Usage: npx tsx src/scripts/recover-deployed-materials.ts [--course <courseId>] [--dry-run]'
    )
    process.exit(1)
  }

  console.log(
    `Scanning for corrupted DeployedMaterial rows${courseId ? ` for course ${courseId}` : ''}...`
  )
  const corrupted = await listCorruptedDeployedMaterials(courseId)
  console.log(`Found ${corrupted.length} corrupted row(s).`)

  let recovered = 0
  let skipped = 0
  let failed = 0

  for (const row of corrupted) {
    console.log(
      `\n- ${row.itemId} in session ${row.sessionId} (type=${row.type}, title="${row.title}")`
    )

    const snapshot = await recoverDeployedMaterialRow({
      sessionId: row.sessionId,
      courseId: row.courseId,
      itemId: row.itemId,
      type: row.type,
      title: row.title,
      content: row.content,
    })

    if (!snapshot) {
      console.log('  No recoverable source found (skipped).')
      skipped++
      continue
    }

    console.log(`  Recovered title: "${snapshot.title}"`)

    if (dryRun) {
      console.log('  (dry-run — not written)')
      continue
    }

    try {
      await writeRecoveredSnapshot(row.sessionId, row.itemId, snapshot)
      console.log('  Written.')
      recovered++
    } catch (err) {
      console.error('  Failed to write:', err)
      failed++
    }
  }

  console.log(`\nDone. recovered=${recovered} skipped=${skipped} failed=${failed}`)
  if (failed > 0) process.exitCode = 1
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
