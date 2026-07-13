/** Static metadata for docs and tooling — import from `@/lib/agents`. */
export const AGENT_METADATA = {
  tutor: {
    name: 'Tutor Agent',
    description: 'Socratic AI tutor for student learning',
    uiLocations: ['/student/ai-tutor', '/student/learn/[id]', '/student/quizzes/[id]'],
    primaryFunction: 'Teaching through questioning',
    dataAccess: 'READ: Student, Conversation, Course, Progress | WRITE: Conversation',
  },
  // Removed entries (deleted / dead agents, stale UI locations): contentGenerator
  // (only fed the unrendered quiz UI), grading, briefing, liveMonitor. Live
  // grading = lib/grading/pci-grader; live-class assist = /api/ai/monitor-assistant;
  // PCI/marking = the agent-kit pci-master. Only the tutor agent is listed here.
} as const
