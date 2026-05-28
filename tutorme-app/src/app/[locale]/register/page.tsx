'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GraduationCap, Users, BookOpen, Shield } from 'lucide-react'
import { useParams } from 'next/navigation'

const roles = [
  {
    id: 'student',
    title: 'Student',
    description: 'Learn with AI tutors and live classes',
    icon: BookOpen,
    href: '/register/student',
    color: 'bg-primary',
    hoverBg: 'hover:bg-primary/90',
    shadow: 'shadow-primary/20',
    hoverShadow: 'hover:shadow-primary/30',
  },
  {
    id: 'parent',
    title: 'Parent',
    description: 'Monitor and support your child\'s learning',
    icon: Users,
    href: '/register/parent',
    color: 'bg-success',
    hoverBg: 'hover:bg-success/90',
    shadow: 'shadow-success/20',
    hoverShadow: 'hover:shadow-success/30',
  },
  {
    id: 'tutor',
    title: 'Tutor',
    description: 'Teach students and grow your reach',
    icon: GraduationCap,
    href: '/register/tutor',
    color: 'bg-warning',
    hoverBg: 'hover:bg-warning/90',
    shadow: 'shadow-warning/20',
    hoverShadow: 'hover:shadow-warning/30',
  },
  {
    id: 'admin',
    title: 'Administrator',
    description: 'Manage your institution',
    icon: Shield,
    href: '/register/admin',
    color: 'bg-secondary',
    hoverBg: 'hover:bg-secondary/90',
    shadow: 'shadow-secondary/20',
    hoverShadow: 'hover:shadow-secondary/30',
  },
]

export default function RoleSelectionPage() {
  const params = useParams<{ locale?: string }>()
  const localePrefix = params?.locale ? `/${params.locale}` : ''

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1
            className="mb-2 text-3xl font-bold text-foreground"
            style={{ fontFamily: "'Fira Code', monospace" }}
          >
            Create Your Account
          </h1>
          <p className="text-muted-foreground">Choose how you want to join Solocorn</p>
        </div>

        {/* Role Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {roles.map(role => (
            <Link key={role.id} href={`${localePrefix}${role.href}`}>
              <Card className="card-translucent h-full cursor-pointer border-0 transition-all duration-250 hover:-translate-y-0.5">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div
                      className={`${role.color} ${role.hoverBg} rounded-xl p-3 text-white shadow-lg ${role.shadow} transition-all duration-200 hover:shadow-xl ${role.hoverShadow}`}
                    >
                      <role.icon className="h-7 w-7" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-foreground">{role.title}</h2>
                      <p className="text-sm text-muted-foreground">{role.description}</p>
                    </div>
                  </div>
                  <Button
                    className={`mt-5 h-10 w-full border-0 text-sm font-semibold text-white ${role.color} ${role.hoverBg} shadow-md transition-all duration-200 hover:shadow-lg active:scale-[0.98]`}
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
              className="font-medium text-primary transition-colors duration-200 hover:text-primary/80 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
