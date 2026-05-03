/**
 * React Hook for Socket.io Client
 * Provides real-time communication for live class sessions
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { StudentState, ChatMessage, BreakoutRoom, LiveTask } from '@/lib/socket'

interface UseSocketOptions {
  roomId: string
  userId: string
  name: string
  role: 'student' | 'tutor'
  tutorId?: string
  onStudentJoined?: (student: StudentState) => void
  onStudentLeft?: (userId: string) => void
  onStudentStateUpdate?: (data: { userId: string; state: StudentState }) => void
  onStudentDistress?: (data: { userId: string; name: string; message: string }) => void
  onChatMessage?: (message: ChatMessage) => void
  onTutorBroadcast?: (message: ChatMessage) => void
  onAIHint?: (hint: { userId: string; text: string; type: string }) => void
  onWhiteboardUpdate?: (data: { strokes: any[] }) => void
  onCodeUpdate?: (data: { content: string; language: string; userId: string }) => void
  onBreakoutInvite?: (data: { roomId: string; roomUrl: string; tutorName: string }) => void
  onBreakoutRoomUpdate?: (rooms: BreakoutRoom[]) => void
  onBreakoutMessage?: (message: {
    id: string
    senderId: string
    senderName: string
    content: string
    timestamp: number
    isAi?: boolean
  }) => void
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

    const connect = async () => {
      // Don't attempt connection if required options are missing
      if (!options?.roomId || !options?.userId) {
        setError('Missing connection options')
        return
      }

      const token = await import('@/lib/socket-auth').then(m => m.getSocketToken(5000))
      if (!token) {
        setError('Authentication required')
        return
      }

      socket = io({
        path: '/api/socket',
        transports: ['websocket', 'polling'],
        auth: { token },
        timeout: 10000,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      })
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
      })

      socket.on('disconnect', () => {
        console.log('Socket disconnected')
        setIsConnected(false)
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
        options?.onStudentLeft?.(data.userId)
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

      // Breakout
      socket.on('breakout_invite', data => {
        options?.onBreakoutInvite?.(data)
      })

      socket.on('breakout_room_update', data => {
        options?.onBreakoutRoomUpdate?.(data.rooms)
      })

      socket.on('breakout_message', data => {
        options?.onBreakoutMessage?.(data)
      })

      socket.on('notification', data => {
        options?.onNotification?.(data)
      })
    }
    connect()
    return () => {
      if (connectionTimeout) clearTimeout(connectionTimeout)
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [options?.roomId, options?.userId, options?.name, options?.role, options?.tutorId])

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

  // Invite to breakout
  const inviteToBreakout = useCallback((targetUserId: string, roomId: string) => {
    socketRef.current?.emit('breakout_invite', { targetUserId, roomId })
  }, [])

  // Broadcast to all breakout rooms
  const sendBreakoutBroadcast = useCallback((message: string) => {
    socketRef.current?.emit('breakout_broadcast', { message })
  }, [])

  // Close a breakout room
  const closeBreakoutRoom = useCallback((breakoutRoomId: string) => {
    socketRef.current?.emit('close_breakout', { breakoutRoomId })
  }, [])

  // Extend breakout room time
  const extendBreakoutTime = useCallback((breakoutRoomId: string, minutes: number) => {
    socketRef.current?.emit('extend_breakout_time', { breakoutRoomId, minutes })
  }, [])

  // Send message in breakout room
  const sendBreakoutMessage = useCallback((breakoutRoomId: string, message: string) => {
    socketRef.current?.emit('breakout_message', { breakoutRoomId, message })
  }, [])

  // Request help in breakout room
  const requestHelp = useCallback((breakoutRoomId: string, reason: string) => {
    socketRef.current?.emit('request_help', { breakoutRoomId, reason })
  }, [])

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
    inviteToBreakout,
    sendBreakoutBroadcast,
    closeBreakoutRoom,
    extendBreakoutTime,
    sendBreakoutMessage,
    requestHelp,
  }
}
