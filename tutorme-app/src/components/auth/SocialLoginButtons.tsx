'use client'

import { useEffect, useState } from 'react'
import { signIn, getProviders } from 'next-auth/react'

type Role = 'STUDENT' | 'TUTOR' | 'PARENT'

const PROVIDER_META: Record<string, { label: string }> = {
  google: { label: 'Google' },
  facebook: { label: 'Facebook' },
  twitter: { label: 'X' },
}
const KNOWN = Object.keys(PROVIDER_META)

/**
 * "Continue with …" social sign-in buttons. Renders a button only for each
 * provider that's actually configured on the server (via getProviders), so it's
 * invisible until the OAuth creds are set — no dead buttons. On a register page,
 * pass `role` so a brand-new social account is created with the right role.
 */
export function SocialLoginButtons({
  role,
  callbackUrl = '/',
  className = '',
  variant = 'onDark',
}: {
  role?: Role
  callbackUrl?: string
  className?: string
  /** 'onDark' for the blue login card; 'onLight' for white register pages. */
  variant?: 'onDark' | 'onLight'
}) {
  const [available, setAvailable] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getProviders()
      .then(p => {
        if (!active || !p) return
        setAvailable(Object.keys(p).filter(id => KNOWN.includes(id)))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  if (available.length === 0) return null

  const start = (id: string) => {
    // Carry the intended signup role for a NEW account (read in the signIn
    // callback). Short-lived; harmless for an existing account.
    if (role) {
      document.cookie = `oauth_signup_role=${role}; path=/; max-age=600; samesite=lax`
    }
    setBusy(id)
    void signIn(id, { callbackUrl })
  }

  const dividerText = variant === 'onLight' ? 'text-slate-400' : 'text-white/70'
  const dividerLine = variant === 'onLight' ? 'bg-slate-200' : 'bg-white/25'
  const button =
    variant === 'onLight'
      ? 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
      : 'bg-white text-slate-800 shadow-sm hover:bg-slate-100'

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className={`my-1 flex items-center gap-3 text-xs ${dividerText}`}>
        <span className={`h-px flex-1 ${dividerLine}`} />
        or continue with
        <span className={`h-px flex-1 ${dividerLine}`} />
      </div>
      {available.map(id => (
        <button
          key={id}
          type="button"
          disabled={busy !== null}
          onClick={() => start(id)}
          className={`flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors disabled:opacity-60 ${button}`}
        >
          {busy === id ? 'Redirecting…' : `Continue with ${PROVIDER_META[id].label}`}
        </button>
      ))}
    </div>
  )
}
