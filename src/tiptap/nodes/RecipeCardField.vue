<template>
  <div class="recipe-card">
    <div class="recipe-items">
      <div class="recipe-items-header">
        <span>Quantity</span>
        <span>Unit</span>
        <span>Reagent</span>
        <span>Notes</span>
      </div>
      <div
        class="recipe-item-row"
        v-for="(item, index) in state.items"
        :key="index"
      >
        <input
          type="text"
          class="recipe-input"
          v-model="item.quantity"
          placeholder="e.g. 10"
          :readonly="props.readOnly"
          :disabled="props.readOnly"
          @input="emitValue"
        />
        <input
          type="text"
          class="recipe-input"
          v-model="item.unit"
          placeholder="mL"
          :readonly="props.readOnly"
          :disabled="props.readOnly"
          @input="emitValue"
        />
        <OntologyFieldInput
          class="recipe-reagent"
          :value="item.reagent"
          :vocab="vocab"
          placeholder="Search reagent"
          :disabled="props.readOnly"
          @update:value="(val) => updateReagent(index, val)"
        />
        <input
          type="text"
          class="recipe-input"
          v-model="item.notes"
          placeholder="Notes"
          :readonly="props.readOnly"
          :disabled="props.readOnly"
          @input="emitValue"
        />
        <button v-if="!props.readOnly" type="button" class="recipe-remove" @click="removeItem(index)">×</button>
      </div>
      <button v-if="!props.readOnly" type="button" class="recipe-add" @click="addItem">+ Add ingredient</button>
    </div>

    <div class="recipe-steps">
      <p class="steps-label">Steps</p>
      <ol>
        <li v-for="(step, index) in state.steps" :key="index">
          <textarea
            v-model="state.steps[index]"
            rows="2"
            :readonly="props.readOnly"
            :disabled="props.readOnly"
            @input="emitValue"
          ></textarea>
          <button
            v-if="!props.readOnly"
            type="button"
            class="recipe-remove"
            @click="removeStep(index)"
          >
            ×
          </button>
        </li>
      </ol>
      <button v-if="!props.readOnly" type="button" class="recipe-add" @click="addStep">+ Add step</button>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue'
import OntologyFieldInput from './OntologyFieldInput.vue'

const props = defineProps({
  value: {
    type: [Object, null],
    default: null
  },
  vocab: {
    type: String,
    default: ''
  },
  readOnly: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:value'])

const state = reactive(normalizeRecipe(props.value))

watch(
  () => props.value,
  (val) => {
    const next = normalizeRecipe(val)
    state.items.splice(0, state.items.length, ...next.items)
    state.steps.splice(0, state.steps.length, ...next.steps)
  }
)

function normalizeRecipe(value) {
  const base = value && typeof value === 'object' ? value : {}
  const items = Array.isArray(base.items) ? base.items.map(normalizeItem) : []
  const steps = Array.isArray(base.steps) ? base.steps.slice() : []
  if (!items.length) {
    items.push(createEmptyItem())
  }
  if (!steps.length) {
    steps.push('')
  }
  return {
    items,
    steps
  }
}

function normalizeItem(item = {}) {
  return {
    quantity: item.quantity || '',
    unit: item.unit || '',
    notes: item.notes || '',
    reagent: item.reagent || (item.id ? { id: item.id, label: item.label || item.id } : null)
  }
}

function createEmptyItem() {
  return {
    quantity: '',
    unit: '',
    reagent: null,
    notes: ''
  }
}

function emitValue() {
  emit('update:value', {
    items: state.items.filter((item) => item.reagent || item.quantity || item.unit || item.notes),
    steps: state.steps.filter((step) => step && step.trim())
  })
}

function addItem() {
  state.items.push(createEmptyItem())
  emitValue()
}

function removeItem(index) {
  state.items.splice(index, 1)
  if (!state.items.length) {
    state.items.push(createEmptyItem())
  }
  emitValue()
}

function updateReagent(index, value) {
  state.items[index].reagent = value
  emitValue()
}

function addStep() {
  state.steps.push('')
  emitValue()
}

function removeStep(index) {
  state.steps.splice(index, 1)
  if (!state.steps.length) {
    state.steps.push('')
  }
  emitValue()
}
</script>

<style scoped>
.recipe-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.recipe-items-header,
.recipe-item-row {
  display: grid;
  grid-template-columns: 1fr 1fr 2fr 2fr auto;
  gap: 0.5rem;
  align-items: center;
}

.recipe-items-header {
  font-size: 0.8rem;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.recipe-input {
  border: 1px solid #cbd5f5;
  border-radius: 6px;
  padding: 0.25rem 0.4rem;
}

.recipe-reagent {
  width: 100%;
}

.recipe-remove {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  cursor: pointer;
  color: #94a3b8;
}

.recipe-add {
  align-self: flex-start;
  border: 1px dashed #94a3b8;
  border-radius: 999px;
  padding: 0.2rem 0.8rem;
  background: transparent;
  cursor: pointer;
  font-size: 0.85rem;
}

.recipe-steps ol {
  margin: 0;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.recipe-steps textarea {
  width: 100%;
  border-radius: 6px;
  border: 1px solid #cbd5f5;
  padding: 0.35rem 0.5rem;
}

.steps-label {
  margin: 0;
  font-weight: 600;
  color: #334155;
}
</style>
