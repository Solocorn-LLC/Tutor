import { notFound } from 'next/navigation'
import { ClassroomLobby } from '@/components/classroom/ClassroomLobby'

interface PageProps {
  params: Promise<{ locale: string; id: string }>
}

export default async function StudentClassroomLobbyPage({ params }: PageProps) {
  const { id } = await params
  if (!id) return notFound()
  return <ClassroomLobby courseId={id} role="student" />
}
