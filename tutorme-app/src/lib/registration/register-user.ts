import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { eq, sql } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  user,
  profile,
  familyAccount,
  familyMember,
  emergencyContact,
  tutorApplication,
} from '@/lib/db/schema'
import { RegisterUserSchema, type RegisterUserInput } from '@/lib/validation/schemas'
import {
  tutorAdditionalDataSchema,
  tutorProfileDataSchema,
} from '@/lib/validation/user-registration'
import { ValidationError } from '@/lib/api/middleware'
import { sanitizeHtml } from '@/lib/security/sanitize'
import { checkRateLimit, getClientIdentifier, RATE_LIMIT_PRESETS } from '@/lib/security/rate-limit'
import {
  verifyAllChildren,
  isStudentAlreadyLinked,
  type VerifiedStudent,
} from '@/lib/security/parent-child-queries'
import type { StudentLinkingInput } from '@/lib/validation/parent-child-security'
import {
  HANDLE_REGEX,
  assertValidHandle,
  normalizeHandle,
  isReservedHandle,
} from '@/lib/mentions/handles'
import type { NextRequest } from 'next/server'

const MAX_AVATAR_SIZE_BYTES = 10 * 1024 * 1024

function normalizeHandleSeed(seed: string): string {
  const cleaned = seed
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (cleaned.length >= 3) return cleaned.slice(0, 30)
  return `user${nanoid(6).toLowerCase()}`.slice(0, 30)
}

async function generateUniqueHandle(
  checkExists: (handle: string) => Promise<boolean>,
  preferred: string
): Promise<string> {
  const base = normalizeHandleSeed(preferred)
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const suffix = attempt === 0 ? '' : String(Math.floor(Math.random() * 9000) + 1000)
    const candidate = `${base}${suffix}`.slice(0, 30)
    if (!HANDLE_REGEX.test(candidate) || isReservedHandle(candidate)) continue
    const exists = await checkExists(candidate)
    if (!exists) return candidate
  }
  return `user${nanoid(8).toLowerCase()}`.slice(0, 30)
}

/**
 * Validate image magic bytes to ensure the file is actually an image.
 * Pure-JS validation — no native dependencies required.
 */
function validateImageMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 12) return false

  if (mimeType === 'image/webp') {
    return (
      buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
      buffer.slice(8, 12).toString('ascii') === 'WEBP'
    )
  }

  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    )
  }

  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8
  }

  return false
}

/**
 * Save an avatar image for a user.
 *
 * The client is expected to perform all cropping/resizing (via Canvas) before
 * uploading. The server only validates magic bytes and stores the file.
 *
 * @param userId  The user's ID
 * @param avatarFile  The cropped image File/Blob from the client
 * @returns  Public URL path for the saved avatar
 */
export async function saveAvatar(
  userId: string,
  avatarFile: File
): Promise<string> {
  if (avatarFile.size > MAX_AVATAR_SIZE_BYTES) {
    throw new ValidationError('Profile photo is too large (max 10MB)')
  }

  const acceptedMimes = new Set(['image/jpeg', 'image/png', 'image/webp'])
  if (avatarFile.type && !acceptedMimes.has(avatarFile.type)) {
    throw new ValidationError('Accepted formats: JPG, PNG, WEBP only')
  }

  const bytes = Buffer.from(await avatarFile.arrayBuffer())

  if (!validateImageMagicBytes(bytes, avatarFile.type)) {
    throw new ValidationError('Invalid image file')
  }

  const timestamp = Date.now()
  const baseName = `${timestamp}-avatar`
  const ext = avatarFile.type === 'image/png' ? 'png' : avatarFile.type === 'image/jpeg' ? 'jpg' : 'webp'

  // Store in DB as a shadow fallback (survives GCS hiccups / eventual consistency).
  let dbStored = false
  let dbErrorMsg = ''
  try {
    const base64Data = bytes.toString('base64')
    const dataUrl = `data:${avatarFile.type};base64,${base64Data}`
    const { avatarStorage } = await import('@/lib/db/schema')
    await drizzleDb
      .insert(avatarStorage)
      .values({ userId, data: dataUrl })
      .onConflictDoUpdate({
        target: avatarStorage.userId,
        set: { data: dataUrl, updatedAt: new Date() },
      })
    dbStored = true
  } catch (dbError: any) {
    dbErrorMsg = dbError?.message || String(dbError)
    console.warn('[saveAvatar] DB storage failed:', dbErrorMsg)
  }

  // Try GCS for cloud persistence.
  let gcsStored = false
  let gcsErrorMsg = ''
  const { isGcsConfigured, uploadBuffer } = await import('@/lib/storage/gcs')
  if (isGcsConfigured()) {
    const gcsPrefix = `avatars/${userId}/${baseName}`
    try {
      await uploadBuffer(bytes, `${gcsPrefix}-256.${ext}`, avatarFile.type, true)
      gcsStored = true
    } catch (error: any) {
      gcsErrorMsg = error?.message || String(error)
      console.warn('[saveAvatar] GCS upload failed:', gcsErrorMsg)
    }
  } else {
    gcsErrorMsg = 'GCS not configured (GCS_BUCKET env var missing)'
  }

  if (!dbStored && !gcsStored) {
    throw new ValidationError(
      `Storage failed — DB: ${dbErrorMsg || 'unknown'} | GCS: ${gcsErrorMsg || 'unknown'}`
    )
  }

  return `/api/public/avatar/${userId}/${baseName}-256.${ext}`
}

/**
 * Delete a previously saved avatar from storage (GCS or local filesystem).
 *
 * @param deleteFromDb - When false, skips deleting from avatarStorage. Use false
 *   during avatar replacement because saveAvatar already overwrites the DB row
 *   via onConflictDoUpdate; deleting afterward would remove the new avatar.
 */
export async function deleteAvatar(
  avatarUrl: string | null | undefined,
  options?: { deleteFromDb?: boolean }
): Promise<void> {
  if (!avatarUrl || typeof avatarUrl !== 'string') return

  const deleteFromDb = options?.deleteFromDb !== false

  // GCS deletion
  if (avatarUrl.includes('storage.googleapis.com')) {
    try {
      const { isGcsConfigured, deleteObject } = await import('@/lib/storage/gcs')
      if (!isGcsConfigured()) return
      const bucketName = process.env.GCS_BUCKET || ''
      const prefix = `https://storage.googleapis.com/${bucketName}/`
      if (avatarUrl.startsWith(prefix)) {
        const key = avatarUrl.slice(prefix.length)
        if (key) {
          await deleteObject(key)
          // Also delete the sibling sizes (128, 64) if they exist
          const key128 = key.replace('-256.webp', '-128.webp')
          const key64 = key.replace('-256.webp', '-64.webp')
          await deleteObject(key128).catch(() => {})
          await deleteObject(key64).catch(() => {})
        }
      }
    } catch {
      // Ignore cleanup errors
    }
    return
  }

  // Local filesystem deletion (legacy public path)
  if (avatarUrl.startsWith('/uploads/avatars/')) {
    try {
      const path = await import('path')
      const { unlink } = await import('fs/promises')
      const safeRelative = avatarUrl.replace(/^\/+/, '')
      const localPath = path.join(process.cwd(), 'public', safeRelative)
      await unlink(localPath)
      // Also delete sibling sizes
      const local128 = localPath.replace('-256.webp', '-128.webp')
      const local64 = localPath.replace('-256.webp', '-64.webp')
      await unlink(local128).catch(() => {})
      await unlink(local64).catch(() => {})
    } catch {
      // Ignore cleanup errors
    }
    return
  }

  // Database + local filesystem deletion (new public avatar API path).
  // Also handles absolute URLs like https://domain.com/api/public/avatar/...
  const publicAvatarPath = '/api/public/avatar/'
  const hasPublicAvatarPath =
    avatarUrl.startsWith(publicAvatarPath) || avatarUrl.includes(publicAvatarPath)
  if (hasPublicAvatarPath) {
    try {
      // Extract the relative part after /api/public/avatar/
      const relativePart = avatarUrl.includes(publicAvatarPath)
        ? avatarUrl.slice(avatarUrl.indexOf(publicAvatarPath) + publicAvatarPath.length)
        : avatarUrl.replace(publicAvatarPath, '')

      // Extract userId from path: /api/public/avatar/{userId}/{filename}
      const parts = relativePart.split('/')
      const userIdFromUrl = parts[0]

      // Only delete from avatarStorage when explicitly requested (e.g., user
      // deletes their avatar). During replacement, saveAvatar already overwrites
      // the row via onConflictDoUpdate, so deleting here would wipe the new avatar.
      if (deleteFromDb && userIdFromUrl) {
        const { avatarStorage } = await import('@/lib/db/schema')
        await drizzleDb.delete(avatarStorage).where(eq(avatarStorage.userId, userIdFromUrl)).catch(() => {})
      }

      const { isGcsConfigured, deleteObject } = await import('@/lib/storage/gcs')
      if (isGcsConfigured()) {
        const key = `avatars/${relativePart}`
        await deleteObject(key).catch(() => {})
        await deleteObject(key.replace('-256.webp', '-128.webp')).catch(() => {})
        await deleteObject(key.replace('-256.webp', '-64.webp')).catch(() => {})
      }

      const path = await import('path')
      const os = await import('os')
      const { unlink } = await import('fs/promises')
      const safeRelative = relativePart
        .split('/')
        .filter(Boolean)
        .filter(segment => !segment.includes('..'))
        .join(path.sep)
      if (!safeRelative) return
      const localPath = path.join(os.tmpdir(), 'tutorme_uploads', 'avatars', safeRelative)
      await unlink(localPath).catch(() => {})
      const local128 = localPath.replace('-256.webp', '-128.webp')
      const local64 = localPath.replace('-256.webp', '-64.webp')
      await unlink(local128).catch(() => {})
      await unlink(local64).catch(() => {})
    } catch {
      // Ignore cleanup errors
    }
  }
}

export interface RegistrationResult {
  status: number
  body: Record<string, unknown>
  headers?: Record<string, string>
}

// Helper to insert tutor application
async function insertTutorApplication(
  tx: typeof drizzleDb,
  values: {
    applicationId: string
    userId: string
    firstName: string
    middleName: string | null
    lastName: string
    legalName: string | null
    countryOfResidence: string
    phoneCountryCode: string
    phoneNumber: string
    educationLevel: string
    hasTeachingCertificate: boolean
    certificateName: string | null
    certificateSubjects: string | null
    tutoringExperienceRange: string
    globalExams: unknown
    tutoringCountries: string[]
    countrySubjectSelections: Record<string, string[]>
    categories: string[]
    username: string
    socialLinks: unknown
  }
) {
  await tx.insert(tutorApplication).values(values)
}

export async function performRegistration(
  request: NextRequest,
  payload: RegisterUserInput,
  options?: { avatarFile?: File | null }
): Promise<RegistrationResult> {
  const parsed = RegisterUserSchema.safeParse(payload)
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ')
    return { status: 400, body: { error: messages } }
  }

  const data = parsed.data
  const { email, password, role } = data
  const name = sanitizeHtml(data.name).trim().slice(0, 100) || 'User'
  const normalizedEmail = email.toLowerCase()

  const clientId = getClientIdentifier(request)
  const registerOptions = RATE_LIMIT_PRESETS.register
  const scopedRateLimit = await checkRateLimit(
    `register:${clientId}:${String(role).toUpperCase()}:${normalizedEmail}`,
    registerOptions
  )
  if (!scopedRateLimit.allowed) {
    return {
      status: 429,
      body: {
        error: 'Too many requests. Please try again later.',
        rateLimit: {
          remaining: scopedRateLimit.remaining,
          resetAt: Math.ceil(scopedRateLimit.resetAt / 1000),
        },
      },
      headers: {
        'X-RateLimit-Remaining': String(scopedRateLimit.remaining),
        'X-RateLimit-Reset': String(Math.ceil(scopedRateLimit.resetAt / 1000)),
      },
    }
  }

  let verifiedStudents: Map<number, VerifiedStudent> | undefined

  const [existingUser] = await drizzleDb
    .select()
    .from(user)
    .where(eq(user.email, normalizedEmail))
    .limit(1)
  if (existingUser) {
    throw new ValidationError('Email already registered')
  }

  if (role === 'PARENT') {
    const additionalData = data.additionalData as
      | {
          students?: StudentLinkingInput[]
          emergencyContacts?: Array<{ name: string; relationship: string; phone: string }>
        }
      | undefined
    if (additionalData?.students?.length) {
      const { verified, errors } = await verifyAllChildren(additionalData.students)
      if (errors.length > 0) {
        const msg = errors.map(e => `Child ${e.index + 1}: ${e.message}`).join('; ')
        return { status: 400, body: { error: msg } }
      }
      verifiedStudents = verified
      for (const [, student] of verified) {
        if (await isStudentAlreadyLinked(student.userId)) {
          return {
            status: 400,
            body: {
              error: `Student ${student.email} is already linked to another parent account.`,
            },
          }
        }
      }
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  const newUser = await drizzleDb.transaction(async tx => {
    const userId = crypto.randomUUID()
    const now = new Date()

    const checkHandle = async (handle: string) => {
      const [existing] = await tx
        .select({ userId: user.userId })
        .from(user)
        .where(eq(user.handle, handle))
        .limit(1)
      return !!existing
    }

    let desiredHandle: string | null = null
    if (role === 'TUTOR') {
      const tutorData = tutorAdditionalDataSchema.parse(data.additionalData)
      const normalizedHandle = normalizeHandle(tutorData.username)
      if (!normalizedHandle) {
        throw new ValidationError('Handle is required')
      }
      assertValidHandle(normalizedHandle)
      if (await checkHandle(normalizedHandle)) {
        throw new ValidationError('Handle already taken')
      }
      desiredHandle = normalizedHandle
    }

    const fallbackSeed = name || normalizedEmail.split('@')[0] || 'user'
    const finalHandle = desiredHandle ?? (await generateUniqueHandle(checkHandle, fallbackSeed))

    await tx.insert(user).values({
      userId,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      handle: finalHandle,
      createdAt: now,
      updatedAt: now,
    })

    const profileData =
      role === 'TUTOR' ? tutorProfileDataSchema.parse(data.profileData) : undefined

    // Build profile insert data - ensure all nullable fields are explicitly null
    const profileInsertData = {
      profileId: crypto.randomUUID(),
      userId,
      name,
      username: finalHandle,
      bio: null,
      avatarUrl: null,
      dateOfBirth: null,
      timezone: profileData?.timezone ?? 'Asia/Shanghai',
      emailNotifications: true,
      smsNotifications: false,
      studentUniqueId: role === 'STUDENT' ? `STU-${nanoid(12)}` : null,
      subjectsOfInterest: [],
      preferredLanguages: profileData?.preferredLanguage ? [profileData.preferredLanguage] : [],
      learningGoals: [],
      tosAccepted: data.tosAccepted === true,
      tosAcceptedAt: new Date(),
      organizationName: null,
      isOnboarded: role !== 'TUTOR',
      hourlyRate: null,
      oneOnOneEnabled: false,
      credentials: null,
      availability: null,
      paidClassesEnabled: false,
      paymentGatewayPreference: null,
      currency: null,
      nationality: profileData?.nationality ?? null,
      countryOfResidence: null,
      createdAt: now,
      updatedAt: now,
    }

    await tx.insert(profile).values(profileInsertData as any)

    if (role === 'TUTOR') {
      const tutorData = tutorAdditionalDataSchema.parse(data.additionalData)
      const credentialParts: string[] = [tutorData.educationLevel]
      if (tutorData.hasTeachingCertificate && tutorData.certificateName) {
        credentialParts.push(`Certificate: ${tutorData.certificateName}`)
      }
      if (tutorData.certificateSubjects) {
        credentialParts.push(`Qualified subjects: ${tutorData.certificateSubjects}`)
      }
      await tx
        .update(profile)
        .set({
          credentials: credentialParts.join(' | ').slice(0, 2000) || null,
          hourlyRate: typeof tutorData.hourlyRate === 'number' ? tutorData.hourlyRate : null,
          countryOfResidence: tutorData.countryOfResidence || null,
          isOnboarded: false,
        })
        .where(eq(profile.userId, userId))

      const tutorApplicationValues = {
        applicationId: crypto.randomUUID(),
        userId,
        firstName: tutorData.firstName,
        middleName: tutorData.middleName ?? null,
        lastName: tutorData.lastName,
        legalName: tutorData.legalName ?? null,
        countryOfResidence: tutorData.countryOfResidence || tutorData.nationality || 'Unknown',
        phoneCountryCode: tutorData.phoneCountryCode,
        phoneNumber: tutorData.phoneNumber,
        educationLevel: tutorData.educationLevel,
        hasTeachingCertificate: tutorData.hasTeachingCertificate,
        certificateName: tutorData.certificateName ?? null,
        certificateSubjects: tutorData.certificateSubjects ?? null,
        tutoringExperienceRange: tutorData.tutoringExperienceRange,
        globalExams: tutorData.globalExams,
        tutoringCountries: tutorData.tutoringCountries ?? [],
        countrySubjectSelections: tutorData.countrySubjectSelections ?? {},
        categories: tutorData.categories ?? [],
        username: finalHandle,
        socialLinks: tutorData.socialLinks ?? null,
      }

      // Use insert helper
      await insertTutorApplication(tx, tutorApplicationValues)
    }

    if (role === 'PARENT') {
      const ad = data.additionalData as
        | {
            students?: Array<{ name?: string }>
            emergencyContacts?: Array<{ name: string; relationship: string; phone: string }>
          }
        | undefined
      const profileDataRaw = data.profileData as
        | { phoneNumber?: string; timezone?: string }
        | undefined
      const familyAccountId = crypto.randomUUID()
      await tx.insert(familyAccount).values({
        familyAccountId,
        familyName: name,
        familyType: 'PARENT_STUDENT',
        primaryEmail: normalizedEmail,
        phoneNumber: profileDataRaw?.phoneNumber ?? null,
        timezone: profileDataRaw?.timezone ?? 'Asia/Shanghai',
        defaultCurrency: 'CNY',
        monthlyBudget: 0,
        enableBudget: false,
        allowAdults: false,
        isActive: true,
        isVerified: false,
      })
      await tx.insert(familyMember).values({
        familyMemberId: crypto.randomUUID(),
        familyAccountId,
        userId,
        name,
        relation: 'parent',
        email: normalizedEmail,
      })
      const contacts = (ad?.emergencyContacts || []).filter(
        (c: { name?: string; phone?: string }) => c.name && c.phone
      )
      for (const contact of contacts as Array<{
        name: string
        relationship: string
        phone: string
      }>) {
        await tx.insert(emergencyContact).values({
          contactId: crypto.randomUUID(),
          parentId: familyAccountId,
          name: contact.name,
          relation: contact.relationship as string,
          phone: contact.phone,
          isPrimary: false,
        })
      }
      const students = ad?.students
      if (students?.length && verifiedStudents) {
        for (let i = 0; i < students.length; i++) {
          const v = verifiedStudents.get(i)
          if (v) {
            const studentName = (students[i] as { name?: string })?.name || v.name || v.email
            await tx.insert(familyMember).values({
              familyMemberId: crypto.randomUUID(),
              familyAccountId,
              userId: v.userId,
              name: studentName,
              relation: 'child',
              email: v.email,
            })
          }
        }
      }
    }

    return { id: userId, email: normalizedEmail, role, createdAt: new Date() }
  })

  if (role === 'TUTOR' && options?.avatarFile) {
    const avatarUrl = await saveAvatar(newUser.id, options.avatarFile)
    await drizzleDb.update(profile).set({ avatarUrl }).where(eq(profile.userId, newUser.id))
  }

  let studentUniqueId: string | undefined
  if (role === 'STUDENT') {
    const [prof] = await drizzleDb
      .select({ studentUniqueId: profile.studentUniqueId })
      .from(profile)
      .where(eq(profile.userId, newUser.id))
      .limit(1)
    studentUniqueId = prof?.studentUniqueId ?? undefined
  }

  return {
    status: 201,
    body: {
      success: true,
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        name,
        email: newUser.email,
        role: newUser.role,
        tosAccepted: data.tosAccepted === true,
        ...(studentUniqueId && { studentUniqueId }),
      },
    },
  }
}
