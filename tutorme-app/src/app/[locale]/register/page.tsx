'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GraduationCap, Users, BookOpen, Shield } from 'lucide-react'

const roles = [
  {
    id: 'student',
    title: 'Student',
    icon: BookOpen,
    href: '/register/student',
    color: 'bg-[#1D4ED8]',
  },
  {
    id: 'parent',
    title: 'Parent',
    icon: Users,
    href: '/register/parent',
    color: 'bg-[#1D4ED8]',
  },
  {
    id: 'tutor',
    title: 'Tutor',
    icon: GraduationCap,
    href: '/register/tutor',
    color: 'bg-[#F17623]',
  },
  {
    id: 'admin',
    title: 'Administrator',
    icon: Shield,
    href: '/register/admin',
    color: 'bg-[#1F2933]',
  },
]

export default async function RoleSelectionPage({
  params,
}: {
  params: Promise<{ locale?: string }>
}) {
  const { locale } = await params
  const localePrefix = locale ? `/${locale}` : ''

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4">
      <div className="w-full max-w-5xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold text-[#1F2933]">Create Your Account</h1>
          <p className="text-lg text-gray-600">Choose your role to get started with Solocorn</p>
        </div>

        {/* Role Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {roles.map(role => (
            <Link key={role.id} href={`${localePrefix}${role.href}`}>
              <Card className="h-full cursor-pointer border-2 border-transparent transition-shadow hover:border-[#1D4ED8] hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className={`${role.color} rounded-xl p-4 text-white`}>
                      <role.icon className="h-10 w-10" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-[#1F2933]">{role.title}</h2>
                    </div>
                  </div>
                  <Button
                    className={`mt-6 w-full ${role.id === 'student' ? 'bg-[#1D4ED8] hover:bg-[#1E40AF]' : role.id === 'parent' ? 'bg-[#1D4ED8] hover:bg-[#1e40af]' : role.id === 'tutor' ? 'bg-[#F17623] hover:bg-[#e06613]' : 'bg-[#1F2933] hover:bg-[#111820]'}`}
                  >
                    Register as {role.title}
                  </Button>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-gray-600">
            Already have an account?{' '}
            <Link
              href={`${localePrefix}/login`}
              className="font-medium text-[#1D4ED8] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
