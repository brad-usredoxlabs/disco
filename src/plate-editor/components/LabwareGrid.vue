<script setup>
import PlateGrid from './PlateGrid.vue'

const props = defineProps({
  layoutIndex: {
    type: Object,
    required: true
  },
  wells: {
    type: Object,
    default: () => ({})
  },
  selection: {
    type: [Array, Object],
    default: () => []
  },
  title: {
    type: String,
    default: ''
  },
  subtitle: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['well-click'])

function handleWellClick(payload) {
  emit('well-click', payload)
}

function normalizeSelection(selectionInput) {
  if (Array.isArray(selectionInput)) return selectionInput
  if (selectionInput && Array.isArray(selectionInput.value)) return selectionInput.value
  return []
}
</script>

<template>
  <div class="labware-grid">
    <header class="labware-grid__header" v-if="title || subtitle">
      <div class="labware-grid__titles">
        <p v-if="title" class="labware-grid__title">{{ title }}</p>
        <p v-if="subtitle" class="labware-grid__subtitle">{{ subtitle }}</p>
      </div>
    </header>
    <PlateGrid
      :layout-index="layoutIndex"
      :wells="wells"
      :selection="normalizeSelection(selection)"
      @well-click="handleWellClick"
    />
  </div>
</template>

<style scoped>
.labware-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.labware-grid__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.labware-grid__titles {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.labware-grid__title {
  margin: 0;
  font-weight: 700;
  color: #0f172a;
}

.labware-grid__subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
}
</style>
