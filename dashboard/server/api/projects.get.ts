export default defineEventHandler(async () => {
  const brain = useBrain()
  try {
    const projects = await brain.listProjects()
    return {
      projects
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to list projects'
    })
  }
})
