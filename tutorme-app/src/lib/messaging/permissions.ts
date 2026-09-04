export type AppRole = 'STUDENT' | 'TUTOR' | 'PARENT' | 'ADMIN'

const MESSAGING_ALLOWED_TARGETS: Record<AppRole, AppRole[]> = {
  STUDENT: ['TUTOR', 'PARENT', 'ADMIN'],
  // TUTOR↔TUTOR is matrix-allowed so existing threads work at the
  // message/socket level, but NEW tutor↔tutor conversations are gated on
  // mutual follows at creation time (see lib/messaging/relationships.ts).
  TUTOR: ['STUDENT', 'PARENT', 'ADMIN', 'TUTOR'],
  PARENT: ['STUDENT', 'TUTOR', 'ADMIN'],
  ADMIN: ['STUDENT', 'TUTOR', 'PARENT', 'ADMIN'],
}

export function canSendDirectMessage(senderRole: AppRole, recipientRole: AppRole): boolean {
  return MESSAGING_ALLOWED_TARGETS[senderRole].includes(recipientRole)
}

export function isConversationAllowedByRoles(roleA: AppRole, roleB: AppRole): boolean {
  return canSendDirectMessage(roleA, roleB) && canSendDirectMessage(roleB, roleA)
}

export function getInboxPathByRole(role: AppRole): string {
  switch (role) {
    case 'TUTOR':
      return '/tutor/communications'
    case 'STUDENT':
      return '/student/communications'
    case 'PARENT':
      return '/parent/messages'
    default:
      return '/admin'
  }
}
