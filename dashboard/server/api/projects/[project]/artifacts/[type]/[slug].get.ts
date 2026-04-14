import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default defineEventHandler(async (event) => {
  const project = getRouterParam(event, 'project')
  const type = getRouterParam(event, 'type')
  const slug = getRouterParam(event, 'slug')

  if (!project || !type || !slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project, type, and slug are required'
    })
  }

  const brain = useBrain()
  const runtimeConfig = useRuntimeConfig()
  const brainDir = runtimeConfig.brainDir || process.env.BRAIN_DIR

  // Map type to directory structure
  let dir: string
  if (type === 'knowledge') {
    dir = join(brainDir, 'knowledge')
  } else {
    dir = join(brainDir, 'projects', project, `${type}s`) // e.g. plans, tasks
  }

  try {
    const filePath = join(dir, `${slug}.md`)
    const raw = await readFile(filePath, 'utf-8')
    
    // Split frontmatter and content
    const match = raw.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
    
    return {
      frontmatter: match ? match[1] : '',
      content: match ? match[2] : raw
    }
  } catch (error) {
    throw createError({
      statusCode: 404,
      statusMessage: `Artifact "${slug}" not found in project "${project}"`
    })
  }
})
