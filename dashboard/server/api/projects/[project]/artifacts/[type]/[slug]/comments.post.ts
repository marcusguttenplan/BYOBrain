export default defineEventHandler(async (event) => {
  const project = getRouterParam(event, 'project')
  const slug = getRouterParam(event, 'slug')

  if (!project || !slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project and slug are required'
    })
  }

  const body = await readBody(event)
  if (!body.user || !body.text) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User and text are required'
    })
  }

  const brain = useBrain()
  try {
    const comment = await brain.saveComment(project, slug, {
      user: body.user,
      text: body.text,
      selection: body.selection
    })
    
    return {
      comment
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to save comment'
    })
  }
})
