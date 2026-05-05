import { z } from 'zod'
import { ValidationError } from '@/lib/api/middleware'

export async function parseJson<T>(req: Request, schema: z.ZodSchema<T>): Promise<T> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new ValidationError('Invalid JSON body')
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    const first = result.error.issues[0]
    const path = first?.path?.length ? first.path.join('.') : 'body'
    throw new ValidationError(first ? `${path}: ${first.message}` : 'Invalid request')
  }

  return result.data
}
