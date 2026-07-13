/**
 * Task Generator Agent Service — uniform task generation.
 *
 * Only `generateUniformTasks` is live (POST /api/tutor/questions/generate). The
 * personalized / clustered / peer-group / distribute / save / getRecent
 * functions were unused — `saveGeneratedTasks` was already a disabled stub
 * ("Generated tasks have been removed from the platform") — and were removed
 * along with their DB helpers and the now-unused Drizzle imports.
 */

import { generateWithFallback } from './orchestrator-llm'
import { safeJsonParse } from '@/lib/ai/json'

export interface TaskConfiguration {
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  subject: string
  topics: string[]
  taskTypes: ('multiple_choice' | 'short_answer' | 'long_answer' | 'coding' | 'diagram')[]
  count: number
  timeEstimate?: number // in minutes
  adaptive?: boolean
}

export interface GeneratedTask {
  id: string
  type: string
  question: string
  options?: string[]
  correctAnswer?: string
  explanation?: string
  difficulty: number
  topics: string[]
  hints?: string[]
  rubric?: {
    criteria: string
    points: number
  }[]
}

/**
 * Generate a prompt for task creation based on configuration.
 */
function createTaskGenerationPrompt(config: TaskConfiguration): string {
  return `作为一位专业的教育AI助手，请为${config.subject}科目生成${config.count}道练习题。

主题：${config.topics.join('、')}
难度级别：${config.difficulty}
题型：${config.taskTypes.join('、')}

要求：
1. 每道题都应该有明确的学习目标
2. 包含详细的题目描述
3. 提供正确答案和详细解析
4. 标注每道题的难度系数（1-10）
5. 相关知识点
6. 提供解题提示（可选）
7. 对于主观题，提供评分标准（rubric）

请以下面JSON格式返回（只返回JSON，不要有其他内容）：
{
  "tasks": [
    {
      "id": "task_1",
      "type": "multiple_choice",
      "question": "题目内容",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correctAnswer": "选项A",
      "explanation": "详细解析...",
      "difficulty": 5,
      "topics": ["知识点1"],
      "hints": ["提示1", "提示2"],
      "rubric": [
        {"criteria": "标准1", "points": 5}
      ]
    }
  ]
}`
}

/**
 * Parse AI response into structured tasks.
 */
function parseTaskResponse(response: string): GeneratedTask[] {
  const parsed = safeJsonParse<{ tasks?: GeneratedTask[] }>(response, { extract: true })
  const tasks = parsed?.tasks
  if (Array.isArray(tasks) && tasks.length > 0) return tasks

  // Return fallback tasks
  return [
    {
      id: 'fallback_1',
      type: 'short_answer',
      question: '请描述你对这个知识点的理解',
      difficulty: 5,
      topics: ['general'],
      explanation: '这是一个默认题目，请重新生成任务。',
    },
  ]
}

/**
 * Generate uniform tasks (same for all students).
 */
export async function generateUniformTasks(config: TaskConfiguration): Promise<GeneratedTask[]> {
  const prompt = createTaskGenerationPrompt(config)
  const result = await generateWithFallback(prompt, { temperature: 0.7 })
  return parseTaskResponse(result.content)
}
