import { readFile, readdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as yamlParse } from 'yaml'

export interface Artifact {
  slug: string
  title: string
  status: string
  updated: string
  type: string
}

export interface Comment {
  id: string
  user: string
  text: string
  timestamp: string
  selection?: string // For highlighted text comments
}

export class BrainService {
  private brainDir: string

  constructor(brainDir: string) {
    this.brainDir = brainDir
  }

  /** List all projects in the brain. */
  async listProjects(): Promise<string[]> {
    const projectsDir = join(this.brainDir, 'projects')
    try {
      const entries = await readdir(projectsDir, { withFileTypes: true })
      return entries
        .filter(e => e.isDirectory())
        .map(e => e.name)
    } catch {
      return []
    }
  }

  /** List all artifacts for a project. */
  async listArtifacts(project: string, type: string): Promise<Artifact[]> {
    const dir = this.getArtifactDir(project, type)

    try {
      const files = await readdir(dir)
      const mdFiles = files.filter(f => f.endsWith('.md'))
      
      const artifacts = await Promise.all(
        mdFiles.map(async (file) => {
          const content = await readFile(join(dir, file), 'utf-8')
          const frontmatter = this.parseFrontmatter(content)
          return {
            slug: file.replace('.md', ''),
            title: (frontmatter.title as string) || file,
            status: (frontmatter.status as string) || 'active',
            updated: (frontmatter.updated as string) || '',
            type: (frontmatter.type as string) || type.slice(0, -1)
          }
        })
      )

      // Sort descending by updated timestamp
      artifacts.sort((a, b) => {
        const da = new Date(a.updated).getTime() || 0
        const db = new Date(b.updated).getTime() || 0
        return db - da
      })

      return artifacts
    } catch {
      return []
    }
  }

  /** Get comments for a specific artifact from the sidecar JSON. */
  async getComments(project: string, artifactSlug: string): Promise<Comment[]> {
    const sidecarDir = join(this.brainDir, 'projects', project, 'sidecar')
    const filePath = join(sidecarDir, `comments.json`)
    
    try {
      const raw = await readFile(filePath, 'utf-8')
      const allComments = JSON.parse(raw)
      return allComments[artifactSlug] || []
    } catch {
      return []
    }
  }

  /** Save a new comment to the sidecar JSON. */
  async saveComment(project: string, artifactSlug: string, comment: Omit<Comment, 'id' | 'timestamp'>): Promise<Comment> {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const sidecarDir = join(this.brainDir, 'projects', project, 'sidecar')
    const filePath = join(sidecarDir, `comments.json`)
    
    await mkdir(sidecarDir, { recursive: true })
    
    let allComments: Record<string, Comment[]> = {}
    try {
      const raw = await readFile(filePath, 'utf-8')
      allComments = JSON.parse(raw)
    } catch {
      // New file
    }

    if (!allComments[artifactSlug]) {
      allComments[artifactSlug] = []
    }

    const newComment: Comment = {
      ...comment,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString()
    }

    allComments[artifactSlug].push(newComment)
    await writeFile(filePath, JSON.stringify(allComments, null, 2), 'utf-8')
    
    return newComment
  }

  /** Delete a specific comment by ID. */
  async deleteComment(project: string, artifactSlug: string, commentId: string): Promise<void> {
    const { writeFile } = await import('node:fs/promises')
    const sidecarDir = join(this.brainDir, 'projects', project, 'sidecar')
    const filePath = join(sidecarDir, `comments.json`)
    
    try {
      const raw = await readFile(filePath, 'utf-8')
      const allComments = JSON.parse(raw)
      
      if (allComments[artifactSlug]) {
        allComments[artifactSlug] = allComments[artifactSlug].filter((c: any) => c.id !== commentId)
        await writeFile(filePath, JSON.stringify(allComments, null, 2), 'utf-8')
      }
    } catch {
      // File missing or corrupt
    }
  }

  /** Permanently delete an artifact. */
  async deleteArtifact(project: string, type: string, slug: string): Promise<void> {
    const { rm } = await import('node:fs/promises')
    const dir = this.getArtifactDir(project, type)
    const filePath = join(dir, `${slug}.md`)
    await rm(filePath)
  }

  /** Update the status of an artifact in its frontmatter. */
  async updateArtifactStatus(project: string, type: string, slug: string, status: string): Promise<void> {
    const { writeFile } = await import('node:fs/promises')
    const dir = this.getArtifactDir(project, type)
    const filePath = join(dir, `${slug}.md`)
    const raw = await readFile(filePath, 'utf-8')
    
    // Replace status in frontmatter: status: [anything]
    const updated = raw.replace(
      /^(\s*status:\s*).+$/m,
      `$1${status}`
    )

    await writeFile(filePath, updated, 'utf-8')
  }

  /** Helper to map type to directory, handling singular/plural. */
  private getArtifactDir(project: string, type: string): string {
    if (type === 'knowledge') {
      return join(this.brainDir, 'knowledge')
    }
    
    // Map singular to plural if needed
    const map: Record<string, string> = {
      'plan': 'plans',
      'task': 'tasks',
      'walkthrough': 'walkthroughs'
    }
    const dirName = map[type] || type
    
    return join(this.brainDir, 'projects', project, dirName)
  }

  private parseFrontmatter(raw: string): Record<string, unknown> {
    const match = raw.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n/)
    if (match) {
      try {
        const data = yamlParse(match[1])
        return typeof data === 'object' && data !== null ? data : {}
      } catch {
        return {}
      }
    }
    return {}
  }
}

/** 
 * Use a singleton for the brain service 
 * BRAIN_DIR should be provided via runtimeConfig in Nuxt 
 */
export const useBrain = () => {
  const config = useRuntimeConfig()
  const brainDir = config.brainDir || process.env.BRAIN_DIR || process.env.NUXT_BRAIN_DIR
  
  if (!brainDir) {
    console.error('[BrainService] BRAIN_DIR is missing. Check runtimeConfig or process.env.')
    throw createError({
      statusCode: 500,
      statusMessage: 'BRAIN_DIR not configured. Please set the BRAIN_DIR environment variable.'
    })
  }
  
  return new BrainService(brainDir)
}
