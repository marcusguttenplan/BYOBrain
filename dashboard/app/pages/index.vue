<script setup lang="ts">
definePageMeta({
    layout: 'dashboard'
})
</script>

<template>
    <div class="glass p-8 rounded-2xl h-full flex flex-col items-center justify-center text-center">
        <div class="p-6 rounded-3xl bg-indigo-500/5 mb-6 border border-indigo-500/10">
            <UIcon name="i-lucide-layout" class="w-12 h-12 text-indigo-500 opacity-40" />
        </div>
        <h2 class="text-2xl font-bold mb-2">BYOBrain Cortex</h2>
        <p class="text-slate-500 max-w-sm">
            Select a project from the sidebar to begin exploring your brain context. Slugs are ordered descending by
            their last updated timestamp.
        </p>
    </div>
</template>
