'use client'

import { useCallback, useState } from 'react'
import {
  loadChatPreferences,
  saveChatPreferences,
  type ChatPreferences,
} from '@/lib/chat/chat-preferences'

/**
 * Chat preferences state, hydrated from localStorage. Updates persist
 * immediately and re-render subscribers.
 */
export function useChatPreferences(): [ChatPreferences, (patch: Partial<ChatPreferences>) => void] {
  const [prefs, setPrefs] = useState<ChatPreferences>(loadChatPreferences)

  const update = useCallback((patch: Partial<ChatPreferences>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch }
      saveChatPreferences(next)
      return next
    })
  }, [])

  return [prefs, update]
}
