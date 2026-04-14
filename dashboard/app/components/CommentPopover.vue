<script setup lang="ts">
const props = defineProps<{
  project: string
  slug: string
  type: string
  selection: string
  rect: { top: number, left: number, bottom: number, right: number }
  clickCoords?: { x: number, y: number } | null
}>()

const emit = defineEmits(['close', 'saved'])

const text = ref('')
const isPosting = ref(false)

const handleSave = async () => {
  if (!text.value.trim()) return
  
  isPosting.value = true
  try {
    await $fetch(`/api/projects/${props.project}/artifacts/${props.type}/${props.slug}/comments`, {
      method: 'POST',
      body: {
        user: 'User',
        text: text.value,
        selection: props.selection
      }
    })
    emit('saved')
    emit('close')
  } finally {
    isPosting.value = false
  }
}

const style = computed(() => {
  const popoverWidth = 320 
  const viewportWidth = window.innerWidth
  const padding = 20
  
  // Use click coordinates if available, otherwise fallback to centering on rect
  let left: number
  let top: number
  
  if (props.clickCoords) {
    left = props.clickCoords.x - (popoverWidth / 2)
    top = props.clickCoords.y + 10
  } else {
    // Fallback: Center it on the selection's horizontal midpoint
    const selectionCenter = props.rect.left + (props.rect.width / 2)
    left = selectionCenter - (popoverWidth / 2)
    top = props.rect.bottom + 10
  }
  
  // Clamp it to screen edges
  left = Math.max(padding, Math.min(viewportWidth - popoverWidth - padding, left))
  top = Math.max(padding, Math.min(window.innerHeight - 300, top))

  return {
    position: 'fixed' as const,
    top: `${top}px`,
    left: `${left}px`
  }
})
</script>

<template>
  <div 
    class="absolute z-50 glass p-4 rounded-2xl w-80 shadow-2xl border-white/10 animate-fade-in"
    :style="style"
  >
      <div class="space-y-4">
        <div class="flex items-center gap-2 bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20">
          <UIcon name="i-lucide-quote" class="w-3 h-3 text-indigo-400 flex-shrink-0" />
          <span class="text-[10px] text-indigo-200 truncate italic">"{{ selection }}"</span>
        </div>

        <textarea 
          v-model="text"
          placeholder="What do you think?"
          class="w-full h-24 bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
          autofocus
          @keydown.meta.enter="handleSave"
        ></textarea>

        <div class="flex gap-2">
          <button 
            @click="emit('close')"
            class="flex-1 p-2 rounded-xl border border-white/10 text-xs font-bold hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button 
            @click="handleSave"
            :disabled="isPosting || !text.trim()"
            class="flex-1 p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold transition-all disabled:opacity-50"
          >
            {{ isPosting ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fade-in 0.2s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
