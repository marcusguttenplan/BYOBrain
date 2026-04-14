export default defineEventHandler(async (event) => {
  const brain = useBrain()
  try {
    const knowledge = await brain.listArtifacts('', 'knowledge')
    return {
      knowledge
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to list global knowledge items'
    })
  }
})
