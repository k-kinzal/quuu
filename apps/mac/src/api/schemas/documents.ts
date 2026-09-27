import { z } from 'zod'
import { PullRequestViewBoundsSchema } from './workbench.js'

export const ProjectDocumentSchema = z.object({ path: z.string(), format: z.enum(['markdown', 'text']) })
export const DocumentationLinkSchema = z.object({ title: z.string(), url: z.string() })
export const ProjectDocumentsSchema = z.object({
  branch: z.string(), revision: z.string(),
  files: ProjectDocumentSchema.array(), websites: DocumentationLinkSchema.array()
})
export const DocumentReadSchema = z.object({
  projectId: z.string(), path: z.string(), revision: z.string().regex(/^[a-f0-9]{40,64}$/)
})
export const DocumentContentSchema = z.object({ content: z.string(), format: z.enum(['markdown', 'text']), baseUrl: z.string() })
export const DocumentViewSchema = z.object({ projectId: z.string(), url: z.string(), bounds: PullRequestViewBoundsSchema })
export type ProjectDocuments = z.infer<typeof ProjectDocumentsSchema>
export type DocumentContent = z.infer<typeof DocumentContentSchema>
export type DocumentationLink = z.infer<typeof DocumentationLinkSchema>
