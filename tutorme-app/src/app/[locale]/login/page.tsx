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
        const healthRes = await fetch('/api/health', { method: 'GET', cache: 'no-store' }).catch(() => null)
        const healthOk = healthRes?.ok ?? false
        if (!healthOk) {
          setError('Unable to reach the server. The database may be temporarily unavailable. Please try again later.')
        } else {
          setError('Invalid email or password')
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      {/* Glassmorphism card */}
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-border/30 px-8 py-10 shadow-elevation-3"
        style={{
          background: 'linear-gradient(145deg, hsl(var(--card) / 0.95) 0%, hsl(var(--surface) / 0.92) 100%)',
          backdropFilter: 'blur(20px) saturate(140%)',
          WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        }}
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground drop-shadow-sm" style={{ fontFamily: "'Fira Code', monospace" }}>
            Sign In
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your email and password to continue</p>
        </div>

        <div className="mt-8">
          {registered && (
            <div className="mb-4 rounded-xl border border-success/20 bg-success/10 p-3 text-sm text-success">
              Registration successful! Please log in.
            </div>
          )}

          {(error || authError) && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="leading-snug">
                {error ||
                  (authError === 'SessionRequired'
                    ? 'Session expired or not found. Please log in again.'
                    : 'An authentication error occurred.')}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">
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
                className="h-12 rounded-xl border-border/50 bg-input/60 px-5 text-base text-foreground shadow-sm ring-0 transition-all duration-200 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                  Password
                </Label>
                <Link
                  href={`${localePrefix}/forgot-password`}
                  className="text-xs text-primary/80 transition-colors duration-200 hover:text-primary hover:underline"
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
                  className="h-12 rounded-xl border-border/50 bg-input/60 px-5 pr-12 text-base text-foreground shadow-sm ring-0 transition-all duration-200 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors duration-200 hover:text-foreground"
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
                className="h-5 w-5 rounded-md border-border/50 transition-all duration-200 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
              />
              <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
                Remember me
              </Label>
            </div>

            <Button
              type="submit"
              className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-200 hover:brightness-110 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98]"
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
            <span className="text-muted-foreground">Don&apos;t have an account?</span>
            <div className="mt-1">
              <Link
                href={`${localePrefix}/register`}
                className="font-medium text-primary underline underline-offset-2 transition-colors duration-200 hover:text-primary/80"
              >
                Sign up
              </Link>
            </div>
          </div>

          <div className="mt-6 border-t border-border/30 pt-5 text-center">
            <Link
              href="/"
              className="text-sm text-muted-foreground/70 transition-colors duration-200 hover:text-muted-foreground"
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-border/30 px-8 py-10 shadow-elevation-3"
        style={{
          background: 'linear-gradient(145deg, hsl(var(--card) / 0.95) 0%, hsl(var(--surface) / 0.92) 100%)',
          backdropFilter: 'blur(20px) saturate(140%)',
        }}
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Sign In</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your email and password to continue</p>
        </div>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary/70" />
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
