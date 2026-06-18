/**
 * Feature Flag System (Drizzle)
 * Centralized feature flag management with caching
 */

import crypto from 'crypto'
import { eq, asc, desc, isNull } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { featureFlag, featureFlagChange } from '@/lib/db/schema'
import type { AdminSession } from './auth'

export type FeatureFlagRow = typeof featureFlag.$inferSelect

// In-memory cache
let flagsCache: Map<string, FeatureFlagRow> | null = null
let cacheTimestamp = 0
const CACHE_TTL = 60 * 1000 // 1 minute

export interface FlagEvaluationContext {
  userId?: string
  role?: string
  tier?: string
  email?: string
}

export async function getAllFeatureFlags(): Promise<FeatureFlagRow[]> {
  if (flagsCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return Array.from(flagsCache.values())
  }
  const flags = await drizzleDb
    .select()
    .from(featureFlag)
    .where(isNull(featureFlag.deletedAt))
    .orderBy(asc(featureFlag.key))
  flagsCache = new Map(flags.map(f => [f.key, f]))
  cacheTimestamp = Date.now()
  return flags
}

export async function getFeatureFlag(key: string): Promise<FeatureFlagRow | null> {
  if (flagsCache?.has(key)) return flagsCache.get(key)!
  const [flag] = await drizzleDb.select().from(featureFlag).where(eq(featureFlag.key, key)).limit(1)
  return flag ?? null
}

export async function isFeatureEnabled(
  key: string,
  context?: FlagEvaluationContext
): Promise<boolean> {
  const flag = await getFeatureFlag(key)
  if (!flag) return true
  if (!flag.enabled) return false
  if (flag.scope === 'global') return true
  if (!context) return flag.enabled
  const targetValue = flag.targetValue as Record<string, unknown> | undefined
  if (flag.scope === 'user' && targetValue?.userId) return targetValue.userId === context.userId
  if (flag.scope === 'role' && targetValue?.roles) {
    const roles = targetValue.roles as string[]
    return context.role ? roles.includes(context.role) : false
  }
  if (flag.scope === 'tier' && targetValue?.tiers) {
    const tiers = targetValue.tiers as string[]
    return context.tier ? tiers.includes(context.tier) : false
  }
  return flag.enabled
}

export async function checkFeatures(
  keys: string[],
  context?: FlagEvaluationContext
): Promise<Record<string, boolean>> {
  const flags = await getAllFeatureFlags()
  const flagMap = new Map(flags.map(f => [f.key, f]))
  const results: Record<string, boolean> = {}
  for (const key of keys) {
    const flag = flagMap.get(key)
    if (!flag) {
      results[key] = true
      continue
    }
    if (!flag.enabled) {
      results[key] = false
      continue
    }
    if (flag.scope === 'global') {
      results[key] = true
      continue
    }
    results[key] = await isFeatureEnabled(key, context)
  }
  return results
}

export async function createFeatureFlag(
  data: {
    key: string
    name: string
    description?: string
    enabled?: boolean
    scope?: string
    targetValue?: Record<string, unknown>
    config?: Record<string, unknown>
  },
  adminSession: AdminSession
): Promise<FeatureFlagRow> {
  const [flag] = await drizzleDb
    .insert(featureFlag)
    .values({
      flagId: crypto.randomUUID(),
      key: data.key,
      name: data.name,
      description: data.description ?? null,
      enabled: data.enabled ?? true,
      scope: data.scope ?? 'global',
      targetValue: data.targetValue ?? undefined,
      config: (data.config ?? {}) as Record<string, unknown>,
      createdBy: adminSession.adminId,
    })
    .returning()
  flagsCache = null
  if (!flag) throw new Error('Failed to create feature flag')
  return flag
}

export async function updateFeatureFlag(
  id: string,
  data: {
    name?: string
    description?: string
    enabled?: boolean
    scope?: string
    targetValue?: Record<string, unknown>
    config?: Record<string, unknown>
  },
  adminSession: AdminSession,
  changeReason?: string
): Promise<FeatureFlagRow> {
  const [previousFlag] = await drizzleDb
    .select()
    .from(featureFlag)
    .where(eq(featureFlag.flagId, id))
    .limit(1)
  if (!previousFlag) throw new Error('Feature flag not found')
  await drizzleDb.insert(featureFlagChange).values({
    changeId: crypto.randomUUID(),
    flagId: id,
    changedBy: adminSession.adminId,
    previousValue: previousFlag as unknown as Record<string, unknown>,
    newValue: data as Record<string, unknown>,
    changeReason: changeReason ?? null,
  })
  const set: Record<string, unknown> = { updatedBy: adminSession.adminId }
  if (data.name !== undefined) set.name = data.name
  if (data.description !== undefined) set.description = data.description
  if (data.enabled !== undefined) set.enabled = data.enabled
  if (data.scope !== undefined) set.scope = data.scope
  if (data.targetValue !== undefined) set.targetValue = data.targetValue
  if (data.config !== undefined) set.config = data.config
  const [flag] = await drizzleDb
    .update(featureFlag)
    .set(set as Partial<typeof featureFlag.$inferInsert>)
    .where(eq(featureFlag.flagId, id))
    .returning()
  flagsCache = null
  if (!flag) throw new Error('Failed to update feature flag')
  return flag
}

export async function deleteFeatureFlag(id: string, adminSession: AdminSession): Promise<void> {
  await drizzleDb
    .update(featureFlag)
    .set({ deletedAt: new Date(), updatedBy: adminSession.adminId })
    .where(eq(featureFlag.flagId, id))
  flagsCache = null
}

export async function getFeatureFlagHistory(flagId: string) {
  return drizzleDb
    .select()
    .from(featureFlagChange)
    .where(eq(featureFlagChange.flagId, flagId))
    .orderBy(desc(featureFlagChange.createdAt))
}

export async function toggleFeatureFlag(
  id: string,
  enabled: boolean,
  adminSession: AdminSession,
  changeReason?: string
): Promise<FeatureFlagRow> {
  return updateFeatureFlag(
    id,
    { enabled },
    adminSession,
    changeReason ?? `Feature ${enabled ? 'enabled' : 'disabled'}`
  )
}

export function invalidateFeatureFlagCache(): void {
  flagsCache = null
  cacheTimestamp = 0
}

export const DefaultFeatureFlags = {
  AI_TUTOR_ENABLED: 'ai_tutor_enabled',
  AI_TUTOR_SOCRATIC_MODE: 'ai_tutor_socratic_mode',
  AI_TUTOR_REAL_TIME_FEEDBACK: 'ai_tutor_real_time_feedback',
  AI_TUTOR_VOICE_INPUT: 'ai_tutor_voice_input',
  LIVE_SCREEN_SHARE: 'live_screen_share',
  LIVE_RECORDING: 'live_recording',
  LIVE_AI_MONITORING: 'live_ai_monitoring',
  CONTENT_QUIZZES: 'content_quizzes',
  CONTENT_TRANSCRIPTS: 'content_transcripts',
  CONTENT_BOOKMARKS: 'content_bookmarks',
  CONTENT_NOTES: 'content_notes',
  STUDY_GROUPS: 'study_groups',
  PEER_COLLABORATION: 'peer_collaboration',
  TUTOR_REVIEWS: 'tutor_reviews',
  PAYMENTS_ENABLED: 'payments_enabled',
  SUBSCRIPTIONS_ENABLED: 'subscriptions_enabled',
  ADMIN_ANALYTICS_ADVANCED: 'admin_analytics_advanced',
  ADMIN_USER_IMPERSONATION: 'admin_user_impersonation',
  ADMIN_CONTENT_MODERATION: 'admin_content_moderation',
} as const

export async function initializeDefaultFeatureFlags(adminId: string): Promise<void> {
  const defaults = [
    {
      key: DefaultFeatureFlags.AI_TUTOR_ENABLED,
      name: 'AI Tutor',
      description: 'Enable AI tutoring features',
      enabled: true,
    },
    {
      key: DefaultFeatureFlags.AI_TUTOR_SOCRATIC_MODE,
      name: 'Socratic Mode',
      description: 'Use Socratic questioning method',
      enabled: true,
    },
    {
      key: DefaultFeatureFlags.AI_TUTOR_REAL_TIME_FEEDBACK,
      name: 'Real-time Feedback',
      description: 'Provide instant feedback during AI tutoring',
      enabled: true,
    },
    {
      key: DefaultFeatureFlags.CONTENT_QUIZZES,
      name: 'Content Quizzes',
      description: 'Enable quizzes in video content',
      enabled: true,
    },
    {
      key: DefaultFeatureFlags.STUDY_GROUPS,
      name: 'Study Groups',
      description: 'Enable study group features',
      enabled: true,
    },
    {
      key: DefaultFeatureFlags.PAYMENTS_ENABLED,
      name: 'Payments',
      description: 'Enable payment processing',
      enabled: false,
    },
    {
      key: DefaultFeatureFlags.SUBSCRIPTIONS_ENABLED,
      name: 'Subscriptions',
      description: 'Enable subscription plans',
      enabled: false,
    },
  ]
  for (const flag of defaults) {
    const [existing] = await drizzleDb
      .select()
      .from(featureFlag)
      .where(eq(featureFlag.key, flag.key))
      .limit(1)
    if (!existing) {
      await drizzleDb.insert(featureFlag).values({
        flagId: crypto.randomUUID(),
        key: flag.key,
        name: flag.name,
        description: flag.description ?? null,
        enabled: flag.enabled ?? true,
        scope: 'global',
        config: {},
        createdBy: adminId,
      })
    }
  }
}
