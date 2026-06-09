export default defineEventHandler(async (event) => {
  const project = getRouterParam(event, 'project')
  if (!project) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project name is required'
    })
  }

  const brain = useBrain()
  try {
    const [plans, tasks, walkthroughs] = await Promise.all([
      brain.listArtifacts(project, 'plans'),
      brain.listArtifacts(project, 'tasks'),
      brain.listArtifacts(project, 'walkthroughs')
    ])

    return {
      plans,
      tasks,
      walkthroughs
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to list artifacts for project "${project}"`
    })
  }
})
