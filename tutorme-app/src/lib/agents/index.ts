/**
 * ============================================================================
 * AGENTS MODULE - Main Entry Point
 * Use `import { ... } from '@/lib/agents'` from app code.
 * Inside this package, import LLM helpers from `./orchestrator-llm` to avoid circular loads.
 * ============================================================================
 */

// Export all agent functions
export * from './tutor'
// Removed as dead modules (zero callers): './grading' (fns threw "Legacy grading
// system removed"), './briefing' and './live-monitor' (orphaned agents), and
// './content-generator' (only fed the unrendered quiz-generator UI + its route,
// all deleted together). Live grading is lib/grading/pci-grader; live-class
// assist is the /api/ai/monitor-assistant route.

// Export shared data types
export * from './shared-data'

export { AGENT_METADATA } from './agent-metadata'

// Export LLM orchestrator
export { generateWithFallback, chatWithFallback } from './orchestrator-llm'

// Export AI provider status check for API routes
export { getAIProvidersStatus } from './orchestrator-llm'
