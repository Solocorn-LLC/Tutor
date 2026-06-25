'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GraduationCap, Users, Presentation, Shield } from 'lucide-react'
import { useParams } from 'next/navigation'

const roles = [
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
  },
]

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
            <Link key={role.id} href={`${localePrefix}${role.href}`}>
              <Card
                className={`h-full cursor-pointer border ${role.borderColor} ${role.tintBg} shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl`}
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
                  <Button
                    className={`mt-5 h-10 w-full border-0 text-sm font-semibold text-white ${role.color} shadow-md transition-colors duration-200 hover:bg-white ${role.hoverText}`}
                  >
                    Register
                  </Button>
                </CardContent>
              </Card>
            </Link>
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
