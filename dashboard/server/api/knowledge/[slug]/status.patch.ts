
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const { status } = await readBody(event)

  if (!slug || !status) {
    throw createError({
        statusCode: 400,
        statusMessage: 'Missing parameters'
    })
  }

  const brain = useBrain()
  try {
    await brain.updateArtifactStatus('', 'knowledge', slug, status)
    return { success: true }
  } catch (error: any) {
    throw createError({
        statusCode: 500,
        statusMessage: error.message || 'Failed to update knowledge status'
    })
  }
})
