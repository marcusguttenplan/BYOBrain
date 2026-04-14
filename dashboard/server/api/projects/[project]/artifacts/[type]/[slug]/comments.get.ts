export default defineEventHandler(async (event) => {
  const project = getRouterParam(event, 'project')
  const slug = getRouterParam(event, 'slug')

  if (!project || !slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project and slug are required'
    })
  }

  const brain = useBrain()
  try {
    const comments = await brain.getComments(project, slug)
    return {
      comments
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load comments'
    })
  }
})
