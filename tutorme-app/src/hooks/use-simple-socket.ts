/**
 * Simple Socket.io Hook
 *
 * Provides a basic socket connection for room-based features.
 * Used by the Live Class Whiteboard system.
 */

import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface SimpleSocketOptions {
  userId?: string
  name?: string
  role?: 'student' | 'tutor'
}

export function useSimpleSocket(roomId: string, options: SimpleSocketOptions = {}) {
  const socketRef = useRef<Socket | null>(null)
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!roomId) return
    let cancelled = false

    const connect = async () => {
      const token = await import('@/lib/socket-auth').then(m => m.getSocketToken())
      if (!token || cancelled) return
      const socket = io({
        path: '/api/socket',
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: 50,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5000,
        auth: { token },
      })
      if (cancelled) {
        socket.disconnect()
        return
      }
      socketRef.current = socket

      socket.on('connect', () => {
        setIsConnected(true)
        setSocketInstance(socket)

        if (roomId && options.userId && options.role) {
          socket.emit('join_class', {
            roomId,
            userId: options.userId,
            name: options.name || options.role,
            role: options.role,
          })
        }
      })

      socket.on('disconnect', () => {
        setIsConnected(false)
        setSocketInstance(null)
      })

      socket.on('connect_error', err => {
        console.warn('Socket connection error:', err?.message || err)
        setIsConnected(false)
      })
    }
    connect()
    return () => {
      cancelled = true
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [roomId, options.name, options.role, options.userId])

  return {
    socket: socketInstance,
    isConnected,
  }
}
