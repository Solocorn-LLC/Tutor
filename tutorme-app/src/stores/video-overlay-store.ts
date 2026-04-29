import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

type VideoOverlayState = {
  open: boolean
  roomUrl: string | null
  token: string | null
  autoRecord: boolean
  isTutor: boolean
  openOverlay: (input: {
    roomUrl: string
    token?: string | null
    autoRecord?: boolean
    isTutor?: boolean
  }) => void
  closeOverlay: () => void
}

export const useVideoOverlayStore = create<VideoOverlayState>()(
  immer(set => ({
    open: false,
    roomUrl: null,
    token: null,
    autoRecord: false,
    isTutor: false,
    openOverlay: input =>
      set(draft => {
        draft.open = true
        draft.roomUrl = input.roomUrl
        draft.token = input.token || null
        draft.autoRecord = !!input.autoRecord
        draft.isTutor = !!input.isTutor
      }),
    closeOverlay: () =>
      set(draft => {
        draft.open = false
      }),
  }))
)
