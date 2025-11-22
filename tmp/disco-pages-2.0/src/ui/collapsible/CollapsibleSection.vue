<template>
  <div class="collapsible-section" :class="{ 'is-collapsed': !isExpanded }">
    <button class="section-header" type="button" @click="toggleExpanded">
      <span class="toggle-icon">{{ isExpanded ? '▼' : '▶' }}</span>
      <span class="section-icon" v-if="icon">{{ icon }}</span>
      <span class="section-title">{{ title }}</span>
      <span v-if="badge" class="section-badge">{{ badge }}</span>
    </button>

    <div v-show="isExpanded" class="section-content">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  icon: {
    type: String,
    default: ''
  },
  badge: {
    type: String,
    default: ''
  },
  initiallyExpanded: {
    type: Boolean,
    default: true
  },
  storageKey: {
    type: String,
    default: ''
  }
})

const getSavedState = () => {
  if (props.storageKey && typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(`section-${props.storageKey}`)
    return saved !== null ? saved === 'true' : props.initiallyExpanded
  }
  return props.initiallyExpanded
}

const isExpanded = ref(getSavedState())

function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}

watch(isExpanded, (newValue) => {
  if (props.storageKey && typeof window !== 'undefined') {
    window.localStorage.setItem(`section-${props.storageKey}`, String(newValue))
  }
})
</script>

<style scoped>
.collapsible-section {
  margin-bottom: 1.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.collapsible-section.is-collapsed {
  background: #fafafa;
}

.section-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: #f9fafb;
  border: none;
  border-bottom: 1px solid #e5e7eb;
  cursor: pointer;
  text-align: left;
}

.section-header:hover {
  background: #f3f4f6;
}

.collapsible-section.is-collapsed .section-header {
  border-bottom: none;
}

.toggle-icon {
  font-size: 0.85rem;
  color: #6b7280;
  min-width: 1rem;
}

.section-icon {
  font-size: 1.1rem;
}

.section-title {
  flex: 1;
  font-weight: 600;
  color: #111827;
}

.section-badge {
  padding: 0.15rem 0.65rem;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: uppercase;
  background: #e0f2fe;
  color: #0369a1;
  letter-spacing: 0.05em;
}

.section-content {
  padding: 1.25rem;
}
</style>