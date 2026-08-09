import { z } from 'zod'

export const LinkPreviewMetadataSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  siteName: z.string().optional(),
  contentType: z.string().optional(),
  isFile: z.boolean().default(false),
  fileName: z.string().optional(),
  fileType: z.string().optional(),
})

export type LinkPreviewMetadata = z.infer<typeof LinkPreviewMetadataSchema>

export const LinkPreviewItemSchema = LinkPreviewMetadataSchema.extend({
  id: z.string(),
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().default(280),
  height: z.number().default(160),
})

export type LinkPreviewItem = z.infer<typeof LinkPreviewItemSchema>

export const LinkPreviewRequestSchema = z.object({
  url: z.string().min(1),
})

export type LinkPreviewRequest = z.infer<typeof LinkPreviewRequestSchema>
