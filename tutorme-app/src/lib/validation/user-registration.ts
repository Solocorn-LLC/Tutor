/**
 * User Registration Validation Schemas
 * Parent-specific, Tutor-specific and shared registration validation
 */

import { z } from 'zod'
import { studentLinkingSchema } from './parent-child-security'
import { HANDLE_REGEX, isReservedHandle, normalizeHandle } from '@/lib/mentions/handles'

// ============================================
// Tutor Registration Schemas
// ============================================

const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/

// Helper to preprocess null values for optional fields
const nullToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(val => (val === null ? undefined : val), schema)

const nullToEmptyArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(val => (val === null ? [] : val), schema)

const nullToEmptyObject = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(val => (val === null ? {} : val), schema)

export const tutorAdditionalDataSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required').max(50),
    middleName: nullToUndefined(z.string().max(50).optional()),
    lastName: z.string().min(1, 'Last name is required').max(50),
    legalName: nullToUndefined(z.string().max(120).optional()),
    nationality: nullToUndefined(z.string().min(2, 'Nationality is required').max(100).optional()),
    countryOfResidence: nullToUndefined(z.string().max(100).optional().or(z.literal(''))),
    phoneCountryCode: z.string().min(1, 'Phone country code is required').max(10),
    phoneNumber: z.string().regex(phoneRegex, 'Valid phone number required'),
    educationLevel: z.enum(['High School Diploma', 'Bachelor', 'Masters', 'PhD']),
    hasTeachingCertificate: z.boolean(),
    certificateName: nullToUndefined(z.string().max(200).optional()),
    certificateSubjects: nullToUndefined(z.string().max(500).optional()),
    tutoringExperienceRange: z.enum(['0-2', '3-5', '6-10', '10+']),
    globalExams: nullToEmptyObject(
      z
        .object({
          standardizedEnglish: z.array(z.string()).optional().default([]),
          undergradAdmissions: z.array(z.string()).optional().default([]),
          apAdvancedPlacement: z.array(z.string()).optional().default([]),
          internationalAS: z.array(z.string()).optional().default([]),
        })
        .optional()
        .default({
          standardizedEnglish: [],
          undergradAdmissions: [],
          apAdvancedPlacement: [],
          internationalAS: [],
        })
    ),
    tutoringCountries: nullToEmptyArray(z.array(z.string()).optional().default([])),
    countrySubjectSelections: nullToEmptyObject(
      z.record(z.string(), z.array(z.string())).optional().default({})
    ),
    categories: nullToEmptyArray(z.array(z.string()).optional().default([])),
    username: z
      .string()
      .min(3, 'Handle must be at least 3 characters')
      .max(30, 'Handle must be at most 30 characters')
      .regex(HANDLE_REGEX, 'Handle may only contain letters, numbers, and underscores')
      .refine(value => !isReservedHandle(value), 'This handle is reserved')
      .transform(value => normalizeHandle(value)),
    socialLinks: nullToEmptyObject(
      z
        .object({
          instagram: nullToUndefined(z.string().max(100).optional()),
          tiktok: nullToUndefined(z.string().max(100).optional()),
          youtube: nullToUndefined(z.string().max(100).optional()),
          facebook: nullToUndefined(z.string().max(100).optional()),
        })
        .optional()
    ),
    hourlyRate: nullToUndefined(z.number().min(0).max(10000).optional()),
  })
  .superRefine((data, ctx) => {
    if (data.hasTeachingCertificate && !data.certificateName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Teaching certificate is required when you select Yes',
        path: ['certificateName'],
      })
    }
  })

export const tutorProfileDataSchema = z.object({
  timezone: z.string().default('Asia/Shanghai'),
  preferredLanguage: z
    .enum(['en', 'zh-CN', 'es', 'fr', 'de', 'ja', 'ko', 'pt', 'ru', 'ar'])
    .default('en'),
  bio: z.string().max(2000, 'Bio must be less than 2000 characters').optional(),
  nationality: z.string().optional(),
  tutorNationalities: z.array(z.string()).optional().default([]),
  categoryNationalityCombinations: z.array(z.string()).optional().default([]),
})

// Legacy student schema (for backward compatibility in non-parent flows)
export const studentSchema = z.object({
  name: z.string().min(1, 'Child name is required'),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  grade: z.string().optional(),
  subjects: z.array(z.string()).optional(),
})

// Security-enforced student linking for parent registration (requires childEmail or childUniqueId)
export const parentStudentLinkingSchema = studentLinkingSchema

export const emergencyContactSchema = z.object({
  name: z.string().min(1, 'Contact name is required'),
  relationship: z.string().min(1, 'Relationship is required'),
  phone: z.string().regex(/^\+?[\d\s\-\(\)]{10,}$/, 'Valid phone number required'),
})

export const notificationSchema = z.object({
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  app: z.boolean().optional(),
  weeklyReports: z.boolean().optional(),
  paymentNotifications: z.boolean().optional(),
  emergencyContacts: z.boolean().optional(),
  mentions: z.boolean().optional(),
})

export const parentProfileDataSchema = z.object({
  phoneNumber: z.string().regex(/^\+?[\d\s\-\(\)]{10,}$/, 'Valid phone number required'),
  relationship: z.enum(['parent', 'guardian', 'step-parent', 'grandparent', 'other']),
  timezone: z.string().default('Asia/Shanghai'),
  preferredLanguage: z.enum(['zh-CN', 'en']).default('zh-CN'),
})

// Lenient emergency contact for API - allows empty placeholder entries (filtered in API)
const emergencyContactInputSchema = z.object({
  name: z.string(),
  relationship: z.string(),
  phone: z.string(),
})

export const parentAdditionalDataSchema = z.object({
  students: z.array(parentStudentLinkingSchema).optional().default([]),
  emergencyContacts: z.array(emergencyContactInputSchema).max(3).optional(),
  notificationPreferences: notificationSchema.optional(),
})

// ============================================
// Admin Registration Schemas
// ============================================

export const ADMIN_PERMISSION_GROUPS = [
  'user_management',
  'content_management',
  'financial_access',
  'system_settings',
  'analytics',
] as const

export type AdminPermissionGroup = (typeof ADMIN_PERMISSION_GROUPS)[number]

export const adminPermissionGroupsSchema = z.array(z.enum(ADMIN_PERMISSION_GROUPS))

export const adminProfileDataSchema = z.object({
  phoneNumber: z.string().regex(/^\+?[\d\s\-\(\)]{10,}$/, 'Valid phone number required'),
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters').max(200),
  organizationSlug: z
    .string()
    .regex(/^[a-z0-9\-]+$/, 'Slug: lowercase letters, numbers, hyphens only')
    .optional(),
  adminLevel: z.enum(['super', 'standard', 'limited']),
  jobTitle: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
})

export const adminAdditionalDataSchema = z.object({
  permissions: adminPermissionGroupsSchema.min(1, 'Select at least one permission group'),
  mfaEnabled: z.boolean().default(true),
  ipWhitelist: z
    .array(z.string().regex(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/, 'Invalid IP address'))
    .optional(),
  timezone: z.string().default('Asia/Shanghai'),
  preferredLanguage: z.enum(['zh-CN', 'en']).default('zh-CN'),
})

export const adminRegistrationSchema = z
  .object({
    email: z.string().email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password too long')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      ),
    confirmPassword: z.string(),
    firstName: z.string().min(1, 'First name is required').max(50),
    lastName: z.string().min(1, 'Last name is required').max(50),
    phoneNumber: z.string().regex(/^\+?[\d\s\-\(\)]{10,}$/, 'Valid phone number required'),
    organizationName: z.string().min(2, 'Organization name is required').max(200),
    organizationSlug: z.string().max(100).optional(),
    adminLevel: z.enum(['super', 'standard', 'limited']),
    jobTitle: z.string().max(100).optional(),
    department: z.string().max(100).optional(),
    permissions: adminPermissionGroupsSchema.min(1, 'Select at least one permission group'),
    mfaEnabled: z.boolean().default(true),
    tosAccepted: z.boolean().refine(val => val === true, {
      message: 'You must accept the Terms of Service',
    }),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

export type AdminRegistrationInput = z.infer<typeof adminRegistrationSchema>

// ============================================
// Parent Registration Schema
// ============================================

export const parentRegistrationSchema = z
  .object({
    email: z.string().email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      ),
    confirmPassword: z.string(),
    phoneNumber: z.string().regex(/^\+?[\d\s\-\(\)]{10,}$/, 'Valid phone number required'),
    relationship: z.enum(['parent', 'guardian', 'step-parent', 'grandparent', 'other']),
    timezone: z.string().default('Asia/Shanghai'),
    preferredLanguage: z.enum(['zh-CN', 'en']).default('zh-CN'),
    students: z.array(parentStudentLinkingSchema).optional().default([]),
    emergencyContacts: z.array(emergencyContactSchema).max(3).optional().default([]),
    notificationPreferences: notificationSchema.optional().default({}),
    tosAccepted: z.boolean().refine(val => val === true, {
      message: 'You must accept the Terms of Service',
    }),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })
