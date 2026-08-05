'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { GraduationCap, Users, Presentation, Shield } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const ACCESS_CODE = 'Solocorn123#'

interface RoleConfig {
  id: string
  title: string
  icon: React.ElementType
  href: string
  color: string
  textColor: string
  tintBg: string
  borderColor: string
  hoverText: string
  requiresCode: boolean
}

const roles: RoleConfig[] = [
  {
    id: 'student',
    title: 'Student',
    icon: GraduationCap,
    href: '/register/student',
    color: 'bg-orange-500',
    textColor: 'text-orange-500',
    tintBg: 'bg-orange-100/50',
    borderColor: 'border-orange-200',
    hoverText: 'hover:text-orange-500',
    requiresCode: false,
  },
  {
    id: 'parent',
    title: 'Parent',
    icon: Users,
    href: '/register/parent',
    color: 'bg-emerald-500',
    textColor: 'text-emerald-500',
    tintBg: 'bg-emerald-100/50',
    borderColor: 'border-emerald-200',
    hoverText: 'hover:text-emerald-500',
    requiresCode: true,
  },
  {
    id: 'tutor',
    title: 'Tutor',
    icon: Presentation,
    href: '/register/tutor',
    color: 'bg-blue-600',
    textColor: 'text-blue-600',
    tintBg: 'bg-blue-100/50',
    borderColor: 'border-blue-200',
    hoverText: 'hover:text-blue-600',
    requiresCode: false,
  },
  {
    id: 'admin',
    title: 'Administrator',
    icon: Shield,
    href: '/register/admin',
    color: 'bg-red-500',
    textColor: 'text-red-500',
    tintBg: 'bg-red-100/50',
    borderColor: 'border-red-200',
    hoverText: 'hover:text-red-500',
    requiresCode: true,
  },
]

function RoleCard({ role, localePrefix }: { role: RoleConfig; localePrefix: string }) {
  const router = useRouter()
  const [showInput, setShowInput] = useState(false)
  const [code, setCode] = useState('')
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Focus input when shown
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showInput])

  // Click outside to cancel
  useEffect(() => {
    if (!showInput) return
    function handleClickOutside(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setShowInput(false)
        setCode('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showInput])

  const handleRegisterClick = (e: React.MouseEvent) => {
    if (role.requiresCode) {
      e.preventDefault()
      setShowInput(true)
    }
    // Otherwise, Link handles navigation normally
  }

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (code === ACCESS_CODE) {
      router.push(`${localePrefix}${role.href}`)
    } else {
      setShake(true)
      setCode('')
      setTimeout(() => setShake(false), 500)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowInput(false)
      setCode('')
    }
  }

  const cardContent = (
    <Card
      ref={cardRef}
      className={`h-full cursor-pointer border ${role.borderColor} ${role.tintBg} shadow-lg transition-all duration-300 ${shake ? 'animate-shake' : ''}`}
      onClick={handleRegisterClick}
    >
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={`${role.color} rounded-xl p-3 text-white shadow-lg`}>
            <role.icon className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-800">{role.title}</h2>
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {showInput ? (
            <motion.form
              key="access-code-form"
              onSubmit={handleCodeSubmit}
              className="mt-5"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.2, delay: 0.05 }}
            >
              <Input
                ref={inputRef}
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Access Code"
                className="h-10 w-full border-0 bg-white text-center text-sm font-semibold text-gray-800 shadow-md placeholder:text-gray-400"
              />
            </motion.form>
          ) : (
            <motion.button
              key="register-button"
              type="button"
              className={`mt-5 h-10 w-full border-0 text-sm font-semibold text-white ${role.color} shadow-md transition-colors duration-200 hover:bg-white ${role.hoverText}`}
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.2 }}
            >
              Register
            </motion.button>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )

  // For roles requiring code, render without Link wrapper (we handle navigation manually)
  // For others, wrap in Link for normal navigation
  if (role.requiresCode) {
    return cardContent
  }

  return <Link href={`${localePrefix}${role.href}`}>{cardContent}</Link>
}

export default function RoleSelectionPage() {
  const params = useParams<{ locale?: string }>()
  const localePrefix = params?.locale ? `/${params.locale}` : ''

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1
            className="text-foreground mb-2 text-3xl font-bold"
            style={{ fontFamily: "'Fira Code', monospace" }}
          >
            Create Your Account
          </h1>
        </div>

        {/* Role Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {roles.map(role => (
            <RoleCard key={role.id} role={role} localePrefix={localePrefix} />
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-muted-foreground">
            Already have an account?{' '}
            <Link
              href={`${localePrefix}/login`}
              className="text-primary hover:text-primary/80 font-medium transition-colors duration-200 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
