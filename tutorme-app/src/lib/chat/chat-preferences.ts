/**
 * Client-side chat preferences, persisted to localStorage so they apply on
 * every device the user chats from without a server round-trip. Unknown or
 * malformed stored values fall back to the defaults (current app behavior).
 */

export interface ChatPreferences {
  /** Enter sends the message; off = Shift+Enter newline, Ctrl/Cmd+Enter sends */
  enterToSend: boolean
  /** Play a soft sound when a message from someone else arrives */
  soundsOn: boolean
  /** Show a timestamp on each message bubble */
  showTimestamps: boolean
  /** Auto-scroll to the newest message when one arrives */
  autoScrollOnNew: boolean
}

export const CHAT_PREFERENCES_DEFAULTS: ChatPreferences = {
  enterToSend: true,
  soundsOn: true,
  showTimestamps: true,
  autoScrollOnNew: true,
}

const STORAGE_KEY = 'chat-preferences-v1'

export function loadChatPreferences(): ChatPreferences {
  if (typeof window === 'undefined') return CHAT_PREFERENCES_DEFAULTS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return CHAT_PREFERENCES_DEFAULTS
    const parsed = JSON.parse(raw) as Partial<ChatPreferences>
    return { ...CHAT_PREFERENCES_DEFAULTS, ...parsed }
  } catch {
    return CHAT_PREFERENCES_DEFAULTS
  }
}

export function saveChatPreferences(prefs: ChatPreferences): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Storage full or unavailable — preferences just won't persist.
  }
}

let audioCtx: AudioContext | null = null

/** Short soft blip for an incoming chat message (WebAudio, no asset needed). */
export function playMessageSound(): void {
  if (typeof window === 'undefined') return
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    audioCtx ??= new Ctor()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    const t = audioCtx.currentTime
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, t)
    gain.gain.setValueAtTime(0.001, t)
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start(t)
    osc.stop(t + 0.3)
  } catch {
    // Audio blocked or unsupported — never break message handling for a sound.
  }
}
