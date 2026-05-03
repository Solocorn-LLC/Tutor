'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function SessionEntryPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const sessionId = params?.sessionId as string

  useEffect(() => {
    if (status === 'loading') return

    if (!sessionId) {
      router.replace('/')
      return
    }

    if (!session?.user) {
      router.replace(`/login?callbackUrl=/session/${sessionId}`)
      return
    }

    const role = session.user.role
    switch (role) {
      case 'STUDENT':
        router.replace(`/student/feedback?sessionId=${sessionId}`)
        break
      case 'TUTOR':
        router.replace(`/tutor/insights?sessionId=${sessionId}`)
        break
      case 'ADMIN':
        router.replace(`/admin/dashboard`)
        break
      case 'PARENT':
        router.replace(`/parent/dashboard`)
        break
      default:
        router.replace('/')
    }
  }, [status, session, sessionId, router])

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="text-primary h-8 w-8 animate-spin" />
    </div>
  )
}
