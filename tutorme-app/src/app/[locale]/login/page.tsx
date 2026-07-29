/**
 * Login Page
 * Users can sign in with email/password
 *
 * URL: /login
 */

'use client'

import { useState, Suspense } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { useNavigationOverlay } from '@/components/navigation/NavigationOverlay'

function LoginForm() {
  const router = useRouter()
  const params = useParams<{ locale?: string }>()
  const localePrefix = params?.locale ? `/${params.locale}` : ''
  const searchParams = useSearchParams()
  const registered = searchParams.get('registered')
  const authError = searchParams.get('error')
  const verifyStatus = searchParams.get('verify') // 'success' | 'invalid' | 'expired'
  const { showOverlay } = useNavigationOverlay()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  // The email that needs verification (set when login is blocked as unverified),
  // so we can offer a targeted "resend" without another lookup.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')

  const handleResendVerification = async () => {
    if (!unverifiedEmail || resendState === 'sending') return
    setResendState('sending')
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: unverifiedEmail }),
      })
    } catch {
      // Best-effort; the endpoint always returns a generic success anyway.
    }
    setResendState('sent')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        rememberMe: rememberMe ? 'true' : 'false',
        redirect: false,
      })

      if (result?.error) {
        if (result.error === 'EMAIL_NOT_VERIFIED') {
          setUnverifiedEmail(email.trim().toLowerCase())
          setResendState('idle')
          setError('Please verify your email address to sign in — check your inbox for the link.')
        } else {
          const healthRes = await fetch('/api/health', { method: 'GET', cache: 'no-store' }).catch(
            () => null
          )
          const healthOk = healthRes?.ok ?? false
          if (!healthOk) {
            setError(
              'Unable to reach the server. The database may be temporarily unavailable. Please try again later.'
            )
          } else {
            setError('Oops, your email or password is incorrect.')
          }
        }
      } else {
        const session = await getSession()
        const userRole = session?.user?.role
        if (!userRole) {
          setError('Login succeeded but session could not be established. Please retry.')
          return
        }

        const realm = userRole === 'TUTOR' ? 'tutor' : userRole === 'STUDENT' ? 'student' : null
        if (realm) {
          await fetch('/api/auth/set-realm-cookie', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ realm }),
            credentials: 'include',
          })
        }

        showOverlay()

        if (userRole === 'TUTOR') {
          router.push(`${localePrefix}/tutor/dashboard`)
        } else if (userRole === 'PARENT') {
          router.push(`${localePrefix}/parent/dashboard`)
        } else if (userRole === 'ADMIN') {
          router.push(`${localePrefix}/admin`)
        } else {
          router.push(`${localePrefix}/student/dashboard`)
        }
        router.refresh()
      }
    } catch (err: any) {
      console.error('[Login] Unexpected error:', err)
      const msg = err?.message || String(err)
      if (msg.includes('fetch') || msg.includes('network')) {
        setError('Network error. Please check your connection and try again.')
      } else if (msg.includes('timeout') || msg.includes('aborted')) {
        setError('Request timed out. The server may be busy. Please try again.')
      } else {
        setError(`An error occurred: ${msg.slice(0, 120)}`)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4">
      {/* Blue gradient card */}
      <div
        className="w-full max-w-sm overflow-hidden rounded-lg px-6 py-6 shadow-[0_18px_45px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]"
        style={{
          background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
        }}
      >
        <div className="text-center">
          <h1
            className="text-2xl font-bold text-white drop-shadow-sm"
            style={{ fontFamily: "'Fira Code', monospace" }}
          >
            Sign In
          </h1>
        </div>

        <div className="mt-4">
          {/* Reserved message area keeps the card height stable */}
          <div className="mb-3 min-h-[20px]">
            {registered && (
              <div className="text-sm text-white/90">
                Registration successful! Check your email for a verification link, then log in.
              </div>
            )}

            {verifyStatus === 'success' && (
              <div className="text-sm text-white/90">Your email is verified — please log in.</div>
            )}
            {(verifyStatus === 'expired' || verifyStatus === 'invalid') && (
              <div className="text-sm text-white/90">
                That verification link is {verifyStatus === 'expired' ? 'expired' : 'invalid'}. Sign
                in to get a new one.
              </div>
            )}

            {(error || authError) && (
              <div className="text-sm text-white/90">
                {error ||
                  (authError === 'SessionRequired'
                    ? 'Session expired or not found. Please log in again.'
                    : 'An authentication error occurred.')}
              </div>
            )}

            {unverifiedEmail && (
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resendState !== 'idle'}
                className="mt-1 text-sm font-medium text-white underline underline-offset-2 hover:text-white/80 disabled:opacity-60"
              >
                {resendState === 'sent'
                  ? 'Verification email sent — check your inbox.'
                  : resendState === 'sending'
                    ? 'Sending…'
                    : 'Resend verification email'}
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-white/80">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="h-10 rounded-lg border-0 bg-white px-4 text-base text-gray-800 shadow-sm placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium text-white/80">
                  Password
                </Label>
                <Link
                  href={`${localePrefix}/forgot-password`}
                  className="text-xs text-white/80 transition-colors duration-200 hover:text-white hover:underline"
                >
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-10 rounded-lg border-0 bg-white px-4 pr-12 text-base text-gray-800 shadow-sm placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 transition-colors duration-200 hover:text-gray-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={checked => setRememberMe(checked as boolean)}
                disabled={isLoading}
                className="h-5 w-5 rounded-full border-0 bg-white text-blue-600 data-[state=checked]:border-0 data-[state=checked]:bg-white data-[state=checked]:text-blue-600"
              />
              <Label htmlFor="remember" className="text-sm font-normal text-white/90">
                Remember me
              </Label>
            </div>

            <Button
              type="submit"
              className="h-10 w-full rounded-xl bg-[#f97316] text-base font-semibold text-white shadow-none transition-colors duration-200 hover:translate-y-0 hover:bg-white hover:text-[#f97316]"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm">
            <span className="text-white/80">Don&apos;t have an account?</span>
            <div className="mt-1">
              <Link
                href={`${localePrefix}/register`}
                className="font-medium text-white underline underline-offset-2 transition-colors duration-200 hover:text-white/80"
              >
                Sign up
              </Link>
            </div>
          </div>

          <div className="mt-4 border-t border-white/20 pt-4 text-center">
            <Link
              href="/"
              className="text-sm text-white/70 transition-colors duration-200 hover:text-white"
            >
              &larr; Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function LoginFormFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4">
      <div
        className="w-full max-w-sm overflow-hidden rounded-lg px-6 py-6 shadow-[0_18px_45px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]"
        style={{
          background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
        }}
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Sign In</h1>
        </div>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-white/70" />
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginForm />
    </Suspense>
  )
}
