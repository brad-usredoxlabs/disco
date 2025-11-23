<template>
  <node-view-wrapper class="protocol-step" :class="{ 'has-errors': hasErrors }">
    <div class="step-header" @click="toggleExpanded">
      <span class="step-number">Step {{ node.attrs.stepNumber }}</span>
      <span class="step-name">{{ localAttrs.name || 'Untitled step' }}</span>
      <span class="spacer" />
      <button type="button" class="toggle-btn" @click.stop="toggleExpanded">
        {{ isExpanded ? 'Hide' : 'Show' }}
      </button>
      <button type="button" class="delete-btn" @click.stop="deleteNode">✕</button>
    </div>
    <div v-if="isExpanded" class="step-body">
      <div class="form-group">
        <label>Step name *</label>
        <input type="text" v-model="localAttrs.name" @input="emitAttributes" />
      </div>
      <div class="form-group">
        <label>Description *</label>
        <textarea rows="3" v-model="localAttrs.description" @input="emitAttributes" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Duration</label>
          <input type="text" v-model="localAttrs.duration" @input="emitAttributes" placeholder="e.g., 30 min" />
        </div>
        <div class="form-group">
          <label>Acceptance criteria</label>
          <input type="text" v-model="localAttrs.acceptanceCriteria" @input="emitAttributes" />
        </div>
      </div>
      <div class="form-group">
        <label>Inputs</label>
        <div class="list-items">
          <div v-for="(input, idx) in localAttrs.inputs" :key="`input-${idx}`" class="list-item">
            <input type="text" v-model="localAttrs.inputs[idx]" @input="emitAttributes" />
            <button type="button" @click="removeInput(idx)">✕</button>
          </div>
          <button type="button" class="secondary" @click="addInput">+ Add input</button>
        </div>
      </div>
      <div class="form-group">
        <label>Equipment</label>
        <div class="list-items">
          <div v-for="(item, idx) in localAttrs.equipment" :key="`equipment-${idx}`" class="list-item">
            <input type="text" v-model="localAttrs.equipment[idx]" @input="emitAttributes" />
            <button type="button" @click="removeEquipment(idx)">✕</button>
          </div>
          <button type="button" class="secondary" @click="addEquipment">+ Add equipment</button>
        </div>
      </div>
      <div v-if="hasErrors" class="validation-errors">
        <strong>Validation:</strong>
        <ul>
          <li v-for="(message, index) in node.attrs.validationErrors" :key="index">
            {{ message }}
          </li>
        </ul>
      </div>
    </div>
  </node-view-wrapper>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'

const props = defineProps({
  node: {
    type: Object,
    required: true
  },
  updateAttributes: {
    type: Function,
    required: true
  },
  deleteNode: {
    type: Function,
    required: true
  }
})

const isExpanded = ref(false)
const localAttrs = ref({
  name: props.node.attrs.name,
  description: props.node.attrs.description,
  duration: props.node.attrs.duration,
  inputs: [...props.node.attrs.inputs],
  equipment: [...props.node.attrs.equipment],
  acceptanceCriteria: props.node.attrs.acceptanceCriteria
})

const hasErrors = computed(
  () => Array.isArray(props.node.attrs.validationErrors) && props.node.attrs.validationErrors.length > 0
)

function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}

function emitAttributes() {
  const errors = []
  if (!localAttrs.value.name?.trim()) {
    errors.push('Step name is required')
  }
  if (!localAttrs.value.description?.trim()) {
    errors.push('Description is required')
  }

  props.updateAttributes({
    ...localAttrs.value,
    validationErrors: errors
  })
}

function addInput() {
  localAttrs.value.inputs.push('')
  emitAttributes()
}

function removeInput(index) {
  localAttrs.value.inputs.splice(index, 1)
  emitAttributes()
}

function addEquipment() {
  localAttrs.value.equipment.push('')
  emitAttributes()
}

function removeEquipment(index) {
  localAttrs.value.equipment.splice(index, 1)
  emitAttributes()
}

watch(
  () => props.node.attrs,
  (attrs) => {
    localAttrs.value = {
      name: attrs.name,
      description: attrs.description,
      duration: attrs.duration,
      inputs: [...attrs.inputs],
      equipment: [...attrs.equipment],
      acceptanceCriteria: attrs.acceptanceCriteria
    }
  },
  { deep: true }
)
</script>

<style scoped>
.protocol-step {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin: 1rem 0;
  background: #fff;
}

.protocol-step.has-errors {
  border-color: #f87171;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.9rem;
  background: #f9fafb;
  cursor: pointer;
  user-select: none;
}

.step-number {
  font-weight: 600;
  color: #2563eb;
}

.step-name {
  font-weight: 500;
  color: #111827;
}

.spacer {
  flex: 1;
}

.toggle-btn,
.delete-btn {
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.delete-btn {
  color: #b91c1c;
}

.step-body {
  padding: 1rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #374151;
}

.form-group input,
.form-group textarea {
  font-size: 0.9rem;
  padding: 0.45rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-family: inherit;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.list-items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.list-item {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.list-item button {
  border: 1px solid #fca5a5;
  color: #b91c1c;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

.list-item input {
  flex: 1;
}

.secondary {
  align-self: flex-start;
  border: 1px dashed #cbd5f5;
  background: transparent;
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.validation-errors {
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 0.75rem;
  background: #fef2f2;
  color: #991b1b;
}

.validation-errors ul {
  margin: 0.35rem 0 0;
  padding-left: 1.25rem;
}
</style>
