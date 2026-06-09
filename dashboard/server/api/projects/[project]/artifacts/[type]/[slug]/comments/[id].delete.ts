export default defineEventHandler(async (event) => {
  const project = getRouterParam(event, 'project')
  const slug = getRouterParam(event, 'slug')
  const commentId = getRouterParam(event, 'id')

  if (!project || !slug || !commentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing project, slug, or comment ID'
    })
  }

  const brain = useBrain()
  await brain.deleteComment(project, slug, commentId)

  return { success: true }
})
