
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({
        statusCode: 400,
        statusMessage: 'Missing slug'
    })
  }

  const brain = useBrain()
  try {
    // For knowledge items, project is empty and type is 'knowledge'
    await brain.deleteArtifact('', 'knowledge', slug)
    return { success: true }
  } catch (error: any) {
    throw createError({
        statusCode: 500,
        statusMessage: error.message || 'Failed to delete knowledge item'
    })
  }
})
