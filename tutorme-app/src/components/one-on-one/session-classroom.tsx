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
import { Send, FolderOpen, Users, Pencil, PenTool, LayoutGrid } from 'lucide-react'
import { useSocket } from '@/hooks/use-socket'
import { EnhancedWhiteboard } from '@/components/class/enhanced-whiteboard'
import { DailyVideoFrame } from '@/components/class/daily-video-frame'
import { SessionDeployPanel } from '@/components/one-on-one/session-deploy-panel'
import { SessionDeployedPanel } from '@/components/one-on-one/session-deployed-panel'
import { SessionResponsesPanel } from '@/components/one-on-one/session-responses-panel'
import {
  SessionBoardsOverlay,
  BoardsPicker,
  useOwnBoardOpened,
} from '@/components/one-on-one/session-boards'
import { useSessionRoomState } from '@/components/one-on-one/use-session-room-state'
import { FallbackBoundary } from '@/components/ui/fallback-boundary'
import { Dialog, DialogContent } from '@/components/ui/dialog'

type ActivePanel = 'deploy' | 'materials' | 'responses' | null
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
  const myId = session?.user?.id ?? ''
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

  // Canonical deployed-task + submission state, owned here (mounted from join)
  // so the panels — which mount only when opened — hydrate from the join-time
  // room_state replay instead of missing everything that happened before.
  const { tasks, responsesByTask, myCompletedTaskIds, myResultByTask, students } =
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

      {/* Edit-course modal — the full Course Builder for the linked course, in a
          ~95% dialog (the tutor layout renders /tutor/insights chrome-less, and
          the builder auto-saves, so edits sync everywhere without leaving the
          room). */}
      {courseId ? (
        <Dialog open={showCourseEditor} onOpenChange={setShowCourseEditor}>
          <DialogContent size="full" className="h-[95vh] overflow-hidden p-0">
            <iframe
              src={`/tutor/insights?tab=builder&courseId=${encodeURIComponent(courseId)}&mode=edit`}
              title={courseName ? `Edit ${courseName}` : 'Edit course'}
              className="h-full w-full rounded-lg border-0"
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
