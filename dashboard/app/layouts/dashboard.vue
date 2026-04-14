<script setup lang="ts">
const route = useRoute()
const title = ref('BYOBrain Dashboard')

// Resizable Sidebar logic
const sidebarWidth = ref(300)
const isResizing = ref(false)

onMounted(() => {
    const savedWidth = localStorage.getItem('byob-sidebar-width')
    if (savedWidth) sidebarWidth.value = parseInt(savedWidth)

    const savedGroups = localStorage.getItem('byob-collapsed-groups')
    if (savedGroups) {
        try {
            collapsedGroups.value = JSON.parse(savedGroups)
        } catch (e) {
            console.error('Failed to parse collapsed groups', e)
        }
    }
})

const startResizing = () => {
    isResizing.value = true
    document.addEventListener('mousemove', handleResize)
    document.addEventListener('mouseup', stopResizing)
    document.body.style.cursor = 'col-resize'
}

const handleResize = (e: MouseEvent) => {
    if (!isResizing.value) return
    const newWidth = Math.max(200, Math.min(600, e.clientX))
    sidebarWidth.value = newWidth
}

const stopResizing = () => {
    isResizing.value = false
    localStorage.setItem('byob-sidebar-width', sidebarWidth.value.toString())
    document.removeEventListener('mousemove', handleResize)
    document.removeEventListener('mouseup', stopResizing)
    document.body.style.cursor = ''
}

// Mobile state
const isMobileSidebarOpen = ref(false)
const isMobileSidecarOpen = ref(false)

// Fetch projects and global knowledge for the sidebar
const { data: projectsData, refresh: refreshProjects } = await useFetch('/api/projects')
const { data: knowledgeData, refresh: refreshKnowledge } = await useFetch('/api/knowledge')

// Selection state derived from route
const currentProject = computed(() => route.params.project as string)
const currentType = computed(() => route.params.type as string)
const currentSlug = computed(() => route.params.slug as string)

// Tree expansion state
const expandedProjects = ref<Record<string, boolean>>({})

// Watch for route changes to auto-expand the current project
watch(currentProject, (newVal) => {
    if (newVal) expandedProjects.value[newVal] = true
}, { immediate: true })

const toggleProject = (name: string) => {
    expandedProjects.value[name] = !expandedProjects.value[name]
}

// Group expansion state (nested within projects)
const collapsedGroups = ref<Record<string, boolean>>({}) // key: project:type

const toggleGroup = (project: string, type: string) => {
    const key = `${project}:${type}`
    collapsedGroups.value[key] = !collapsedGroups.value[key]
    localStorage.setItem('byob-collapsed-groups', JSON.stringify(collapsedGroups.value))
}

const isGroupCollapsed = (project: string, type: string) => {
    return !!collapsedGroups.value[`${project}:${type}`]
}

// Global section toggles
const isKnowledgeExpanded = ref(true)
const isProjectsExpanded = ref(true)

const expandAll = () => {
    isKnowledgeExpanded.value = true
    isProjectsExpanded.value = true
    if (projectsData.value?.projects) {
        projectsData.value.projects.forEach(p => {
            expandedProjects.value[p] = true
        })
    }
}

const collapseAll = () => {
    isKnowledgeExpanded.value = false
    isProjectsExpanded.value = false
    Object.keys(expandedProjects.value).forEach(k => {
        expandedProjects.value[k] = false
    })
}


// Artifacts fetch for expanded projects
const projectArtifacts = ref<Record<string, any>>({})
const fetchArtifacts = async (name: string) => {
    if (projectArtifacts.value[name]) return
    const data = await $fetch(`/api/projects/${name}/artifacts`)
    if (data) {
        projectArtifacts.value[name] = data
    }
}

// Trigger fetch on expand
watch(expandedProjects, async (newVal) => {
    for (const name in newVal) {
        if (newVal[name]) await fetchArtifacts(name)
    }
}, { deep: true, immediate: true })
</script>

<template>
    <div
        class="h-screen flex flex-col bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30 selection:text-indigo-100 overflow-hidden">
        <header class="glass !rounded-none p-4 px-4 flex justify-between items-center border-b border-white/5 z-50">
            <div class="flex items-center gap-4">
                <button @click="isMobileSidebarOpen = !isMobileSidebarOpen"
                    class="lg:hidden p-2 text-slate-400 hover:text-white">
                    <UIcon name="i-lucide-menu" class="w-5 h-5" />
                </button>
                <NuxtLink to="/" class="group">
                    <h1 class="text-xl font-black text-white tracking-widest">BYOBrain</h1>
                </NuxtLink>
            </div>
            <div class="flex gap-4 items-center">
                <button @click="refreshProjects"
                    class="hidden sm:block p-2 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-all text-slate-400">
                    Refresh
                </button>
                <div
                    class="p-1 px-3 rounded-full text-[10px] font-bold uppercase tracking-widest bg-emerald-500/5 text-emerald-500 border border-emerald-500/20 flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span class="hidden sm:inline">Connected</span>
                </div>
            </div>
        </header>

        <main class="flex-1 flex overflow-hidden relative">
            <!-- Sidebar -->
            <aside
                class="flex flex-col bg-slate-900/10 border-r border-white/5 relative group shrink-0 transition-transform duration-300 z-40 lg:translate-x-0"
                :class="isMobileSidebarOpen ? 'fixed inset-y-0 left-0 translate-x-0 w-64 glass' : 'hidden lg:flex -translate-x-full lg:translate-x-0'"
                :style="!isMobileSidebarOpen ? { width: `${sidebarWidth}px` } : {}">
                <!-- Sidebar Toolbar (Independent of tree padding) -->
                <div class="flex justify-between items-center px-4 py-2 border-b border-white/5 bg-slate-900/20">
                    <span class="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Cortex</span>
                    <div
                        class="flex items-center gap-0.5 glass p-0.5 rounded-lg border border-white/5 shadow-inner shadow-white/5">
                        <button @click="expandAll"
                            class="p-1 rounded-md text-slate-500 hover:text-indigo-400 hover:bg-white/5 transition-all"
                            title="Expand All">
                            <UIcon name="i-lucide-unfold-vertical" class="w-3.5 h-3.5" />
                        </button>
                        <button @click="collapseAll"
                            class="p-1 rounded-md text-slate-500 hover:text-indigo-400 hover:bg-white/5 transition-all"
                            title="Collapse All">
                            <UIcon name="i-lucide-fold-vertical" class="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-8">

                    <!-- Global Knowledge Section -->
                    <div v-if="knowledgeData?.knowledge?.length">
                        <div @click="isKnowledgeExpanded = !isKnowledgeExpanded"
                            class="group/header cursor-pointer flex items-center justify-between mb-4 px-2">
                            <h2
                                class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 group-hover/header:text-slate-400 transition-colors">
                                Knowledge</h2>
                            <UIcon :name="isKnowledgeExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                                class="w-3 h-3 text-slate-700 opacity-0 group-hover/header:opacity-100 transition-all" />
                        </div>

                        <div v-if="isKnowledgeExpanded" class="space-y-0.5 px-1">
                            <NuxtLink v-for="item in knowledgeData.knowledge" :key="item.slug"
                                :to="`/knowledge/${item.slug}`"
                                class="p-2 px-3 rounded-xl cursor-pointer block truncate transition-all flex items-center gap-3 text-sm"
                                :class="route.path === `/knowledge/${item.slug}` ? 'bg-indigo-500/10 text-indigo-100 font-bold' : 'hover:bg-white/5 text-slate-500'">
                                <UIcon name="i-lucide-book" class="w-4 h-4 opacity-40 shrink-0" />
                                <span class="truncate">{{ item.title }}</span>
                            </NuxtLink>
                        </div>
                    </div>

                    <div v-if="projectsData?.projects?.length">
                        <div @click="isProjectsExpanded = !isProjectsExpanded"
                            class="group/header cursor-pointer flex items-center justify-between mb-4 px-2">
                            <h2
                                class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 group-hover/header:text-slate-400 transition-colors">
                                Projects</h2>
                            <UIcon :name="isProjectsExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                                class="w-3 h-3 text-slate-700 opacity-0 group-hover/header:opacity-100 transition-all" />
                        </div>

                        <div v-if="isProjectsExpanded" class="space-y-4">
                            <div v-for="project in projectsData?.projects || []" :key="project" class="space-y-1">
                                <div @click="toggleProject(project)"
                                    class="p-2 px-3 rounded-xl cursor-pointer transition-all flex items-center justify-between"
                                    :class="currentProject === project ? 'bg-indigo-500/5 text-indigo-400' : 'hover:bg-white/5 text-slate-400'">
                                    <div class="font-bold text-sm flex items-center gap-2">
                                        <UIcon
                                            :name="expandedProjects[project] ? 'i-lucide-folder-open' : 'i-lucide-folder'"
                                            class="w-4 h-4 opacity-50" />
                                        {{ project }}
                                    </div>
                                </div>

                                <!-- Nested Artifacts -->
                                <div v-if="expandedProjects[project]" class="pl-2 space-y-4 pt-2">
                                    <!-- Category: Plans -->
                                    <div v-if="projectArtifacts[project]?.plans?.length" class="mb-1">
                                        <div @click="toggleGroup(project, 'plans')"
                                            class="group/category flex items-center justify-between text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1 pl-4 py-1 cursor-pointer hover:text-slate-400 transition-colors">
                                            <span>Plans</span>
                                            <UIcon
                                                :name="isGroupCollapsed(project, 'plans') ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
                                                class="w-3 h-3 mr-2 opacity-0 group-hover/category:opacity-100 transition-all" />
                                        </div>
                                        <div v-if="!isGroupCollapsed(project, 'plans')" class="space-y-0.5">
                                            <NuxtLink v-for="plan in projectArtifacts[project].plans" :key="plan.slug"
                                                :to="`/${project}/plan/${plan.slug}`"
                                                class="p-2 px-4 rounded-lg text-[11px] cursor-pointer block truncate transition-all"
                                                :class="currentSlug === plan.slug ? 'bg-indigo-500/10 text-indigo-100 font-bold' : 'hover:bg-white/5 text-slate-500'">
                                                {{ plan.title }}
                                            </NuxtLink>
                                        </div>
                                    </div>

                                    <!-- Category: Tasks -->
                                    <div v-if="projectArtifacts[project]?.tasks?.length" class="mb-1">
                                        <div @click="toggleGroup(project, 'tasks')"
                                            class="group/category flex items-center justify-between text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1 pl-4 py-1 cursor-pointer hover:text-slate-400 transition-colors">
                                            <span>Tasks</span>
                                            <UIcon
                                                :name="isGroupCollapsed(project, 'tasks') ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
                                                class="w-3 h-3 mr-2 opacity-0 group-hover/category:opacity-100 transition-all" />
                                        </div>
                                        <div v-if="!isGroupCollapsed(project, 'tasks')" class="space-y-0.5">
                                            <NuxtLink v-for="task in projectArtifacts[project].tasks" :key="task.slug"
                                                :to="`/${project}/task/${task.slug}`"
                                                class="p-2 px-4 rounded-lg text-[11px] cursor-pointer block truncate transition-all"
                                                :class="currentSlug === task.slug ? 'bg-indigo-500/10 text-indigo-100 font-bold' : 'hover:bg-white/5 text-slate-500'">
                                                {{ task.title }}
                                            </NuxtLink>
                                        </div>
                                    </div>

                                    <!-- Category: Walkthroughs -->
                                    <div v-if="projectArtifacts[project]?.walkthroughs?.length" class="mb-1">
                                        <div @click="toggleGroup(project, 'walkthroughs')"
                                            class="group/category flex items-center justify-between text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1 pl-4 py-1 cursor-pointer hover:text-slate-400 transition-colors">
                                            <span>Walkthroughs</span>
                                            <UIcon
                                                :name="isGroupCollapsed(project, 'walkthroughs') ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
                                                class="w-3 h-3 mr-2 opacity-0 group-hover/category:opacity-100 transition-all" />
                                        </div>
                                        <div v-if="!isGroupCollapsed(project, 'walkthroughs')" class="space-y-0.5">
                                            <NuxtLink v-for="walkthrough in projectArtifacts[project].walkthroughs"
                                                :key="walkthrough.slug"
                                                :to="`/${project}/walkthrough/${walkthrough.slug}`"
                                                class="p-2 px-4 rounded-lg text-[11px] cursor-pointer block truncate transition-all"
                                                :class="currentSlug === walkthrough.slug ? 'bg-indigo-500/10 text-indigo-100 font-bold' : 'hover:bg-white/5 text-slate-500'">
                                                {{ walkthrough.title }}
                                            </NuxtLink>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Resize Handle -->
                <div @mousedown="startResizing"
                    class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-indigo-500/50 transition-colors z-50 mr-[-0.5px]">
                </div>
            </aside>

            <!-- Main Viewer Area -->
            <section class="flex-1 min-w-0 flex flex-col bg-slate-950/40 overflow-hidden">
                <div class="flex-1 overflow-y-auto p-4 sm:p-8">
                    <slot />
                </div>
            </section>

            <!-- Right Feedback Sidebar Area (Teleported into by pages) -->
            <div id="right-sidebar" class="shrink-0 empty:hidden"></div>
        </main>

        <footer
            class="p-3 px-6 glass !rounded-none border-t border-white/5 flex justify-between items-center text-[9px] text-slate-600 font-bold uppercase tracking-widest z-50">
            <div class="flex items-center gap-4">
                <span>Protocol v0.5.0</span>
                <span class="text-slate-800">|</span>
                <span>Environment: Production</span>
            </div>
            <div>&copy; 2026 Impractical Applications</div>
        </footer>
    </div>
</template>
