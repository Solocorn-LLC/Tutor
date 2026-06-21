import { notFound } from 'next/navigation'
import { ClassroomLobby } from '@/components/classroom/ClassroomLobby'

interface PageProps {
  params: Promise<{ locale: string; id: string }>
}

export default async function TutorClassroomLobbyPage({ params }: PageProps) {
  const { id } = await params
  if (!id) return notFound()
  return <ClassroomLobby courseId={id} role="tutor" />
}
