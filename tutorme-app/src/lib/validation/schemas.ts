/**
 * Validation Schemas
 * Zod schemas for API request validation
 */

import { z } from 'zod'
import { NextRequest } from 'next/server'
import { ValidationError } from '@/lib/api/middleware'
import {
  parentAdditionalDataSchema,
  tutorAdditionalDataSchema,
  tutorProfileDataSchema,
} from '@/lib/validation/user-registration'

// ============================================
// User & Authentication Schemas
// ============================================

const baseRegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  role: z.enum(['STUDENT', 'TUTOR', 'ADMIN', 'PARENT']),
  tosAccepted: z.boolean().optional().default(true),
  profileData: z.record(z.string(), z.unknown()).optional(),
  additionalData: z.record(z.string(), z.unknown()).optional(),
})

export const RegisterUserSchema = baseRegisterSchema.superRefine((data, ctx) => {
  // Validate tutor-specific fields for TUTOR role
  if (data.role === 'TUTOR') {
    if (data.tosAccepted !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'You must accept the Terms and Agreements',
        path: ['tosAccepted'],
      })
    }
    if (!data.profileData) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'profileData is required for tutor registration',
        path: ['profileData'],
      })
    } else {
      const result = tutorProfileDataSchema.safeParse(data.profileData)
      if (!result.success) {
        result.error.issues.forEach(issue => {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: issue.message,
            path: issue.path,
          })
        })
      }
    }
    if (!data.additionalData) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'additionalData is required for tutor registration',
        path: ['additionalData'],
      })
    } else {
      const result = tutorAdditionalDataSchema.safeParse(data.additionalData)
      if (!result.success) {
        result.error.issues.forEach(issue => {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: issue.message,
            path: issue.path,
          })
        })
      }
    }
  }

  // Only validate parent-specific fields for PARENT role
  if (data.role === 'PARENT') {
    if (!data.profileData) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'profileData is required for parent registration',
        path: ['profileData'],
      })
    }
    if (!data.additionalData) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'additionalData is required for parent registration',
        path: ['additionalData'],
      })
    } else if (data.additionalData) {
      const result = parentAdditionalDataSchema.safeParse(data.additionalData)
      if (!result.success) {
        result.error.issues.forEach(issue => {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: issue.message,
            path: issue.path,
          })
        })
      }
    }
  }
})

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const UpdateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  bio: z.string().max(1000).optional(),
  avatarUrl: z.string().url().optional(),
  hourlyRate: z.number().min(0).max(10000).optional(),
  subjects: z.array(z.string()).optional(),
})

// ============================================
// Class & Live Session Schemas
// ============================================

const cuidOrUuid = z.string().uuid().or(z.string().cuid())

export const CreateRoomSchema = z.object({
  title: z.string().min(1, 'Title must be at least 1 character').max(100).optional(),
  subject: z.string().min(2, 'Subject must be at least 2 characters').max(50),
  description: z.string().max(1000).optional(),
  courseId: cuidOrUuid.optional(),
  variantId: cuidOrUuid.optional(),
  lessonId: cuidOrUuid.optional(),
  scheduledAt: z.string().datetime('Invalid scheduled date/time').optional(),
  maxStudents: z.number().int().min(1).max(500).default(50),
  durationMinutes: z.number().int().min(15).max(480).default(120),
})

export const JoinRoomSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
  userId: z.string().uuid('Invalid user ID'),
})

export const SendMessageSchema = z.object({
  sessionId: z.string().cuid('Invalid session ID'),
  content: z.string().min(1, 'Message cannot be empty').max(5000),
  type: z.enum(['text', 'system', 'hint']).default('text'),
})

// ============================================
// Task & Assignment Schemas
// ============================================

export const GenerateTaskSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  topics: z.array(z.string()).min(1, 'At least one topic required'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  count: z.number().int().min(1).max(20).default(5),
  taskTypes: z
    .array(z.enum(['multiple_choice', 'short_answer', 'long_answer', 'coding', 'diagram']))
    .min(1),
  distributionMode: z
    .enum(['uniform', 'personalized', 'clustered', 'peer_group'])
    .default('uniform'),
  studentIds: z.array(z.string().cuid()).optional(),
  roomId: z.string().optional(),
})

export const SubmitTaskSchema = z.object({
  taskId: z.string().cuid('Invalid task ID'),
  studentId: z.string().cuid('Invalid student ID'),
  answers: z.record(z.string(), z.unknown()),
  timeSpent: z.number().int().min(0),
  questionIndex: z.number().int().min(0).optional(),
})

// ============================================
// Course & Learning Schemas
// ============================================

const ScheduleItemSchema = z.object({
  dayOfWeek: z.string().min(1),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/, 'Use HH:MM format'),
  durationMinutes: z.number().int().min(5).max(480),
  date: z
    .string()
    .refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date')
    .optional(),
})

export const CreateCourseSchema = z.object({
  title: z.string().min(1).max(25),
  description: z.string().max(2000).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  estimatedHours: z.number().min(0).max(1000).optional(),
  isLiveOnline: z.boolean().optional(),
  categories: z.array(z.string()).optional(),
  schedule: z
    .preprocess(
      val => (val === '' || val === undefined || val === null ? [] : val),
      z.array(ScheduleItemSchema).optional()
    )
    .default([]),
  // Multi-course publishing fields
  region: z.string().optional(), // Asia, Europe, Global, etc.
  countries: z.array(z.string()).optional(), // ['Hong Kong', 'Korea', 'Singapore'] or empty for Global
})

export const EnrollCourseSchema = z.object({
  courseId: cuidOrUuid,
  studentId: z.string().cuid('Invalid student ID'),
})

export const UpdateCourseSettingsSchema = z.object({
  name: z.string().min(1).max(25).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional().nullable(),
  languageOfInstruction: z.string().min(1).max(20).optional().nullable(),
  price: z.number().min(0).optional().nullable(),
  currency: z.string().length(3).optional().nullable(),
  isFree: z.boolean().optional().nullable(),
  courseSource: z.enum(['PLATFORM', 'UPLOADED']).optional().nullable(),
  outlineSource: z.enum(['SELF', 'AI']).optional().nullable(),
  schedule: z.array(ScheduleItemSchema).optional().nullable(),
  isLiveOnline: z.boolean().optional().nullable(),
  isPublished: z.boolean().optional().nullable(),
  categories: z.array(z.string()).optional().nullable(),
})

export const UpdateProgressSchema = z.object({
  lessonId: z.string().cuid('Invalid lesson ID'),
  studentId: z.string().cuid('Invalid student ID'),
  progressPercentage: z.number().min(0).max(100),
  completed: z.boolean().default(false),
})

// ============================================
// AI Tutor Schemas
// ============================================

export const AITutorEnrollSchema = z.object({
  studentId: z.string().cuid('Invalid student ID'),
  subjectCode: z.string().min(1, 'Subject code required'),
})

export const AITutorQuerySchema = z.object({
  studentId: z.string().cuid('Invalid student ID'),
  query: z.string().min(1, 'Query cannot be empty').max(2000),
  context: z
    .object({
      lessonId: z.string().cuid().optional(),
      currentTopic: z.string().optional(),
      previousMessages: z.array(z.unknown()).optional(),
    })
    .optional(),
})

// ============================================
// Feedback & Review Schemas
// ============================================

export const GenerateFeedbackSchema = z.object({
  studentId: z.string().cuid('Invalid student ID'),
  submissionId: z.string().cuid('Invalid submission ID'),
  type: z.enum(['task_feedback', 'progress_report', 'encouragement', 'correction']),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  context: z
    .object({
      taskId: z.string().cuid().optional(),
      subject: z.string().optional(),
      recentPerformance: z.number().min(0).max(100).optional(),
      strengths: z.array(z.string()).optional(),
      weaknesses: z.array(z.string()).optional(),
      specificIssue: z.string().optional(),
    })
    .optional(),
})

export const ReviewFeedbackSchema = z.object({
  workflowId: z.string().cuid('Invalid workflow ID'),
  decision: z.enum(['approve', 'reject', 'modify']),
  modifications: z
    .object({
      modifiedScore: z.number().min(0).max(100).optional(),
      modifiedComments: z.string().max(2000).optional(),
      addedNotes: z.string().max(1000).optional(),
    })
    .optional(),
})

// ============================================
// Analytics & Reporting Schemas
// ============================================

export const AnalyticsQuerySchema = z.object({
  studentId: z.string().cuid('Invalid student ID').optional(),
  classId: z.string().cuid('Invalid class ID').optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  metrics: z.array(z.enum(['completion', 'performance', 'engagement', 'attendance'])).optional(),
})

// ============================================
// Pagination & Filtering Schemas
// ============================================

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export const FilterSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.string().optional(),
  subject: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
})

// Helper function to validate request body

/**
 * Validate request body against a Zod schema
 * Throws ValidationError if validation fails
 */
export async function validateRequest<T extends z.ZodType>(
  req: NextRequest,
  schema: T
): Promise<z.infer<T>> {
  try {
    const body = await req.json()
    return schema.parse(body)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ')
      throw new ValidationError(messages)
    }
    throw error
  }
}

/**
 * Validate query parameters against a Zod schema
 */
export function validateQuery<T extends z.ZodType>(req: NextRequest, schema: T): z.infer<T> {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries())
    return schema.parse(params)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ')
      throw new ValidationError(messages)
    }
    throw error
  }
}

// ============================================
// Type exports for use in API routes
// ============================================

export type RegisterUserInput = z.infer<typeof RegisterUserSchema>
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>
export type GenerateTaskInput = z.infer<typeof GenerateTaskSchema>
export type AITutorQueryInput = z.infer<typeof AITutorQuerySchema>
export type AnalyticsQueryInput = z.infer<typeof AnalyticsQuerySchema>
