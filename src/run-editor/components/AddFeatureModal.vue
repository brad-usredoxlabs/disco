<template>
  <div v-if="open" class="modal">
    <div class="modal__card">
      <header class="modal__header">
        <h3>Add feature</h3>
        <p class="modal__hint">Creates feature concept + revision under /vocab/features/ and /vocab/feature-revisions/.</p>
      </header>

      <div class="modal__body">
        <div class="grid two-col">
          <label>
            ID
            <input v-model="form.id" type="text" />
          </label>
          <label>
            Label
            <input v-model="form.label" type="text" />
          </label>
        </div>
        <label>
          Description
          <textarea v-model="form.description" rows="3" placeholder="Optional description"></textarea>
        </label>
        <label>
          Domain
          <select v-model="form.domain">
            <option value="">Select domain…</option>
            <option v-for="opt in domainOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </label>
        <label>
          Tags (comma-separated)
          <input v-model="form.tagsInput" type="text" placeholder="fluorescence, viability" />
        </label>
        <label>
          Ontology (key:value map, optional)
          <textarea v-model="form.ontologyJson" rows="3" placeholder='{"go": "GO:0008150"}'></textarea>
        </label>
        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <footer class="modal__footer">
        <button class="ghost-button" type="button" @click="$emit('cancel')">Cancel</button>
        <button class="primary" type="button" :disabled="saving" @click="handleSave">
          {{ saving ? 'Saving…' : 'Save feature' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'

const DOMAIN_OPTIONS = [
  'cellular_state',
  'molecular',
  'metabolite',
  'gene_expression',
  'morphology',
  'physiology',
  'other'
]

const props = defineProps({
  open: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' },
  preset: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['cancel', 'save'])

const form = reactive({
  id: '',
  label: '',
  description: '',
  domain: '',
  tagsInput: '',
  ontologyJson: ''
})

const domainOptions = computed(() => DOMAIN_OPTIONS)

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetForm(props.preset || {})
    }
  }
)

watch(
  () => props.preset,
  (preset) => {
    if (props.open) resetForm(preset || {})
  }
)

function resetForm(preset = {}) {
  form.id = preset.id || ''
  form.label = preset.label || ''
  form.description = preset.description || ''
  form.domain = preset.domain || ''
  form.tagsInput = Array.isArray(preset.tags) ? preset.tags.join(', ') : ''
  form.ontologyJson = preset.ontologyJson || ''
}

function handleSave() {
  emit('save', buildPayload())
}

function buildPayload() {
  const tags = (form.tagsInput || '')
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  let ontology = {}
  if (form.ontologyJson) {
    try {
      const parsed = JSON.parse(form.ontologyJson)
      if (parsed && typeof parsed === 'object') {
        ontology = parsed
      }
    } catch {
      // swallow; validation handled upstream
    }
  }
  return {
    id: form.id || '',
    label: form.label || '',
    description: form.description || '',
    domain: form.domain || '',
    tags,
    ontology
  }
}
</script>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
}
.modal__card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  width: min(720px, 96vw);
  max-height: 94vh;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
}
.modal__header h3 {
  margin: 0;
}
.modal__hint {
  margin: 4px 0 0;
  color: #475569;
  font-size: 0.9rem;
}
.modal__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.grid {
  display: grid;
  gap: 8px;
}
.grid.two-col {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-weight: 600;
  color: #0f172a;
}
input,
select,
textarea {
  border: 1px solid #cbd5f5;
  border-radius: 10px;
  padding: 0.4rem 0.6rem;
  font-size: 0.95rem;
}
.error {
  color: #b91c1c;
  margin: 0;
}
.modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.ghost-button {
  border: 1px solid #cbd5f5;
  border-radius: 10px;
  background: transparent;
  color: #0f172a;
  padding: 0.4rem 0.8rem;
  cursor: pointer;
}
.primary {
  border: none;
  border-radius: 10px;
  padding: 0.45rem 0.9rem;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
</style>
