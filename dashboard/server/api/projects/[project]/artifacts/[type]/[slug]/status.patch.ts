
export default defineEventHandler(async (event) => {
  const project = getRouterParam(event, 'project')
  const type = getRouterParam(event, 'type')
  const slug = getRouterParam(event, 'slug')
  const { status } = await readBody(event)

  if (!project || !type || !slug || !status) {
    throw createError({
        statusCode: 400,
        statusMessage: 'Missing parameters'
    })
  }

  const brain = useBrain()
  try {
    await brain.updateArtifactStatus(project, type, slug, status)
    return { success: true }
  } catch (error: any) {
    throw createError({
        statusCode: 500,
        statusMessage: error.message || 'Failed to update status'
    })
  }
})
