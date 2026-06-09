<script setup lang="ts">
const props = defineProps<{
  project: string
  slug: string
  type: string
}>()

const { data: comments, refresh } = await useFetch(() => 
  `/api/projects/${props.project}/artifacts/${props.type}/${props.slug}/comments`
)

defineExpose({ refresh })

const newCommentText = ref('')
const isPosting = ref(false)

const postComment = async () => {
  if (!newCommentText.value.trim()) return
  
  isPosting.value = true
  try {
    await $fetch(`/api/projects/${props.project}/artifacts/${props.type}/${props.slug}/comments`, {
      method: 'POST',
      body: {
        user: 'User',
        text: newCommentText.value
      }
    })
    newCommentText.value = ''
    await refresh()
  } finally {
    isPosting.value = false
  }
}

const deleteComment = async (id: string) => {
  if (!confirm('Are you sure you want to delete this comment?')) return
  
  try {
    await $fetch(`/api/projects/${props.project}/artifacts/${props.type}/${props.slug}/comments/${id}`, {
      method: 'DELETE'
    })
    await refresh()
  } catch (err) {
    console.error('Failed to delete comment:', err)
  }
}

// Time formatter
const formatDate = (date: string) => {
  const d = new Date(date)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- List -->
    <div class="flex-1 overflow-y-auto space-y-4 pr-2">
      <div v-if="!comments?.comments?.length" class="text-center py-12 text-slate-600 italic text-sm">
        No comments yet.
      </div>
      
      <div 
        v-for="comment in comments?.comments || []" :key="comment.id"
        class="glass p-4 rounded-xl border-white/5 space-y-2"
      >
        <div class="flex justify-between items-center text-[10px] uppercase tracking-widest font-bold">
          <span class="text-indigo-400">{{ comment.user }}</span>
          <div class="flex items-center gap-2">
            <span class="text-slate-600">{{ formatDate(comment.timestamp) }}</span>
            <button @click="deleteComment(comment.id)" class="text-slate-700 hover:text-red-500 transition-colors">
              <UIcon name="i-lucide-trash-2" class="w-3 h-3" />
            </button>
          </div>
        </div>
        <p class="text-sm text-slate-300 leading-relaxed">{{ comment.text }}</p>
        <div v-if="comment.selection" class="text-[10px] text-slate-500 border-l-2 border-indigo-500/40 pl-2 italic py-1 bg-indigo-500/5 rounded-r">
          "{{ comment.selection }}"
        </div>
      </div>
    </div>

    <!-- Input Area (General Feedback) -->
    <div class="mt-4 pt-4 border-t border-white/5 space-y-3">
      <h4 class="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-1">General Feedback</h4>
      <textarea 
        v-model="newCommentText"
        placeholder="Add a high-level thought..."
        class="w-full h-24 bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
      ></textarea>
      <button 
        @click="postComment"
        :disabled="isPosting || !newCommentText.trim()"
        class="w-full p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold transition-all"
      >
        {{ isPosting ? 'Posting...' : 'Post General Feedback' }}
      </button>
    </div>
  </div>
</template>
