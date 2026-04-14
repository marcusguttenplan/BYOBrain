<script setup lang="ts">
// Page for specific Global Knowledge Item Viewer
definePageMeta({
  layout: 'dashboard'
})

const route = useRoute()
const slug = computed(() => route.params.slug as string)

const onCommentSaved = () => {
  commentPanelRef.value?.refresh()
}

// Management UI State
const isDeleting = ref(false)
const isUpdatingStatus = ref(false)
const isDeleteModalOpen = ref(false)
const router = useRouter()

const deleteItem = async () => {
  isDeleting.value = true
  try {
    await $fetch(`/api/knowledge/${slug.value}`, {
      method: 'DELETE'
    })
    isDeleteModalOpen.value = false
    router.push('/')
  } catch (err) {
    console.error('Failed to delete knowledge item:', err)
  } finally {
    isDeleting.value = false
  }
}

const updateStatus = async (newStatus: string) => {
  if (newStatus === statusValue.value) return
  isUpdatingStatus.value = true
  try {
    await $fetch(`/api/knowledge/${slug.value}/status`, {
      method: 'PATCH',
      body: { status: newStatus }
    })
    refresh()
  } catch (err) {
    console.error('Failed to update knowledge status:', err)
  } finally {
    isUpdatingStatus.value = false
  }
}

const statusOptions = [
  [{ label: 'DRAFT', icon: 'i-lucide-file-text', click: () => updateStatus('draft') }],
  [{ label: 'ACTIVE', icon: 'i-lucide-play', click: () => updateStatus('active') }],
  [{ label: 'COMPLETED', icon: 'i-lucide-check-circle', click: () => updateStatus('completed') }],
  [{ label: 'ABANDONED', icon: 'i-lucide-archive', click: () => updateStatus('abandoned') }]
]

// Fetch Knowledge Item content
const { data: item, status, refresh } = await useFetch(() => 
  `/api/knowledge/${slug.value}`,
  { watch: [slug] }
)

// Computed helpers for layout
const metadata = computed(() => {
  if (!item.value?.frontmatter) return {}
  const obj: Record<string, string> = {}
  item.value.frontmatter.split('\n').forEach(line => {
    const [k, ...v] = line.split(':')
    if (k && v.length) obj[k.trim().toLowerCase()] = v.join(':').trim()
  })
  return obj
})

const displayTitle = computed(() => metadata.value.title || slug.value)
const statusValue = computed(() => metadata.value.status || 'active')

const mainContentRaw = computed(() => {
  if (!item.value?.content) return ''
  // Strip YAML frontmatter
  return item.value.content.replace(/^[\s\S]*?---[\s\S]*?---\s*/, '').trim()
})

const extractedSubtitle = computed(() => {
  const match = mainContentRaw.value.match(/^#\s+(.*)/m)
  return match ? match[1] : null
})

const extractedDescription = computed(() => {
  // Strip H1 first, then find first non-empty paragraph
  const textWithoutH1 = mainContentRaw.value.replace(/^#\s+.*$/m, '').trim()
  const match = textWithoutH1.match(/^([^#\n].*)$/m)
  return match ? match[1] : null
})

const mainContent = computed(() => {
  let content = mainContentRaw.value
  // Strip the H1
  content = content.replace(/^#\s+.*$/m, '').trim()
  // Strip the first paragraph if it matches extractedDescription
  if (extractedDescription.value) {
    content = content.replace(extractedDescription.value, '').trim()
  }
  return content
})

// Analytics / Meta
useHead({
  title: () => item.value?.slug ? `${item.value.slug} - Knowledge` : 'Loading...'
})
</script>

<template>
  <div class="glass p-8 rounded-2xl min-h-full flex flex-col">
    <div v-if="item" class="flex flex-col">
      <header class="mb-10 pb-6 border-b border-white/5 flex justify-between items-start">
        <div>
          <!-- Metadata Pile (Simplified for Global KI) -->
          <div class="flex flex-wrap gap-4 items-center text-[9px] font-black uppercase tracking-[0.2em] text-slate-700 mb-6">
            <div class="flex items-center gap-2">
              <span>CONTEXT</span>
              <span class="text-indigo-400/60">GLOBAL KNOWLEDGE</span>
            </div>
            <div class="flex items-center gap-2">
              <span>TYPE</span>
              <span class="text-slate-500">knowledge</span>
            </div>
            <div class="flex items-center gap-2">
              <span>STATUS</span>
              <UDropdown :items="statusOptions" :popper="{ placement: 'bottom-start' }">
                <button 
                  class="px-1.5 py-0.5 rounded-sm border flex items-center gap-1 transition-colors"
                  :class="[
                    statusValue === 'completed' ? 'bg-emerald-500/5 text-emerald-500/80 border-emerald-500/10' : 
                    statusValue === 'abandoned' ? 'bg-slate-500/5 text-slate-500/80 border-slate-500/10' :
                    statusValue === 'draft' ? 'bg-indigo-500/5 text-indigo-500/80 border-indigo-500/10' :
                    'bg-amber-500/5 text-amber-500/80 border-amber-500/10',
                    isUpdatingStatus ? 'opacity-50 cursor-wait' : 'hover:bg-white/5'
                  ]"
                >
                  {{ statusValue }}
                  <UIcon name="i-lucide-chevron-down" class="w-3 h-3 opacity-40" />
                </button>
              </UDropdown>
            </div>
          </div>

          <h1 class="text-4xl font-extrabold tracking-tight text-white mb-3">{{ extractedSubtitle || displayTitle }}</h1>
          <p v-if="extractedDescription" class="text-lg text-slate-400 font-medium tracking-tight mb-4 max-w-4xl">{{ extractedDescription }}</p>
          <p class="text-slate-600 text-[10px] font-bold uppercase tracking-widest">{{ slug }}</p>
        </div>
        <div class="flex gap-4 items-center">
          <button 
            @click="isDeleteModalOpen = true"
            class="p-2 rounded-xl text-slate-600 hover:text-red-500 hover:bg-red-500/10 transition-all border border-white/5"
            title="Delete Knowledge Item"
          >
            <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
          </button>
        </div>
      </header>
      
      <div class="flex-1 relative">
         <MarkdownViewer 
            project="global"
            :slug="slug"
            type="knowledge"
            :content="mainContent" 
            :title="displayTitle"
            :frontmatter="item.frontmatter"
            readonly
            @saved="onCommentSaved"
          />
      </div>

      <!-- Teleport Feedback Sidebar -->
      <Teleport to="#right-sidebar">
        <div v-if="isCommentPanelOpen" class="w-[380px] h-full flex flex-col bg-slate-900/40 border-l border-white/5 p-6 pb-24 overflow-hidden">
          <div class="flex justify-between items-center mb-8">
            <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Active Review</h3>
            <button @click="isCommentPanelOpen = false" class="text-slate-600 hover:text-white transition-colors">
              <UIcon name="i-lucide-x" class="w-4 h-4" />
            </button>
          </div>

          <div class="flex-1 overflow-hidden flex flex-col">
            <CommentPanel 
                ref="commentPanelRef"
                project="global" 
                :slug="slug" 
                type="knowledge" 
            />
          </div>
        </div>
      </Teleport>

      <!-- Delete Confirmation Modal (Manual Overlay) -->
      <Teleport to="body">
        <div v-if="isDeleteModalOpen" class="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div class="glass max-w-sm w-full p-8 rounded-3xl border border-white/10 shadow-2xl overflow-hidden relative">
            <!-- Glow effect -->
            <div class="absolute -top-24 -right-24 w-48 h-48 bg-red-500/10 blur-[80px] rounded-full"></div>
            
            <div class="relative z-10">
              <div class="flex items-center gap-4 mb-6">
                <div class="p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
                  <UIcon name="i-lucide-alert-triangle" class="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h3 class="text-xl font-bold text-white">Delete Knowledge Item?</h3>
                  <p class="text-slate-400 text-sm">This action is permanent.</p>
                </div>
              </div>
              
              <div class="bg-white/5 rounded-2xl p-4 mb-8 border border-white/5">
                <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Target</p>
                <p class="text-sm font-mono text-slate-300 break-all">knowledge/{{ slug }}.md</p>
              </div>

              <div class="flex gap-4">
                <button 
                  @click="isDeleteModalOpen = false"
                  class="flex-1 py-3 rounded-xl border border-white/10 text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button 
                  @click="deleteItem"
                  :disabled="isDeleting"
                  class="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-bold text-white transition-all shadow-lg shadow-red-600/20 disabled:opacity-50"
                >
                  <span v-if="isDeleting" class="flex items-center justify-center gap-2">
                    <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
                    Deleting...
                  </span>
                  <span v-else>Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Teleport>
    </div>

    <div v-else-if="status === 'pending'" class="h-full flex flex-col items-center justify-center">
      <div class="animate-spin i-lucide-loader-2 w-10 h-10 opacity-20 text-indigo-500"></div>
    </div>

    <div v-else class="h-full flex flex-col items-center justify-center text-center">
      <div class="p-6 rounded-3xl bg-red-500/5 mb-6 border border-red-500/10">
        <UIcon name="i-lucide-alert-circle" class="w-12 h-12 text-red-500 opacity-40" />
      </div>
      <h2 class="text-2xl font-bold mb-2">Knowledge Item Not Found</h2>
      <p class="text-slate-500 max-w-sm">The requested knowledge item could not be located in your brain.</p>
    </div>
  </div>
</template>
