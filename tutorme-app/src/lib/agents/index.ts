/**
 * ============================================================================
 * AGENTS MODULE - Main Entry Point
 * Use `import { ... } from '@/lib/agents'` from app code.
 * Inside this package, import LLM helpers from `./orchestrator-llm` to avoid circular loads.
 * ============================================================================
 */

// Export all agent functions
export * from './tutor'
export * from './content-generator'
// './grading' removed — it was a dead legacy module (every fn threw "Legacy
// grading system removed"). Live grading is lib/grading/pci-grader.
export * from './briefing'
export * from './live-monitor'

// Export shared data types
export * from './shared-data'

export { AGENT_METADATA } from './agent-metadata'

// Export LLM orchestrator
export { generateWithFallback, chatWithFallback } from './orchestrator-llm'

// Export AI provider status check for API routes
export { getAIProvidersStatus } from './orchestrator-llm'
