/**
 * Video Provider Interface
 * Abstracted for future migration to Tencent TRTC
 */

export interface VideoRoom {
  id: string
  url: string
  token?: string
  expiry?: Date
}

export interface VideoParticipant {
  id: string
  userId: string
  name: string
  isScreenSharing: boolean
  isAudioEnabled: boolean
  isVideoEnabled: boolean
}

export interface VideoProvider {
  /**
   * Create a new video room for a class session
   */
  createRoom(
    sessionId: string,
    options?: {
      maxParticipants?: number
      durationMinutes?: number
    }
  ): Promise<VideoRoom>

  /**
   * Generate a meeting token for authentication
   */
  createMeetingToken(
    roomName: string,
    userId: string,
    options?: {
      isOwner?: boolean
      durationMinutes?: number
    }
  ): Promise<string>

  /**
   * Delete a room when session ends
   */
  deleteRoom(roomId: string): Promise<void>

  /**
   * Check if a room is active
   */
  isRoomActive(roomId: string): Promise<boolean>
}

export interface VideoCallState {
  isJoined: boolean
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isScreenSharing: boolean
  participants: VideoParticipant[]
  error: string | null
}

export interface VideoCallActions {
  join: (url: string, token?: string) => Promise<void>
  leave: () => void
  toggleAudio: () => void
  toggleVideo: () => void
  startScreenShare: () => void
  stopScreenShare: () => void
}
