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

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import {
  Send,
  FolderOpen,
  ListChecks,
  Pencil,
  PenTool,
  LayoutGrid,
  BookOpen,
  MessageSquare,
  Users,
  Clock,
} from 'lucide-react'
import { useSocket } from '@/hooks/use-socket'
import { EnhancedWhiteboard } from '@/components/class/enhanced-whiteboard'
import { DailyVideoFrame } from '@/components/class/daily-video-frame'
import { SessionDeployPanel } from '@/components/one-on-one/session-deploy-panel'
import { SessionDeployedPanel } from '@/components/one-on-one/session-deployed-panel'
import { SessionSubmissionsPanel } from '@/components/one-on-one/session-submissions-panel'
import {
  SessionBoardsOverlay,
  BoardsPicker,
  useOwnBoardOpened,
} from '@/components/one-on-one/session-boards'
import { useSessionRoomState } from '@/components/one-on-one/use-session-room-state'
import { SessionChatPanel } from '@/components/one-on-one/session-chat-panel'
import { SessionMonitorPanel } from '@/components/one-on-one/session-monitor-panel'
import { toast } from 'sonner'
import { FallbackBoundary } from '@/components/ui/fallback-boundary'
import { Dialog, DialogContent } from '@/components/ui/dialog'

type ActivePanel = 'deploy' | 'materials' | 'responses' | 'chat' | 'monitor' | null
interface BoardTarget {
  ownerId: string
  ownerName: string
  mine: boolean
}

interface SessionClassroomProps {
  sessionId: string
  roomUrl: string
  token: string | null
  isTutor?: boolean
  twoWay?: boolean
  /** The course this session is built around, if any — lets the tutor jump
   *  straight into the Course Builder to edit it (changes sync everywhere). */
  courseId?: string | null
  courseName?: string | null
  /** Re-mint a fresh access token and re-enter (recovers from an expired token). */
  onRefreshToken?: () => void | Promise<void>
}

export function SessionClassroom({
  sessionId,
  roomUrl,
  token,
  isTutor,
  twoWay,
  courseId,
  courseName,
  onRefreshToken,
}: SessionClassroomProps) {
  const { data: session } = useSession()
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const toggle = (panel: Exclude<ActivePanel, null>) =>
    setActivePanel(cur => (cur === panel ? null : panel))
  // Private-board overlay: whose board is open (own = editable, student = tutor
  // viewing read-only), plus the tutor's student-board picker.
  const [boardTarget, setBoardTarget] = useState<BoardTarget | null>(null)
  const [showBoardsPicker, setShowBoardsPicker] = useState(false)
  const [showCourseEditor, setShowCourseEditor] = useState(false)
  // Bumped when the Edit-course modal (iframe) reports a save, so the deploy
  // panel refetches instead of serving pre-edit task content.
  const [deployRefreshKey, setDeployRefreshKey] = useState(0)
  // Session timing (for the countdown) + whether the room has been ended.
  const [timing, setTiming] = useState<{ endTs: number } | null>(null)
  const [nowTs, setNowTs] = useState(0)
  const [ended, setEnded] = useState(false)
  const myId = session?.user?.id ?? ''

  // Listen for the embedded course-editor's save postMessage and refresh the
  // deploy panel's task list. Same-origin check guards against foreign frames.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === 'tutorme:course-saved') setDeployRefreshKey(k => k + 1)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
  const ownBoardOpened = useOwnBoardOpened(boardTarget?.mine === true)

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

  // Students emit a light engagement signal (tab focus + recent interaction) every
  // ~15s so the tutor's Monitor shows live status. Cheap heuristic — no tracking
  // beyond "is this tab focused and did they interact recently".
  useEffect(() => {
    if (!socket || isTutor || !sessionId) return
    let lastInteraction = Date.now()
    const bump = () => {
      lastInteraction = Date.now()
    }
    const events = ['pointerdown', 'keydown', 'pointermove', 'wheel'] as const
    events.forEach(e => window.addEventListener(e, bump, { passive: true }))
    const tick = () => {
      const focused = typeof document !== 'undefined' && document.visibilityState === 'visible'
      const idleMs = Date.now() - lastInteraction
      const engagement = !focused ? 20 : idleMs < 30_000 ? 100 : idleMs < 90_000 ? 55 : 35
      socket.emit('activity_ping', { roomId: sessionId, engagement, activity: 'classroom' })
    }
    tick()
    const iv = setInterval(tick, 15_000)
    return () => {
      clearInterval(iv)
      events.forEach(e => window.removeEventListener(e, bump))
    }
  }, [socket, isTutor, sessionId])

  // Student receives a private nudge from the tutor (tutor:direct_message) → toast.
  useEffect(() => {
    if (!socket || isTutor) return
    const onDm = (data: { targetStudentId?: string; message?: string }) => {
      if (data?.targetStudentId && data.targetStudentId === myId && data.message) {
        toast(data.message, { icon: '👋', duration: 8000 })
      }
    }
    socket.on('student:direct_message', onDm)
    return () => {
      socket.off('student:direct_message', onDm)
    }
  }, [socket, isTutor, myId])

  // Session countdown: fetch the scheduled end once, then tick a coarse clock.
  useEffect(() => {
    if (!sessionId) return
    let active = true
    fetch(`/api/one-on-one/session-status?sessionId=${encodeURIComponent(sessionId)}`, {
      credentials: 'include',
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!active || !d?.scheduledAt) return
        const start = new Date(d.scheduledAt).getTime()
        const mins = typeof d.durationMinutes === 'number' ? d.durationMinutes : 60
        if (Number.isFinite(start)) setTiming({ endTs: start + mins * 60_000 })
        if (d.status === 'ended') setEnded(true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [sessionId])
  useEffect(() => {
    setNowTs(Date.now())
    const iv = setInterval(() => setNowTs(Date.now()), 20_000)
    return () => clearInterval(iv)
  }, [])

  // Everyone leaves the room when it ends (tutor End, or the server's timeout end).
  useEffect(() => {
    if (!socket) return
    const onEnded = () => setEnded(true)
    socket.on('session:ended', onEnded)
    return () => {
      socket.off('session:ended', onEnded)
    }
  }, [socket])

  const endSession = () => {
    if (!socket) return
    if (!window.confirm('End this session for everyone? This closes the room.')) return
    socket.emit('tutor:end_session', { roomId: sessionId })
  }

  const remainingMs = timing && nowTs ? timing.endTs - nowTs : null
  const timerLabel =
    remainingMs == null
      ? ''
      : remainingMs > 0
        ? `${Math.max(1, Math.ceil(remainingMs / 60_000))}m left`
        : `Overdue ${Math.floor(-remainingMs / 60_000)}m`

  // Canonical deployed-task + submission state, owned here (mounted from join)
  // so the panels — which mount only when opened — hydrate from the join-time
  // room_state replay instead of missing everything that happened before.
  const { tasks, responsesByTask, myCompletedTaskIds, myResultByTask, students, chatMessages } =
    useSessionRoomState(socket, session?.user?.id)

  // The call feed rides along as the whiteboard's draggable video overlay.
  const video = (
    <DailyVideoFrame
      roomUrl={roomUrl}
      token={token}
      isTutor={isTutor}
      twoWay={twoWay}
      onRefreshToken={onRefreshToken}
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

      {/* Session countdown (everyone) + tutor "End session". */}
      {timing ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-2">
          <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <span
              className={
                remainingMs != null && remainingMs < 0 ? 'text-rose-600' : 'text-slate-800'
              }
            >
              {timerLabel}
            </span>
          </div>
          {isTutor ? (
            <button
              type="button"
              onClick={endSession}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-rose-600/90 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur hover:bg-rose-600"
            >
              End
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Linked-course chip — so everyone in the room can see which course this
          session is built around. For the tutor the chip IS the deploy trigger
          (clicking it opens the deploy panel, exactly like the Deploy button);
          for students it's a plain label. Absent for a course-less session. */}
      {courseName ? (
        isTutor ? (
          <button
            type="button"
            onClick={() => toggle('deploy')}
            title={`Deploy tasks & assessments for "${courseName}"`}
            aria-label={`Deploy tasks & assessments for ${courseName}`}
            className="pointer-events-auto absolute left-3 top-3 z-40 inline-flex max-w-[45vw] items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur transition hover:bg-white"
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-blue-600" />
            <span className="truncate">{courseName}</span>
            <Send className="h-3 w-3 shrink-0 text-blue-600" />
          </button>
        ) : (
          <div className="pointer-events-none absolute left-3 top-3 z-40 inline-flex max-w-[45vw] items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur">
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-blue-600" />
            <span className="truncate">{courseName}</span>
          </div>
        )
      ) : null}

      {/* Classroom toolbar: deploy + responses (tutor) + materials (everyone). */}
      <div className="pointer-events-none absolute right-3 top-3 z-40 flex gap-2">
        {isTutor ? (
          <>
            {/* Deploy lives on the course-title chip when a course is linked
                (see above). A course-less session has no chip, so it keeps the
                explicit toolbar Deploy button. */}
            {!courseName ? (
              <button
                type="button"
                onClick={() => toggle('deploy')}
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur hover:bg-white"
              >
                <Send className="h-3.5 w-3.5" />
                Deploy
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => toggle('responses')}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur hover:bg-white"
            >
              <ListChecks className="h-3.5 w-3.5" />
              Submissions
            </button>
            <button
              type="button"
              onClick={() => toggle('monitor')}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur hover:bg-white"
            >
              <Users className="h-3.5 w-3.5" />
              Monitor
            </button>
            {courseId ? (
              <button
                type="button"
                onClick={() => setShowCourseEditor(true)}
                title={
                  courseName
                    ? `Edit "${courseName}" in the Course Builder — changes sync everywhere`
                    : 'Edit this course in the Course Builder'
                }
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur hover:bg-white"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit course
              </button>
            ) : null}
            <div className="pointer-events-auto relative">
              <button
                type="button"
                onClick={() => setShowBoardsPicker(v => !v)}
                title="View a student's board"
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur hover:bg-white"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Boards
              </button>
              {showBoardsPicker ? (
                <BoardsPicker
                  students={students}
                  onPick={s => {
                    setBoardTarget({ ownerId: s.userId, ownerName: s.name, mine: false })
                    setShowBoardsPicker(false)
                  }}
                  onClose={() => setShowBoardsPicker(false)}
                />
              ) : null}
            </div>
          </>
        ) : null}
        {myId ? (
          <button
            type="button"
            onClick={() =>
              setBoardTarget(cur =>
                cur?.mine ? null : { ownerId: myId, ownerName: 'Me', mine: true }
              )
            }
            title="Your own private whiteboard"
            className={
              'pointer-events-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur ' +
              (boardTarget?.mine
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'bg-white/90 text-slate-800 hover:bg-white')
            }
          >
            <PenTool className="h-3.5 w-3.5" />
            My board
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => toggle('materials')}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur hover:bg-white"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Materials
        </button>
        <button
          type="button"
          onClick={() => toggle('chat')}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur hover:bg-white"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Chat
        </button>
      </div>

      {/* Private-board overlay — sits above the shared board (which stays mounted
          so the call audio keeps running). Own board stays alive once opened. */}
      <SessionBoardsOverlay
        sessionId={sessionId}
        userId={myId}
        userName={session?.user?.name || undefined}
        isTutor={isTutor}
        target={boardTarget}
        ownBoardEverOpened={ownBoardOpened}
        onClose={() => setBoardTarget(null)}
      />

      {/* Side panels — wrapped so a panel crash closes to nothing, never the room. */}
      {activePanel ? (
        <FallbackBoundary label="session panel" fallback={null}>
          <div className="pointer-events-none absolute bottom-3 right-3 top-16 z-40 flex">
            {activePanel === 'deploy' && isTutor ? (
              <SessionDeployPanel
                sessionId={sessionId}
                socket={socket}
                courseId={courseId}
                refreshKey={deployRefreshKey}
                onClose={() => setActivePanel(null)}
              />
            ) : null}
            {activePanel === 'responses' && isTutor ? (
              <SessionSubmissionsPanel
                sessionId={sessionId}
                tasks={tasks}
                responsesByTask={responsesByTask}
                students={students}
                onClose={() => setActivePanel(null)}
              />
            ) : null}
            {activePanel === 'monitor' && isTutor ? (
              <SessionMonitorPanel
                sessionId={sessionId}
                socket={socket}
                students={students}
                tasks={tasks}
                responsesByTask={responsesByTask}
                onClose={() => setActivePanel(null)}
              />
            ) : null}
            {activePanel === 'chat' ? (
              <SessionChatPanel
                sessionId={sessionId}
                socket={socket}
                messages={chatMessages}
                myUserId={myId}
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

      {/* Edit-course modal — the full Course Builder for the linked course, in a
          ~95% dialog (the tutor layout renders /tutor/insights chrome-less, and
          the builder auto-saves, so edits sync everywhere without leaving the
          room). */}
      {courseId ? (
        <Dialog open={showCourseEditor} onOpenChange={setShowCourseEditor}>
          <DialogContent size="full" className="h-[95vh] overflow-hidden p-0">
            <iframe
              src={`/tutor/insights?tab=builder&courseId=${encodeURIComponent(courseId)}&mode=edit&embed=1`}
              title={courseName ? `Edit ${courseName}` : 'Edit course'}
              className="h-full w-full rounded-lg border-0"
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Room closed — the tutor ended it, or the server's duration timeout did. */}
      {ended ? (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-slate-950/95 px-6 text-center text-white">
          <p className="text-lg font-semibold">This session has ended</p>
          <p className="max-w-sm text-sm text-white/70">
            The room is closed. You can leave a review from your dashboard.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            Leave
          </button>
        </div>
      ) : null}
    </div>
  )
}
