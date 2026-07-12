import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

type VideoOverlayState = {
  open: boolean
  roomUrl: string | null
  token: string | null
  autoRecord: boolean
  isTutor: boolean
  /** 1-on-1 session: both participants transmit video (two-way) instead of the
   *  tutor-broadcasts / students-view layout used for group classes. */
  twoWay: boolean
  openOverlay: (input: {
    roomUrl: string
    token?: string | null
    autoRecord?: boolean
    isTutor?: boolean
    twoWay?: boolean
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
    twoWay: false,
    openOverlay: input =>
      set(draft => {
        draft.open = true
        draft.roomUrl = input.roomUrl
        draft.token = input.token || null
        draft.autoRecord = !!input.autoRecord
        draft.isTutor = !!input.isTutor
        draft.twoWay = !!input.twoWay
      }),
    closeOverlay: () =>
      set(draft => {
        draft.open = false
      }),
  }))
)
