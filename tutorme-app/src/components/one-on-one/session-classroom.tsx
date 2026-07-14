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

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Send, FolderOpen, Users } from 'lucide-react'
import { useSocket } from '@/hooks/use-socket'
import { EnhancedWhiteboard } from '@/components/class/enhanced-whiteboard'
import { DailyVideoFrame } from '@/components/class/daily-video-frame'
import { SessionDeployPanel } from '@/components/one-on-one/session-deploy-panel'
import { SessionDeployedPanel } from '@/components/one-on-one/session-deployed-panel'
import { SessionResponsesPanel } from '@/components/one-on-one/session-responses-panel'
import { useSessionRoomState } from '@/components/one-on-one/use-session-room-state'
import { FallbackBoundary } from '@/components/ui/fallback-boundary'

type ActivePanel = 'deploy' | 'materials' | 'responses' | null

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
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const toggle = (panel: Exclude<ActivePanel, null>) =>
    setActivePanel(cur => (cur === panel ? null : panel))

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

  // Canonical deployed-task + submission state, owned here (mounted from join)
  // so the panels — which mount only when opened — hydrate from the join-time
  // room_state replay instead of missing everything that happened before.
  const { tasks, responsesByTask, myCompletedTaskIds, myResultByTask } = useSessionRoomState(
    socket,
    session?.user?.id
  )

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
    <div className="relative h-screen w-full bg-slate-950">
      {/* If the whiteboard ever throws, degrade to a plain (working) video call
          rather than white-screening the join. */}
      <FallbackBoundary
        label="session classroom"
        fallback={<div className="h-screen w-full bg-black">{video}</div>}
      >
        <EnhancedWhiteboard
          socket={socket}
          roomId={sessionId}
          userId={session?.user?.id}
          userName={session?.user?.name || undefined}
          videoOverlay
          videoComponent={video}
        />
      </FallbackBoundary>

      {/* Classroom toolbar: deploy + responses (tutor) + materials (everyone). */}
      <div className="pointer-events-none absolute right-3 top-3 z-40 flex gap-2">
        {isTutor ? (
          <>
            <button
              type="button"
              onClick={() => toggle('deploy')}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur hover:bg-white"
            >
              <Send className="h-3.5 w-3.5" />
              Deploy
            </button>
            <button
              type="button"
              onClick={() => toggle('responses')}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur hover:bg-white"
            >
              <Users className="h-3.5 w-3.5" />
              Responses
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => toggle('materials')}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur hover:bg-white"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Materials
        </button>
      </div>

      {/* Side panels — wrapped so a panel crash closes to nothing, never the room. */}
      {activePanel ? (
        <FallbackBoundary label="session panel" fallback={null}>
          <div className="pointer-events-none absolute bottom-3 right-3 top-16 z-40 flex">
            {activePanel === 'deploy' && isTutor ? (
              <SessionDeployPanel
                sessionId={sessionId}
                socket={socket}
                onClose={() => setActivePanel(null)}
              />
            ) : null}
            {activePanel === 'responses' && isTutor ? (
              <SessionResponsesPanel
                tasks={tasks}
                responsesByTask={responsesByTask}
                onClose={() => setActivePanel(null)}
              />
            ) : null}
            {activePanel === 'materials' ? (
              <SessionDeployedPanel
                sessionId={sessionId}
                socket={socket}
                isTutor={isTutor}
                tasks={tasks}
                completedTaskIds={myCompletedTaskIds}
                resultByTask={myResultByTask}
                onClose={() => setActivePanel(null)}
              />
            ) : null}
          </div>
        </FallbackBoundary>
      ) : null}
    </div>
  )
}
