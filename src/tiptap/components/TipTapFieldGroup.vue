<template>
  <section class="field-group">
    <header class="field-group-header">
      <div>
        <p class="field-group-label">{{ groupLabel }}</p>
        <h4>{{ groupTitle }}</h4>
      </div>
      <p v-if="group.description" class="field-group-description">{{ group.description }}</p>
    </header>
    <div class="field-group-body">
      <TipTapFieldInput
        v-for="field in group.fields"
        :key="field.name"
        :name="field.name"
        :schema="field.schema"
        :config="field.config"
        :model-value="field.value"
        :errors="field.errors || []"
        :disabled="field.disabled"
        @update:model-value="(value) => emit('update-field', field.name, value)"
      />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import TipTapFieldInput from './TipTapFieldInput.vue'

const props = defineProps({
  group: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['update-field'])

const groupTitle = computed(() => props.group.title || humanize(props.group.name))
const groupLabel = computed(() => props.group.label || 'Metadata')

function humanize(text = '') {
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase())
}
</script>

<style scoped>
.field-group {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 1rem;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.field-group-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.field-group-label {
  margin: 0;
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.field-group-header h4 {
  margin: 0.2rem 0 0;
  font-size: 1rem;
  color: #0f172a;
}

.field-group-description {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
}

.field-group-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
