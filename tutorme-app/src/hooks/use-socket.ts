/**
 * React Hook for Socket.io Client
 * Provides real-time communication for live class sessions
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { StudentState, ChatMessage, LiveTask } from '@/lib/socket'

interface UseSocketOptions {
  roomId: string
  userId: string
  name: string
  role: 'student' | 'tutor'
  tutorId?: string
  /** Force an independent connection (its own Manager) instead of sharing the
   *  default one. Used for private-board sub-rooms so their room_state /
   *  whiteboard events never bleed into the main session socket. */
  forceNew?: boolean
  onStudentJoined?: (student: StudentState) => void
  onStudentLeft?: (userId: string) => void
  onStudentStateUpdate?: (data: { userId: string; state: StudentState }) => void
  onStudentDistress?: (data: { userId: string; name: string; message: string }) => void
  onChatMessage?: (message: ChatMessage) => void
  onTutorBroadcast?: (message: ChatMessage) => void
  onAIHint?: (hint: { userId: string; text: string; type: string }) => void
  onWhiteboardUpdate?: (data: { strokes: any[] }) => void
  onCodeUpdate?: (data: { content: string; language: string; userId: string }) => void
  onNotification?: (notification: { type: string; message: string }) => void
  onRoomState?: (state: {
    students: StudentState[]
    chatHistory: ChatMessage[]
    whiteboardData?: any
    tasks?: LiveTask[]
  }) => void
}

export function useSocket(options?: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let socket: Socket
    let connectionTimeout: NodeJS.Timeout | null = null
    let keepAlive: ReturnType<typeof setInterval> | null = null
    let cancelled = false

    const connect = async () => {
      // Don't attempt connection if required options are missing
      if (!options?.roomId || !options?.userId) {
        setError('Missing connection options')
        return
      }

      const token = await import('@/lib/socket-auth').then(m => m.getSocketToken(5000))
      if (!token || cancelled) {
        if (!cancelled) setError('Authentication required')
        return
      }

      socket = io({
        path: '/api/socket',
        transports: ['websocket', 'polling'],
        auth: { token },
        timeout: 20000,
        reconnectionAttempts: 50,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        forceNew: options?.forceNew ?? false,
      })
      if (cancelled) {
        socket.disconnect()
        return
      }
      socketRef.current = socket

      // Set connection timeout
      connectionTimeout = setTimeout(() => {
        if (!socket.connected) {
          setError('Connection timeout')
          socket.disconnect()
        }
      }, 10000)

      socket.on('connect', () => {
        console.log('Socket connected:', socket.id)
        setIsConnected(true)
        setError(null)
        if (connectionTimeout) clearTimeout(connectionTimeout)

        // Join class room only when identity context is provided.
        if (options?.roomId && options?.userId && options?.name && options?.role) {
          socket.emit('join_class', {
            roomId: options.roomId,
            userId: options.userId,
            name: options.name,
            role: options.role,
            tutorId: options.tutorId,
          })
        }

        // Heartbeat: emit a lightweight activity ping on an interval so a quiet
        // session keeps generating app-level traffic. This keeps the server's
        // room from being reaped as "inactive", nudges Cloud Run to keep the
        // instance's CPU allocated (so engine.io's own ping/pong timers don't
        // stall), and keeps proxies from idle-closing the connection — the three
        // ways an idle-but-online live session was silently dropping before.
        if (keepAlive) clearInterval(keepAlive)
        if (options?.roomId) {
          keepAlive = setInterval(() => {
            if (socket.connected) socket.emit('activity_ping', { roomId: options.roomId })
          }, 20000)
        }
      })

      socket.on('disconnect', () => {
        console.log('Socket disconnected')
        setIsConnected(false)
        if (keepAlive) {
          clearInterval(keepAlive)
          keepAlive = null
        }
      })

      socket.on('connect_error', err => {
        console.error('Socket connection error:', err)
        setError(err.message)
        setIsConnected(false)
      })

      // Room state (initial load)
      socket.on('room_state', state => {
        options?.onRoomState?.(state)
      })

      // Student events
      socket.on('student_joined', data => {
        options?.onStudentJoined?.(data.state)
      })

      socket.on('student_left', data => {
        const id = data?.userId
        if (id) options?.onStudentLeft?.(id)
      })

      socket.on('student_state_update', data => {
        options?.onStudentStateUpdate?.(data)
      })

      socket.on('student_distress', data => {
        options?.onStudentDistress?.(data)
      })

      // Chat events
      socket.on('chat_message', message => {
        options?.onChatMessage?.(message)
      })

      socket.on('tutor_broadcast', message => {
        options?.onTutorBroadcast?.(message)
      })

      // AI hints
      socket.on('ai_hint', hint => {
        options?.onAIHint?.(hint)
      })

      // Whiteboard
      socket.on('whiteboard_update', data => {
        options?.onWhiteboardUpdate?.(data)
      })

      // Code editor
      socket.on('code_update', data => {
        options?.onCodeUpdate?.(data)
      })

      socket.on('notification', data => {
        options?.onNotification?.(data)
      })
    }
    connect()
    return () => {
      cancelled = true
      if (connectionTimeout) clearTimeout(connectionTimeout)
      if (keepAlive) clearInterval(keepAlive)
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [
    options?.roomId,
    options?.userId,
    options?.name,
    options?.role,
    options?.tutorId,
    options?.forceNew,
  ])

  // Send chat message
  const sendChatMessage = useCallback((text: string) => {
    socketRef.current?.emit('chat_message', { text })
  }, [])

  // Send whiteboard update
  const sendWhiteboardUpdate = useCallback((strokes: any[]) => {
    socketRef.current?.emit('whiteboard_update', { strokes })
  }, [])

  // Send code update
  const sendCodeUpdate = useCallback((content: string, language: string) => {
    socketRef.current?.emit('code_update', { content, language })
  }, [])

  // Send activity ping
  const sendActivityPing = useCallback(
    (data: { activity: string; engagement?: number; understanding?: number }) => {
      socketRef.current?.emit('activity_ping', data)
    },
    []
  )

  // Tutor broadcast
  const sendBroadcast = useCallback(
    (text: string, targetGroup: 'all' | 'struggling' | 'needs_help' = 'all') => {
      socketRef.current?.emit('tutor_broadcast', { text, targetGroup })
    },
    []
  )

  // Push hint to student
  const pushHint = useCallback(
    (targetUserId: string, hint: string, type: 'socratic' | 'direct' | 'encouragement') => {
      socketRef.current?.emit('push_hint', { targetUserId, hint, type })
    },
    []
  )

  return {
    socket: socketRef.current,
    isConnected,
    error,
    sendChatMessage,
    sendWhiteboardUpdate,
    sendCodeUpdate,
    sendActivityPing,
    sendBroadcast,
    pushHint,
  }
}
