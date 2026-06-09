import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Slug is required'
    })
  }

  const runtimeConfig = useRuntimeConfig()
  const brainDir = runtimeConfig.brainDir || process.env.BRAIN_DIR

  try {
    const dir = join(brainDir, 'knowledge')
    const filePath = join(dir, `${slug}.md`)
    const raw = await readFile(filePath, 'utf-8')
    
    // Split frontmatter and content
    const match = raw.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
    
    return {
      slug,
      frontmatter: match ? match[1] : '',
      content: match ? match[2] : raw
    }
  } catch (error) {
    throw createError({
      statusCode: 404,
      statusMessage: `Knowledge item "${slug}" not found`
    })
  }
})
