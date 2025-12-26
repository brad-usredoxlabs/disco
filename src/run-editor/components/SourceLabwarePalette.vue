<template>
  <div class="palette-row">
    <div class="palette-panel">
      <div class="palette-header">
        <p class="palette-title">Source labware</p>
        <div class="palette-actions">
          <button class="ghost-button tiny" type="button" @click="$emit('open-template')">+ Add template</button>
          <button class="ghost-button tiny" type="button" @click="$emit('open-run')">+ Add from run</button>
        </div>
      </div>
      <div v-if="!sources.length" class="palette-empty">No sources yet. Add a template or past run.</div>
      <ul v-else class="palette-list">
        <li v-for="entry in sources" :key="entry.labwareId" class="palette-item">
          <label class="palette-item__label">
            <input
              type="radio"
              name="active-source"
              :value="entry.labwareId"
              :checked="entry.labwareId === activeSourceId"
              @change="$emit('select', entry.labwareId)"
            />
            <span class="palette-item__text">
              {{ entry.label || entry.labwareId }}
              <span class="palette-item__meta">
                {{ entry.kind || entry.type }}
                <span v-if="statuses?.[entry.labwareId]?.loading">· loading…</span>
                <span v-else-if="statuses?.[entry.labwareId]?.error" class="error">
                  · {{ statuses[entry.labwareId].error }}
                </span>
              </span>
            </span>
          </label>
          <button class="ghost-button tiny" type="button" @click="$emit('remove', entry.labwareId)">
            Remove
          </button>
        </li>
      </ul>
    </div>
    <div class="destination-card">
      <div class="palette-header">
        <p class="palette-title">Destination plate</p>
      </div>
      <div>
        <p class="palette-destination__label">{{ currentDestinationLabel }}</p>
        <p class="palette-destination__meta">{{ currentDestinationId }}</p>
        <label class="destination-type-selector">
          <span class="destination-type-label">Plate type</span>
          <select @change="handleTypeChange" :value="destination?.kind || 'plate96'">
            <option value="plate96">96-well plate</option>
            <option value="plate384">384-well plate</option>
            <option value="reservoir-12">12-well reservoir</option>
            <option value="reservoir-96">96-well reservoir</option>
          </select>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  sources: {
    type: Array,
    default: () => []
  },
  activeSourceId: {
    type: String,
    default: ''
  },
  statuses: {
    type: Object,
    default: () => ({})
  },
  destination: {
    type: Object,
    default: () => ({})
  },
  selectedDestinationId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['select', 'remove', 'open-template', 'open-run', 'change-destination-type'])

const showDestinationSelector = ref(false)

const currentDestinationLabel = computed(() => {
  if (props.selectedDestinationId && props.selectedDestinationId !== props.destination?.id) {
    const sourceEntry = props.sources.find(s => s.labwareId === props.selectedDestinationId)
    return sourceEntry?.label || props.selectedDestinationId
  }
  return props.destination?.label || props.destination?.id || 'Destination'
})

const currentDestinationId = computed(() => {
  if (props.selectedDestinationId && props.selectedDestinationId !== props.destination?.id) {
    const sourceEntry = props.sources.find(s => s.labwareId === props.selectedDestinationId)
    return sourceEntry?.labwareId || props.selectedDestinationId
  }
  return props.destination?.id || ''
})

function handleTypeChange(event) {
  const newType = event.target.value
  emit('change-destination-type', newType)
}
</script>

<style scoped>
.palette-row {
  display: grid;
  grid-template-columns: 1fr 240px;
  gap: 12px;
  align-items: start;
}
.palette-panel {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.palette-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.palette-title {
  margin: 0;
  font-weight: 700;
  font-size: 13px;
}
.palette-actions {
  display: flex;
  gap: 6px;
}
.palette-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 6px;
}
.palette-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
}
.palette-item__label {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1;
}
.palette-item__text {
  display: flex;
  flex-direction: column;
  font-size: 13px;
  gap: 2px;
}
.palette-item__meta {
  color: #64748b;
  font-size: 12px;
}
.palette-item__meta .error {
  color: #b91c1c;
}
.palette-empty {
  font-size: 13px;
  color: #64748b;
}
.destination-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  background: #fff;
}
.palette-destination__label {
  margin: 0;
  font-weight: 600;
}
.palette-destination__meta {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
}
.destination-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.destination-option {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
  cursor: pointer;
}
.destination-option:hover {
  background: #f1f5f9;
}
.destination-option__text {
  display: flex;
  flex-direction: column;
  font-size: 13px;
  gap: 2px;
}
.destination-option__meta {
  color: #64748b;
  font-size: 12px;
}
.destination-type-selector {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
}
.destination-type-label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}
.destination-type-selector select {
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  color: #0f172a;
  cursor: pointer;
}
.destination-type-selector select:hover {
  border-color: #cbd5e1;
}
.destination-type-selector select:focus {
  outline: none;
  border-color: #3b4cca;
  box-shadow: 0 0 0 2px rgba(59, 76, 202, 0.1);
}
</style>
