/**
 * Direct Message Socket Hook
 *
 * Provides real-time sync for 1-to-1 conversations over Socket.io.
 * Used by MessagingPanel to receive new messages, read receipts, and typing
 * indicators without polling.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { getSocketToken } from '@/lib/socket-auth'

export interface DirectMessage {
  id: string
  content: string
  type: string
  senderId: string
  sender: {
    id: string
    profile: {
      name: string | null
      avatarUrl: string | null
    } | null
  } | null
  createdAt: string
  read: boolean
}

export interface DMTypingPayload {
  conversationId: string
  userId: string
  isTyping: boolean
}

export interface DMReadPayload {
  conversationId: string
  readerId: string
}

export interface DMMessagePayload {
  conversationId: string
  message: DirectMessage
}

export interface UseDirectMessageSocketCallbacks {
  onMessage?: (payload: DMMessagePayload) => void
  onTyping?: (payload: DMTypingPayload) => void
  onRead?: (payload: DMReadPayload) => void
}

export function useDirectMessageSocket(
  activeConversationId: string | null | undefined,
  callbacks: UseDirectMessageSocketCallbacks = {}
) {
  const socketRef = useRef<Socket | null>(null)
  const callbacksRef = useRef(callbacks)
  const joinedRef = useRef<string | null>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Keep callbacks fresh without reconnecting.
  useEffect(() => {
    callbacksRef.current = callbacks
  }, [callbacks])

  useEffect(() => {
    let cancelled = false
    let socket: Socket

    const connect = async () => {
      const token = await getSocketToken()
      if (!token || cancelled) return

      socket = io({
        path: '/api/socket',
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: 50,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5000,
        auth: { token },
      })
      socketRef.current = socket

      if (cancelled) {
        socket.disconnect()
        return
      }

      socket.on('connect', () => {
        setIsConnected(true)
        // Re-join the active conversation after reconnect.
        if (activeConversationId) {
          socket.emit('dm:join', { conversationId: activeConversationId })
          joinedRef.current = activeConversationId
        }
      })

      socket.on('disconnect', () => {
        setIsConnected(false)
        joinedRef.current = null
      })

      socket.on('connect_error', err => {
        console.warn('DM socket connection error:', err?.message || err)
        setIsConnected(false)
      })

      socket.on('dm:message', (payload: DMMessagePayload) => {
        callbacksRef.current.onMessage?.(payload)
      })

      socket.on('dm:typing', (payload: DMTypingPayload) => {
        callbacksRef.current.onTyping?.(payload)
      })

      socket.on('dm:read', (payload: DMReadPayload) => {
        callbacksRef.current.onRead?.(payload)
      })
    }

    connect()

    return () => {
      cancelled = true
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      socketRef.current?.disconnect()
      socketRef.current = null
      joinedRef.current = null
    }
  }, [])

  // Join/leave as the active conversation changes.
  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return

    if (joinedRef.current && joinedRef.current !== activeConversationId) {
      socket.emit('dm:leave', { conversationId: joinedRef.current })
      joinedRef.current = null
    }

    if (activeConversationId && joinedRef.current !== activeConversationId) {
      socket.emit('dm:join', { conversationId: activeConversationId })
      joinedRef.current = activeConversationId
    }
  }, [activeConversationId])

  const sendTyping = useCallback((conversationId: string, isTyping: boolean) => {
    const socket = socketRef.current
    if (!socket || !socket.connected) return

    socket.emit('dm:typing', { conversationId, isTyping })

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }

    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('dm:typing', { conversationId, isTyping: false })
      }, 3000)
    }
  }, [])

  const markRead = useCallback((conversationId: string) => {
    const socket = socketRef.current
    if (!socket || !socket.connected) return
    socket.emit('dm:read', { conversationId })
  }, [])

  return {
    socket: socketRef.current,
    isConnected,
    sendTyping,
    markRead,
  }
}
