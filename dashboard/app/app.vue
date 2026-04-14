<script setup lang="ts">
/**
 * Root app.vue for BYOBrain Dashboard.
 * Now acts as a wrapper for NuxtLayouts and NuxtPages.
 */
useHead({
    title: 'BYOBrain Dashboard',
    meta: [
        { name: 'description', content: 'Local-first multi-agent workspace dashboard.' }
    ]
})
</script>

<template>
    <UApp>
        <NuxtLayout>
            <div class="h-full">
                <NuxtPage />
            </div>
        </NuxtLayout>
    </UApp>
</template>

<style>
/* Global styles in main.css */
</style>
