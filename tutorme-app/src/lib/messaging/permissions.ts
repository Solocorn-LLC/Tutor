export type AppRole = 'STUDENT' | 'TUTOR' | 'PARENT' | 'ADMIN'

const MESSAGING_ALLOWED_TARGETS: Record<AppRole, AppRole[]> = {
  STUDENT: ['TUTOR', 'PARENT', 'ADMIN'],
  TUTOR: ['STUDENT', 'PARENT', 'ADMIN'],
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
