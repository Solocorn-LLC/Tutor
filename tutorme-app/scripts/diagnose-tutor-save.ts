/**
 * Diagnostic script for a tutor who cannot save new lessons.
 *
 * Run read-only checks against the DB for a given user and prints any
 * anomalies that could block the course-builder save path.
 *
 *   npx tsx scripts/diagnose-tutor-save.ts --email solocorn@example.com
 *   npx tsx scripts/diagnose-tutor-save.ts --handle @solocorn1
 *   npx tsx scripts/diagnose-tutor-save.ts --userId <uuid>
 */

import { drizzleDb } from '../src/lib/db/drizzle'
import { course, courseLesson, courseVariant, user, profile } from '../src/lib/db/schema'
import { eq, and, isNull, inArray, sql, or } from 'drizzle-orm'

function usage() {
  console.log('Usage: npx tsx scripts/diagnose-tutor-save.ts --email <email> | --handle <handle> | --userId <id>')
  process.exit(1)
}

async function main() {
  const args = process.argv.slice(2)
  const emailIdx = args.indexOf('--email')
  const handleIdx = args.indexOf('--handle')
  const userIdIdx = args.indexOf('--userId')

  let identifier: { type: 'email' | 'handle' | 'userId'; value: string } | null = null
  if (emailIdx !== -1 && args[emailIdx + 1]) {
    identifier = { type: 'email', value: args[emailIdx + 1] }
  } else if (handleIdx !== -1 && args[handleIdx + 1]) {
    identifier = { type: 'handle', value: args[handleIdx + 1].replace(/^@/, '') }
  } else if (userIdIdx !== -1 && args[userIdIdx + 1]) {
    identifier = { type: 'userId', value: args[userIdIdx + 1] }
  }

  if (!identifier) usage()

  console.log(`Looking up user by ${identifier.type}: ${identifier.value}...\n`)

  let userRow: typeof user.$inferSelect | undefined
  if (identifier.type === 'email') {
    const rows = await drizzleDb.select().from(user).where(eq(user.email, identifier.value)).limit(1)
    userRow = rows[0]
  } else if (identifier.type === 'handle') {
    const profileRows = await drizzleDb
      .select({ userId: profile.userId })
      .from(profile)
      .where(eq(profile.username, identifier.value))
      .limit(1)
    if (profileRows[0]) {
      const rows = await drizzleDb.select().from(user).where(eq(user.userId, profileRows[0].userId)).limit(1)
      userRow = rows[0]
    }
  } else {
    const rows = await drizzleDb.select().from(user).where(eq(user.userId, identifier.value)).limit(1)
    userRow = rows[0]
  }

  if (!userRow) {
    console.log('❌ User not found')
    process.exit(1)
  }

  const [profileRow] = await drizzleDb
    .select({ username: profile.username })
    .from(profile)
    .where(eq(profile.userId, userRow.userId))
    .limit(1)

  console.log('User record:')
  console.log(`  id:     ${userRow.userId}`)
  console.log(`  email:  ${userRow.email}`)
  console.log(`  role:   ${userRow.role}`)
  console.log(`  status: ${userRow.status}`)
  console.log(`  handle: ${profileRow?.username ?? '(none)'}`)
  console.log()

  if (userRow.status !== 'active') {
    console.log(`⚠️  Account status is "${userRow.status}". Suspended accounts cannot sign in; a stale session may still appear logged in.\n`)
  }
  if (userRow.role !== 'TUTOR') {
    console.log(`⚠️  User role is "${userRow.role}", not TUTOR. Tutor API endpoints require TUTOR role.\n`)
  }

  const courses = await drizzleDb
    .select({
      courseId: course.courseId,
      name: course.name,
      isPublished: course.isPublished,
      isLiveOnline: course.isLiveOnline,
      deletedAt: course.deletedAt,
      creatorId: course.creatorId,
    })
    .from(course)
    .where(eq(course.creatorId, userRow.userId))

  console.log(`Courses owned: ${courses.length}`)
  if (courses.length === 0) {
    console.log('No courses found for this user.\n')
  }

  const courseIds = courses.map(c => c.courseId)
  const lessonCounts =
    courseIds.length > 0
      ? await drizzleDb
          .select({ courseId: courseLesson.courseId, count: sql<number>`count(*)::int`.as('count') })
          .from(courseLesson)
          .where(inArray(courseLesson.courseId, courseIds))
          .groupBy(courseLesson.courseId)
      : []
  const lessonCountMap = new Map(lessonCounts.map(r => [r.courseId, r.count]))

  const variantRows =
    courseIds.length > 0
      ? await drizzleDb
          .select({
            variantId: courseVariant.variantId,
            templateCourseId: courseVariant.templateCourseId,
            publishedCourseId: courseVariant.publishedCourseId,
          })
          .from(courseVariant)
          .where(
            or(
              inArray(courseVariant.templateCourseId, courseIds),
              inArray(courseVariant.publishedCourseId, courseIds)
            )
          )
      : []

  for (const c of courses) {
    const count = lessonCountMap.get(c.courseId) ?? 0
    const asTemplate = variantRows.filter(v => v.templateCourseId === c.courseId)
    const asPublished = variantRows.filter(v => v.publishedCourseId === c.courseId)
    console.log(`\n  Course: ${c.name} (${c.courseId})`)
    console.log(`    lessons: ${count}, published: ${c.isPublished}, deletedAt: ${c.deletedAt ?? 'null'}`)
    if (asTemplate.length > 0) {
      console.log(`    template for ${asTemplate.length} variant(s)`)
    }
    if (asPublished.length > 0) {
      console.log(`    published variant of ${asPublished[0].templateCourseId}`)
    }
    if (c.creatorId !== userRow.userId) {
      console.log(`    ⚠️ creatorId mismatch: ${c.creatorId}`)
    }
  }

  // Check for variant siblings whose published course is missing or owned by someone else.
  const publishedVariantIds = variantRows.map(v => v.publishedCourseId)
  if (publishedVariantIds.length > 0) {
    const siblingCourses = await drizzleDb
      .select({
        courseId: course.courseId,
        name: course.name,
        creatorId: course.creatorId,
      })
      .from(course)
      .where(inArray(course.courseId, publishedVariantIds))

    const siblingMap = new Map(siblingCourses.map(c => [c.courseId, c]))

    console.log('\n\nVariant sibling check:')
    for (const v of variantRows) {
      const sibling = siblingMap.get(v.publishedCourseId)
      if (!sibling) {
        console.log(`  ⚠️ Variant ${v.variantId} points to missing course ${v.publishedCourseId}`)
      } else if (sibling.creatorId !== userRow.userId) {
        console.log(
          `  ⚠️ Variant ${v.variantId} course ${sibling.courseId} is owned by ${sibling.creatorId ?? 'NULL'}, not this user`
        )
      }
    }
  }

  // Check for any lessons whose courseId no longer exists (orphaned rows).
  if (courseIds.length > 0) {
    const orphans = await drizzleDb.execute(sql`
      SELECT "id" AS "lessonId", "courseId" FROM "CourseLesson"
      WHERE "courseId" = ANY(${courseIds}::text[])
        AND NOT EXISTS (SELECT 1 FROM "Course" c WHERE c."id" = "CourseLesson"."courseId")
    `)
    if ((orphans.rows?.length ?? 0) > 0) {
      console.log(`\n⚠️  ${orphans.rows.length} orphaned lesson(s) reference missing courses for this user.`)
    }
  }

  console.log('\nDone.')
  process.exit(0)
}

main().catch(err => {
  console.error('Diagnostic failed:', err)
  process.exit(1)
})
