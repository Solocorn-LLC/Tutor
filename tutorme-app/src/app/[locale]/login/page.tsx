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
import { AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import { useNavigationOverlay } from '@/components/navigation/NavigationOverlay'

function LoginForm() {
  const router = useRouter()
  const params = useParams<{ locale?: string }>()
  const localePrefix = params?.locale ? `/${params.locale}` : ''
  const searchParams = useSearchParams()
  const registered = searchParams.get('registered')
  const authError = searchParams.get('error')
  const { showOverlay } = useNavigationOverlay()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

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
        setError('Invalid email or password')
      } else {
        // Get the session to check user role and onboarding status
        const session = await getSession()
        const userRole = session?.user?.role
        if (!userRole) {
          setError('Login succeeded but session could not be established. Please retry.')
          return
        }

        // Set realm-scoped cookie so tutor/student can stay logged in in separate tabs
        const realm = userRole === 'TUTOR' ? 'tutor' : userRole === 'STUDENT' ? 'student' : null
        if (realm) {
          await fetch('/api/auth/set-realm-cookie', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ realm }),
            credentials: 'include',
          })
        }

        // Show navigation overlay before redirecting to prevent loading screen flash
        showOverlay()

        // Redirect based on role
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
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="w-full max-w-sm overflow-hidden rounded-[32px] px-8 py-10"
      style={{
        background:
          'linear-gradient(135deg, rgba(241,118,35,0.92) 0%, rgba(241,118,35,0.82) 55%, rgba(241,118,35,0.90) 100%)',
        boxShadow:
          '0 24px 48px rgba(0,0,0,0.12), 0 10px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.25)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
      }}
    >
      <div className="text-center">
        <h1 className="text-xl font-bold text-white drop-shadow-sm">Sign In</h1>
        <p className="mt-1 text-sm text-white/75">Enter your email and password to continue</p>
      </div>

      <div className="mt-10">
        {registered && (
          <div className="mb-4 rounded-lg bg-white/20 p-3 text-sm text-white">
            Registration successful! Please log in.
          </div>
        )}

        {(error || authError) && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-white/15 p-3 text-sm text-white">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error ||
              (authError === 'SessionRequired'
                ? 'Session expired or not found. Please log in again.'
                : 'An authentication error occurred.')}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-medium text-white/85">
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
              className="h-14 rounded-[18px] border-0 bg-white/85 px-6 text-base text-[#1F2933] shadow-sm ring-0 placeholder:text-gray-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-white/55"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-medium text-white/85">
                Password
              </Label>
              <Link
                href={`${localePrefix}/forgot-password`}
                className="text-xs text-white/80 hover:text-white hover:underline"
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
                className="h-14 rounded-[18px] border-0 bg-white/85 px-6 pr-12 text-base text-[#1F2933] shadow-sm ring-0 placeholder:text-gray-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-white/55"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
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
              className="h-5 w-5 rounded-full border-white/50 data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-[#F17623]"
            />
            <Label htmlFor="remember" className="text-sm font-normal text-white/80">
              Remember me
            </Label>
          </div>

          <Button
            type="submit"
            className="h-14 w-full rounded-[18px] bg-[#1D4ED8] text-base font-semibold text-white shadow-lg hover:bg-[#1B45C2]"
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

        <div className="mt-5 text-center text-sm">
          <span className="text-white/70">Don&apos;t have an account?</span>
          <div className="mt-1">
            <Link
              href={`${localePrefix}/register`}
              className="font-medium text-white underline underline-offset-2 hover:text-white/90"
            >
              Sign up
            </Link>
          </div>
        </div>

        <div className="mt-7 border-t border-white/15 pt-6 text-center">
          <Link href="/" className="text-sm text-white/60 hover:text-white/90">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}

function LoginFormFallback() {
  return (
    <div
      className="w-full max-w-sm overflow-hidden rounded-[32px] px-8 py-10"
      style={{
        background:
          'linear-gradient(135deg, rgba(241,118,35,0.92) 0%, rgba(241,118,35,0.82) 55%, rgba(241,118,35,0.90) 100%)',
        boxShadow:
          '0 24px 48px rgba(0,0,0,0.12), 0 10px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.25)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
      }}
    >
      <div className="text-center">
        <h1 className="text-xl font-bold text-white">Sign In</h1>
        <p className="mt-1 text-sm text-white/75">Enter your email and password to continue</p>
      </div>
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-white/80" />
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="safe-top safe-bottom flex min-h-screen items-center justify-center bg-white p-4">
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
