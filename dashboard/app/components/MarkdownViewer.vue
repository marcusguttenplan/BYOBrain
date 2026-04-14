<script setup lang="ts">
import { marked } from 'marked'

const props = defineProps<{
  project: string
  slug: string
  type: string
  content: string
  title?: string
  frontmatter?: string
  readonly?: boolean
}>()

const emit = defineEmits(['saved'])
const containerRef = ref<HTMLElement | null>(null)

const selectionData = ref<{ text: string, rect: any } | null>(null)
const hoverData = ref<{ text: string, rect: any } | null>(null)
const clickCoords = ref<{ x: number, y: number } | null>(null)
const isPopoverOpen = ref(false)
let hoverTimeout: any = null

const handleMouseUp = () => {
  if (props.readonly) return
  const selection = window.getSelection()
  const text = selection?.toString().trim()
  
  if (text && text.length > 0 && containerRef.value) {
    const range = selection?.getRangeAt(0)
    const rect = range?.getBoundingClientRect()
    const containerRect = containerRef.value.getBoundingClientRect()
    
    if (rect) {
      selectionData.value = {
        text,
        rect: {
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right,
          width: rect.width,
          height: rect.height
        }
      }
    }
  } else {
    selectionData.value = null
    if (isPopoverOpen.value === false) {
      // Clear if not open
    }
  }
}

const handleMouseMove = (e: MouseEvent) => {
  if (props.readonly || !containerRef.value || selectionData.value || isPopoverOpen.value) {
    if (!isPopoverOpen.value && !selectionData.value) hoverData.value = null
    return
  }
  
  let target = e.target as HTMLElement
  if (target.nodeType === 3) target = target.parentElement as HTMLElement
  
  const block = target.closest('p, li, h1, h2, h3, h4, h5, h6, pre, blockquote') as HTMLElement
  
  if (block && containerRef.value?.contains(block)) {
    const isScrollingBlock = block.tagName === 'PRE' || block.scrollWidth > block.clientWidth
    
    if (isScrollingBlock) {
      const blockRect = block.getBoundingClientRect()
      if (hoverTimeout) clearTimeout(hoverTimeout)
      
      hoverData.value = {
        text: block.innerText.trim(),
        rect: {
          top: blockRect.top,
          left: blockRect.left,
          bottom: blockRect.bottom,
          right: blockRect.right,
          width: blockRect.width,
          height: blockRect.height
        }
      }
    } else {
      // Use a range to get the bounding rect of the TEXT ONLY
      const range = document.createRange()
      range.selectNodeContents(block)
      const rects = range.getClientRects()
      
      if (rects.length > 0) {
        const lastRect = rects[rects.length - 1]
        if (hoverTimeout) clearTimeout(hoverTimeout)

        hoverData.value = {
          text: block.innerText.trim(),
          rect: {
            top: lastRect.top,
            left: lastRect.left,
            bottom: lastRect.bottom,
            right: lastRect.right,
            width: lastRect.width,
            height: lastRect.height
          }
        }
      }
    }
  } else {
    // Dismiss with a slight delay (Hysteresis) to allow crossing the gap
    if (hoverTimeout) clearTimeout(hoverTimeout)
    hoverTimeout = setTimeout(() => {
      hoverData.value = null
    }, 150)
  }
}

const handleMouseLeave = () => {
  if (isPopoverOpen.value) return
  if (hoverTimeout) clearTimeout(hoverTimeout)
  hoverTimeout = setTimeout(() => {
    hoverData.value = null
  }, 300)
}

const clearHoverTimeout = () => {
  if (hoverTimeout) clearTimeout(hoverTimeout)
}

const activeContext = computed(() => selectionData.value || hoverData.value)

const onBubbleClick = (event: MouseEvent) => {
  if (event) {
    clickCoords.value = { x: event.clientX, y: event.clientY }
  }
  isPopoverOpen.value = true
}

const onSaved = () => {
  emit('saved')
  isPopoverOpen.value = false
  selectionData.value = null
  hoverData.value = null
  clickCoords.value = null
}

const parsedMetadata = computed(() => {
  if (!props.frontmatter) return []
  const lines = props.frontmatter.trim().split('\n')
  return lines.map(line => {
    const [key, ...val] = line.split(':')
    return { key: key.trim(), value: val.join(':').trim() }
  }).filter(m => m.key && m.value)
})

const renderedContent = computed(() => {
  return marked.parse(props.content || '')
})
</script>

<template>
  <div class="flex flex-col">
    <!-- Tiny Frontmatter Sidebar/Header -->
    <div class="mb-8 flex flex-col gap-1 border-l-2 border-indigo-500/20 pl-4 py-1">
      <div v-for="meta in parsedMetadata" :key="meta.key" class="flex gap-2 items-baseline">
        <span class="text-[8px] font-bold uppercase tracking-widest text-slate-600 w-16 shrink-0">{{ meta.key }}</span>
        <span class="text-[10px] text-slate-400 font-medium">{{ meta.value }}</span>
      </div>
    </div>

    <div 
      ref="containerRef"
      class="markdown-body relative prose prose-invert max-w-none px-1" 
      v-html="renderedContent"
      @mouseup="handleMouseUp"
      @mousemove="handleMouseMove"
      @mouseleave="handleMouseLeave"
    >
    </div>

    <!-- UI Overlay Layer (Teleport as sibling to avoid v-html override) -->
    <Teleport to="body" v-if="!readonly">
       <!-- Floating Bubble (Selection or Hover) -->
       <CommentBubble 
         v-if="activeContext && !isPopoverOpen" 
         :rect="activeContext.rect" 
         @click="onBubbleClick" 
         @mouseenter="clearHoverTimeout"
       />

       <!-- Floating Popover -->
       <CommentPopover 
         v-if="isPopoverOpen && activeContext"
         :project="project"
         :slug="slug"
         :type="type"
         :selection="activeContext.text"
         :rect="activeContext.rect"
         :click-coords="clickCoords"
         @close="{ isPopoverOpen = false; clickCoords = null }"
         @saved="onSaved"
       />
    </Teleport>
  </div>
</template>

<style>
/* Styles moved to main.css for stability */
</style>
