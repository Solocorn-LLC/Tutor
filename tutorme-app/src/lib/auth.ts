/**
 * NextAuth Configuration
 * Handles authentication for students, tutors, and admins
 * Uses Drizzle ORM and @auth/drizzle-adapter.
 * Supports realm-scoped sessions so tutor and student can stay logged in in separate tabs.
 */

import type { NextRequest } from 'next/server'
import { NextAuthOptions, getServerSession as getServerSessionNextAuth } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import type { Session } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import FacebookProvider from 'next-auth/providers/facebook'
import TwitterProvider from 'next-auth/providers/twitter'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { user, profile } from '@/lib/db/schema'
import bcrypt from 'bcryptjs'

/**
 * Social sign-in providers, included ONLY when their credentials are present in
 * the environment — so the app deploys safely before any OAuth apps are set up,
 * and each provider appears the moment its keys are added. (Apple + WeChat are
 * follow-ups: Apple needs a signed-JWT client secret, WeChat a custom provider.)
 */
function oauthProviders(): NonNullable<NextAuthOptions['providers']> {
  const providers: NonNullable<NextAuthOptions['providers']> = []
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        allowDangerousEmailAccountLinking: true,
      })
    )
  }
  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
    providers.push(
      FacebookProvider({
        clientId: process.env.FACEBOOK_CLIENT_ID,
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
        allowDangerousEmailAccountLinking: true,
      })
    )
  }
  if (process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET) {
    providers.push(
      TwitterProvider({
        clientId: process.env.TWITTER_CLIENT_ID,
        clientSecret: process.env.TWITTER_CLIENT_SECRET,
        version: '2.0',
        allowDangerousEmailAccountLinking: true,
      })
    )
  }
  return providers
}

/** The cookie the register/login buttons set to carry the intended signup role. */
export const OAUTH_ROLE_COOKIE = 'oauth_signup_role'

/** Cookie names for realm-scoped sessions (tutor tab vs student tab). */
export const REALM_COOKIE_TUTOR = 'tutor_session'
export const REALM_COOKIE_STUDENT = 'student_session'

export const authOptions: NextAuthOptions = {
  providers: [
    // Email/Password Login
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        rememberMe: { label: 'Remember Me', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const normalizedEmail = credentials.email.trim().toLowerCase()

        try {
          // Find user by email (Drizzle)
          const [userRow] = await drizzleDb
            .select()
            .from(user)
            .where(eq(user.email, normalizedEmail))
            .limit(1)
          if (!userRow?.password) {
            return null
          }

          // Suspended accounts cannot sign in.
          if (userRow.status === 'suspended') {
            throw new Error('ACCOUNT_SUSPENDED')
          }

          // Get profile for onboarding/tos
          const [profileRow] = await drizzleDb
            .select()
            .from(profile)
            .where(eq(profile.userId, userRow.userId))
            .limit(1)

          const isValid = await bcrypt.compare(credentials.password, userRow.password)
          if (!isValid) {
            const { logFailedLogin } = await import('@/lib/security/suspicious-activity')
            await logFailedLogin(null, normalizedEmail)
            return null
          }

          // Block sign-in for accounts that must verify their email first (only
          // once the password is confirmed, so this never reveals whether an
          // email exists). No-op unless enforcement is enabled + the account is
          // newer than the cutoff — pre-existing users are never affected.
          const { shouldBlockUnverifiedLogin } = await import('@/lib/auth/email-verification')
          if (
            shouldBlockUnverifiedLogin({
              emailVerified: userRow.emailVerified,
              createdAt: userRow.createdAt,
            })
          ) {
            throw new Error('EMAIL_NOT_VERIFIED')
          }

          const onboardingComplete = checkOnboardingComplete({ profile: profileRow ?? undefined })
          const tosAccepted = profileRow?.tosAccepted ?? false

          // Pass rememberMe flag through the user object
          const rememberMe = credentials.rememberMe === 'true'

          return {
            id: userRow.userId,
            email: userRow.email,
            name: profileRow?.name ?? userRow.email,
            role: userRow.role,
            image: profileRow?.avatarUrl ?? undefined,
            onboardingComplete,
            tosAccepted,
            rememberMe,
          }
        } catch (dbError: any) {
          const msg = dbError?.message || String(dbError)
          const code = dbError?.code
          console.error('[Auth] Database error during login:', {
            message: msg,
            code,
            email: normalizedEmail,
          })
          // Throw a specific error so NextAuth redirects with ?error=Configuration
          // and the login page can show a DB-specific message
          throw new Error(`DATABASE_ERROR|${msg}`)
        }
      },
    }),
    // Social sign-in (Google / Facebook / X) — only the ones whose env creds
    // exist. Apple + WeChat are follow-ups.
    ...oauthProviders(),
  ],

  callbacks: {
    // OAuth sign-in: find-or-create the app user (role from the signup cookie,
    // profile + handle provisioned) before a token is issued. Credentials logins
    // skip this. Returning false blocks sign-in with ?error on the login page.
    async signIn({ user: authUser, account, profile: oauthProfile }) {
      if (!account || account.provider === 'credentials') return true

      const email = (authUser?.email || (oauthProfile as { email?: string })?.email || '')
        .trim()
        .toLowerCase()
      if (!email) return `/login?error=OAuthNoEmail`

      // email_verified is provided by Google/Facebook (boolean); default true for
      // providers that only return verified emails.
      const emailVerifiedByProvider =
        (oauthProfile as { email_verified?: boolean })?.email_verified !== false

      const { provisionOAuthUser, normalizeOAuthRole } =
        await import('@/lib/auth/oauth-provisioning')
      let role = 'STUDENT'
      try {
        role = (await cookies()).get(OAUTH_ROLE_COOKIE)?.value || 'STUDENT'
      } catch {
        // cookies() unavailable in some contexts — default role stands.
      }

      const result = await provisionOAuthUser({
        email,
        name: authUser?.name ?? (oauthProfile as { name?: string })?.name ?? null,
        image: authUser?.image ?? null,
        emailVerifiedByProvider,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        role: normalizeOAuthRole(role),
        tokens: {
          access_token: account.access_token ?? null,
          refresh_token: account.refresh_token ?? null,
          expires_at: typeof account.expires_at === 'number' ? account.expires_at : null,
          token_type: account.token_type ?? null,
          scope: account.scope ?? null,
          id_token: account.id_token ?? null,
        },
      })

      if (!result.ok) {
        if (result.reason === 'link_blocked') return `/login?error=OAuthEmailUnverified`
        if (result.reason === 'no_email') return `/login?error=OAuthNoEmail`
        return `/login?error=OAuthProvisionFailed`
      }
      return true
    },

    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        // OAuth sign-in: the provider `user` has no role/profile — resolve them
        // from our DB (provisioned in the signIn callback just above).
        if (account && account.provider !== 'credentials') {
          const { getUserTokenFieldsByEmail } = await import('@/lib/auth/oauth-provisioning')
          const fields = await getUserTokenFieldsByEmail(user.email || '')
          if (fields) {
            token.id = fields.id
            token.role = fields.role
            token.name = fields.name
            token.email = fields.email
            token.picture = fields.image
            token.onboardingComplete = fields.onboardingComplete
            token.tosAccepted = fields.tosAccepted
          }
          return token
        }

        token.role = user.role
        token.id = user.id
        token.name = user.name
        token.email = user.email
        token.picture = user.image ?? null
        token.onboardingComplete = user.onboardingComplete
        token.tosAccepted = user.tosAccepted

        // Use user.rememberMe to adjust the token expiry if not checked
        // Note: next-auth doesn't easily support dynamic maxAge inside jwt callback,
        // but we can set an explicit exp claim
        if ((user as any).rememberMe === false) {
          // Session cookie length (typically ends when browser closes)
          // We set an explicit expiration to 24 hours just in case
          token.exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60
        }
      }

      // Handle session update (e.g., after onboarding completes or avatar changes)
      if (trigger === 'update' && session) {
        if ((session as any).onboardingComplete !== undefined) {
          token.onboardingComplete = (session as any).onboardingComplete
        }
        if ((session as any).image !== undefined) {
          token.picture = (session as any).image || null
        }
      }

      return token
    },

    async session({ session, token }) {
      // Ensure session.user exists when token has id so route handlers never see undefined (reading 'user')
      if (token?.id) {
        if (!session.user) {
          ;(
            session as {
              user: {
                id: string
                role?: string
                name?: string
                email?: string | null
                image?: string | null
              }
            }
          ).user = {
            id: token.id as string,
            role: token.role as string,
            name: (token.name as string | undefined) ?? undefined,
            email: (token.email as string | undefined) ?? undefined,
            image: (token.picture as string | undefined) ?? undefined,
          }
        } else {
          session.user.role = token.role as string
          session.user.id = token.id as string
          session.user.name = (token.name as string | undefined) ?? session.user.name
          session.user.email = (token.email as string | undefined) ?? session.user.email
          session.user.image = (token.picture as string | undefined) ?? session.user.image
        }
        ;(
          session.user as { onboardingComplete?: boolean; tosAccepted?: boolean }
        ).onboardingComplete = token.onboardingComplete as boolean
        ;(session.user as { tosAccepted?: boolean }).tosAccepted = token.tosAccepted as boolean
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: process.env.NEXTAUTH_SECRET,

  events: {
    async signOut(message) {
      console.log('[Auth] User signed out', {
        userId: (message.token as any)?.id || (message.session as any)?.user?.id,
      })
    },
  },
}

// Helper function to check if onboarding is complete
function checkOnboardingComplete(user: {
  profile?: { isOnboarded?: boolean | null } | null
}): boolean {
  if (!user?.profile) return false
  if (user.profile.isOnboarded === null || user.profile.isOnboarded === undefined) return false
  return user.profile.isOnboarded
}

// Helper function to hash passwords
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

// Helper function to check if user is authorized
export function isAuthorized(userRole: string, allowedRoles: string[]): boolean {
  return allowedRoles.includes(userRole)
}

// ---------------------------------------------------------------------------
// Realm-scoped sessions (tutor vs student in separate tabs)
// ---------------------------------------------------------------------------

export type Realm = 'tutor' | 'student'

function realmFromPath(pathname: string): Realm | null {
  if (pathname.includes('/tutor') || pathname.includes('/api/tutor')) return 'tutor'
  if (pathname.includes('/student') || pathname.includes('/api/student')) return 'student'
  // Class creation and management are tutor actions; use tutor realm so tutor tab gets correct session
  if (pathname.includes('/api/class')) return 'tutor'
  return null
}

function realmCookieName(realm: Realm): string {
  return realm === 'tutor' ? REALM_COOKIE_TUTOR : REALM_COOKIE_STUDENT
}

/**
 * Get session from a realm-scoped cookie (tutor_session or student_session).
 * Used so tutor and student can stay logged in in different tabs.
 */
export async function getSessionForRealm(
  request: NextRequest,
  realm: Realm
): Promise<Session | null> {
  const cookieName = realmCookieName(realm)
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName,
  })
  if (!token || !token.id) return null
  const expiresAt =
    typeof token.exp === 'number'
      ? new Date(token.exp * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const session = {
    user: {
      id: token.id as string,
      role: (token.role as string) ?? 'STUDENT',
      name: (token.name as string) ?? undefined,
      email: (token.email as string) ?? undefined,
      image: (token.picture as string) ?? undefined,
      onboardingComplete: Boolean(token.onboardingComplete),
      tosAccepted: Boolean(token.tosAccepted),
    },
    expires: expiresAt,
  }
  return session as Session
}

/**
 * Get server session, using realm-scoped cookie when the request path is /tutor or /student (or /api/tutor, /api/student).
 * Pass the request so tutor and student tabs can have separate sessions.
 */
export async function getServerSession(
  options: NextAuthOptions,
  request?: NextRequest
): Promise<Session | null> {
  if (request) {
    const pathname = request.nextUrl?.pathname ?? new URL(request.url).pathname
    const realm = realmFromPath(pathname)
    if (realm) {
      const session = await getSessionForRealm(request, realm)
      if (session) return session
    }
  }
  return (await getServerSessionNextAuth(options)) as Session | null
}
