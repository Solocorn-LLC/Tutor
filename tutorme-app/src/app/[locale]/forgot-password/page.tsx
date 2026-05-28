/**
 * Forgot Password Page
 * Users can request a password reset link.
 * URL: /[locale]/forgot-password
 */

'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, Mail, CheckCircle2 } from 'lucide-react'

export default function ForgotPasswordPage() {
  const params = useParams<{ locale?: string }>()
  const localePrefix = params?.locale ? `/${params.locale}` : ''

  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const contentType = response.headers.get('content-type') ?? ''
      const data: unknown = contentType.includes('application/json') ? await response.json() : null

      if (!response.ok) {
        const message =
          data &&
          typeof data === 'object' &&
          'message' in data &&
          typeof (data as { message?: unknown }).message === 'string'
            ? (data as { message: string }).message
            : 'Something went wrong. Please try again.'
        setError(message)
        return
      }

      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card
        className="w-full max-w-md overflow-hidden rounded-3xl border-border/30 shadow-elevation-3"
        style={{
          background: 'linear-gradient(145deg, hsl(var(--card) / 0.95) 0%, hsl(var(--surface) / 0.92) 100%)',
        }}
      >
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle
            className="text-2xl font-bold text-foreground"
            style={{ fontFamily: "'Fira Code', monospace" }}
          >
            Forgot Password
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter your email and we'll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-success/20 bg-success/10 p-4 text-sm text-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>If an account exists for that email, you will receive a password reset link shortly.</span>
              </div>
              <Link href={`${localePrefix}/login`}>
                <Button
                  variant="outline"
                  className="w-full rounded-xl border-border/50 transition-all duration-200 hover:bg-muted"
                >
                  Back to login
                </Button>
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-muted-foreground">
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
                    className="h-12 rounded-xl border-border/50 bg-input/60 px-5 text-base transition-all duration-200 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
                  />
                </div>
                <Button
                  type="submit"
                  className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-200 hover:brightness-110 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98]"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send reset link'
                  )}
                </Button>
              </form>
            </>
          )}

          <div className="mt-6 text-center">
            <Link
              href={`${localePrefix}/login`}
              className="text-sm text-muted-foreground/70 transition-colors duration-200 hover:text-muted-foreground"
            >
              &larr; Back to login
            </Link>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground/50" aria-hidden="true">
            Solocorn v1.0.1-beta
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
