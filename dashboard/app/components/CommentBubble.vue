<script setup lang="ts">
const props = defineProps<{
  rect: { top: number, left: number, bottom: number, right: number }
}>()

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

// Positioning logic: Using fixed coordinates relative to the viewport
const style = computed(() => ({
  position: 'fixed' as const,
  top: `${props.rect.top - 8}px`,
  left: `${props.rect.right + 12}px`
}))
</script>

<template>
  <button 
    @click.stop="emit('click', $event)"
    class="absolute z-40 glass p-2 rounded-xl text-indigo-400 hover:text-white hover:bg-indigo-600/50 border border-indigo-500/30 shadow-lg shadow-indigo-500/10 transition-all scale-animation flex items-center gap-2 group"
    :style="style"
  >
    <UIcon name="i-lucide-message-square-plus" class="w-4 h-4" />
    <span class="text-[10px] font-bold uppercase tracking-wider pr-1 group-hover:block hidden animate-fade-in">Comment</span>
  </button>
</template>

<style scoped>
.scale-animation {
  animation: scale-up 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.animate-fade-in {
  animation: fade-in 0.2s ease-out;
}

@keyframes scale-up {
  from { transform: scale(0.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes fade-in {
  from { opacity: 0; transform: translateX(-5px); }
  to { opacity: 1; transform: translateX(0); }
}
</style>
