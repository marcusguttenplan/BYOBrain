
export default defineEventHandler(async (event) => {
  const project = getRouterParam(event, 'project')
  const type = getRouterParam(event, 'type')
  const slug = getRouterParam(event, 'slug')

  if (!project || !type || !slug) {
    throw createError({
        statusCode: 400,
        statusMessage: 'Missing parameters'
    })
  }

  const brain = useBrain()
  try {
    await brain.deleteArtifact(project, type, slug)
    return { success: true }
  } catch (error: any) {
    throw createError({
        statusCode: 500,
        statusMessage: error.message || 'Failed to delete artifact'
    })
  }
})
