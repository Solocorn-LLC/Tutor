'use client'

import { useState } from 'react'
import { X, Users, PenTool } from 'lucide-react'
import { useSocket } from '@/hooks/use-socket'
import { EnhancedWhiteboard } from '@/components/class/enhanced-whiteboard'
import { FallbackBoundary } from '@/components/ui/fallback-boundary'

/**
 * Private per-participant whiteboards, layered additively over the shared board.
 *
 * Each private board lives on its OWN socket sub-room (`<sessionId>:board:<owner>`)
 * reached through a `forceNew` connection, so its room_state and whiteboard
 * deltas never bleed into the main session socket (whiteboard events carry no
 * roomId, so a shared connection couldn't tell the boards apart). A student draws
 * on their own board; the tutor can open any student's board read-only to watch
 * it live. The shared collaborative board underneath is untouched.
 */
export function boardRoomId(sessionId: string, ownerId: string): string {
  return `${sessionId}:board:${ownerId}`
}

/** One isolated board on its own connection. Editable for its owner, read-only
 *  when the tutor is viewing someone else's. */
function IsolatedBoard({
  sessionId,
  ownerId,
  viewerId,
  viewerName,
  viewerIsTutor,
  readOnly,
}: {
  sessionId: string
  ownerId: string
  viewerId: string
  viewerName?: string
  viewerIsTutor?: boolean
  readOnly?: boolean
}) {
  const socketOptions =
    sessionId && viewerId
      ? {
          roomId: boardRoomId(sessionId, ownerId),
          userId: viewerId,
          name: viewerName || (viewerIsTutor ? 'Tutor' : 'Student'),
          role: viewerIsTutor ? ('tutor' as const) : ('student' as const),
          forceNew: true,
        }
      : undefined
  const { socket } = useSocket(socketOptions)

  return (
    <EnhancedWhiteboard
      socket={socket}
      roomId={boardRoomId(sessionId, ownerId)}
      userId={viewerId}
      userName={viewerName || undefined}
      readOnly={readOnly}
      videoOverlay={false}
    />
  )
}

interface BoardTarget {
  /** Whose board this is. */
  ownerId: string
  ownerName: string
  /** True when the current user owns it (editable); false = tutor viewing. */
  mine: boolean
}

/**
 * The full-area overlay that hosts a private board above the classroom. The
 * user's OWN board stays mounted once opened (hidden, not unmounted) so its
 * content survives toggling; a tutor's view of a student's board mounts on demand.
 */
export function SessionBoardsOverlay({
  sessionId,
  userId,
  userName,
  isTutor,
  target,
  ownBoardEverOpened,
  onClose,
}: {
  sessionId: string
  userId: string
  userName?: string
  isTutor?: boolean
  target: BoardTarget | null
  ownBoardEverOpened: boolean
  onClose: () => void
}) {
  const viewingStudent = target && !target.mine ? target : null
  const showOwn = !!target?.mine

  if (!target && !ownBoardEverOpened) return null

  return (
    <div
      className={
        'pointer-events-auto absolute inset-2 z-30 flex flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl ' +
        (target ? '' : 'hidden')
      }
    >
      <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <PenTool className="h-4 w-4 text-slate-500" />
          {target?.mine ? 'My board' : target ? `${target.ownerName}'s board` : 'Board'}
          {target && !target.mine ? (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
              read-only
            </span>
          ) : null}
        </div>
        <button
          onClick={onClose}
          aria-label="Close board"
          className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {/* Own board — kept mounted once opened so its strokes persist across
            toggles; shown only when it's the active target. */}
        {ownBoardEverOpened && userId ? (
          <div className={'absolute inset-0 ' + (showOwn ? '' : 'hidden')}>
            <FallbackBoundary
              label="my board"
              fallback={<div className="h-full w-full bg-white" />}
            >
              <IsolatedBoard
                sessionId={sessionId}
                ownerId={userId}
                viewerId={userId}
                viewerName={userName}
                viewerIsTutor={isTutor}
              />
            </FallbackBoundary>
          </div>
        ) : null}

        {/* A student's board — tutor only, mounted on demand, read-only. */}
        {viewingStudent && userId ? (
          <div className="absolute inset-0">
            <FallbackBoundary
              label="student board"
              fallback={<div className="h-full w-full bg-white" />}
            >
              <IsolatedBoard
                key={viewingStudent.ownerId}
                sessionId={sessionId}
                ownerId={viewingStudent.ownerId}
                viewerId={userId}
                viewerName={userName}
                viewerIsTutor={isTutor}
                readOnly
              />
            </FallbackBoundary>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Tutor-only dropdown to pick a student whose board to watch. Sits under the
 * "Boards" toolbar button.
 */
export function BoardsPicker({
  students,
  onPick,
  onClose,
}: {
  students: Array<{ userId: string; name: string }>
  onPick: (s: { userId: string; name: string }) => void
  onClose: () => void
}) {
  return (
    <div className="pointer-events-auto absolute right-0 top-full mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Users className="h-3.5 w-3.5" /> Student boards
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {students.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-slate-400">No students have joined yet.</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto p-1">
          {students.map(s => (
            <li key={s.userId}>
              <button
                onClick={() => onPick(s)}
                className="w-full truncate rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Small helper hook: track whether the user's own board has ever been opened. */
export function useOwnBoardOpened(active: boolean): boolean {
  const [opened, setOpened] = useState(false)
  if (active && !opened) setOpened(true)
  return opened
}
