'use client'

/**
 * The shared classroom for a 1-on-1 or group session — the same rich interface a
 * course session uses (collaborative whiteboard with the video as an overlay),
 * rather than a bare video call.
 *
 * The whiteboard and video are both keyed by the live-session id: the socket room
 * is `sessionId`, and EnhancedWhiteboard self-syncs strokes over that room (it
 * both emits its own and applies remote ones), so two participants sharing the
 * room mirror each other with no extra wiring. Course-only panels (materials,
 * task deployment) are intentionally absent — a course-less session has none.
 */

import { useState, type ComponentProps } from 'react'
import { useSession } from 'next-auth/react'
import { useSocket } from '@/hooks/use-socket'
import { EnhancedWhiteboard } from '@/components/class/enhanced-whiteboard'
import { DailyVideoFrame } from '@/components/class/daily-video-frame'

type Pages = NonNullable<ComponentProps<typeof EnhancedWhiteboard>['pages']>

interface SessionClassroomProps {
  sessionId: string
  roomUrl: string
  token: string | null
  isTutor?: boolean
  twoWay?: boolean
}

export function SessionClassroom({
  sessionId,
  roomUrl,
  token,
  isTutor,
  twoWay,
}: SessionClassroomProps) {
  const { data: session } = useSession()
  const [pages, setPages] = useState<Pages>([])
  const [pageIndex, setPageIndex] = useState(0)

  // useSocket keys its effect on the option fields (not object identity), so an
  // inline object is safe — the compiler memoizes and the socket only reconnects
  // when a field actually changes.
  const socketOptions =
    sessionId && session?.user?.id
      ? {
          roomId: sessionId,
          userId: session.user.id,
          name: session.user.name || (isTutor ? 'Tutor' : 'Student'),
          role: isTutor ? ('tutor' as const) : ('student' as const),
        }
      : undefined

  const { socket } = useSocket(socketOptions)

  // The call feed rides along as the whiteboard's draggable video overlay.
  const video = (
    <DailyVideoFrame
      roomUrl={roomUrl}
      token={token}
      isTutor={isTutor}
      twoWay={twoWay}
      className="h-full w-full rounded-none border-0"
    />
  )

  return (
    <div className="h-screen w-full bg-slate-950">
      <EnhancedWhiteboard
        socket={socket}
        roomId={sessionId}
        userId={session?.user?.id}
        userName={session?.user?.name || undefined}
        pages={pages}
        currentPageIndex={pageIndex}
        onPagesChange={setPages}
        onPageIndexChange={setPageIndex}
        videoOverlay
        videoComponent={video}
      />
    </div>
  )
}
