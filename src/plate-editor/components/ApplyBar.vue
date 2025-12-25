<script setup>
import { computed, ref, watch } from 'vue'
import MaterialPicker from './MaterialPicker.vue'

const props = defineProps({
  roles: {
    type: Array,
    default: () => []
  },
  materials: {
    type: Array,
    default: () => []
  },
  selectionCount: {
    type: Number,
    default: 0
  },
  recentIds: {
    type: Array,
    default: () => []
  },
  favoriteIds: {
    type: Array,
    default: () => []
  },
  prefillSelection: {
    type: Object,
    default: null
  },
  features: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['apply', 'remove', 'favorite-toggle', 'request-create', 'request-edit'])

const CONTROL_KIND_OPTIONS = [
  { value: 'positive_control', label: 'Positive control' },
  { value: 'negative_control', label: 'Negative control' },
  { value: 'baseline_control', label: 'Baseline control' },
  { value: 'reference_control', label: 'Reference control' },
  { value: 'other', label: 'Other' }
]

const EXPECTED_EFFECT_OPTIONS = [
  { value: 'increase', label: 'Increase' },
  { value: 'decrease', label: 'Decrease' },
  { value: 'none', label: 'No change' },
  { value: 'unknown', label: 'Unknown' }
]

const selectedRole = ref('')
const selectedMaterial = ref(null)
const amountValue = ref('')
const amountUnit = ref('')
const controlIntentRows = ref([])
let controlIntentCounter = 0

const featureOptions = computed(() => props.features || [])

watch(
  () => props.roles,
  (roles) => {
    if (!roles?.length) return
    if (!selectedRole.value) {
      selectedRole.value = roles[0].role || roles[0].value || roles[0]
    }
  },
  { immediate: true }
)

watch(
  () => props.prefillSelection,
  (payload) => {
    if (!payload || !payload.id) return
    const entry = props.materials.find((item) => item.id === payload.id)
    if (entry) {
      selectMaterial(entry, { forceRole: true })
    }
  },
  { deep: true }
)

watch(
  () => props.materials,
  (list = []) => {
    if (!selectedMaterial.value?.id) return
    const next = list.find((entry) => entry.id === selectedMaterial.value.id)
    selectedMaterial.value = next || null
  }
)

watch(
  () => props.features,
  () => {
    const allowed = new Set(featureOptions.value.map((feature) => feature.id))
    controlIntentRows.value = controlIntentRows.value.filter((row) => !row.feature || allowed.has(row.feature))
  },
  { deep: true }
)

const canApply = computed(() => {
  return Boolean(
    props.selectionCount &&
      selectedRole.value &&
      selectedMaterial.value?.id
  )
})

const canRemove = computed(() => {
  return Boolean(props.selectionCount && selectedMaterial.value?.id)
})

function handleMaterialSelect(entry) {
  selectMaterial(entry)
}

function handleApply() {
  if (!canApply.value) return
  emit('apply', {
    role: selectedRole.value,
    materialId: selectedMaterial.value.id,
    materialLabel: selectedMaterial.value.label,
    amount: normalizeAmount(),
    controlIntents: buildControlIntents()
  })
}

function handleRemove() {
  if (!canRemove.value) return
  emit('remove', {
    role: selectedRole.value,
    materialId: selectedMaterial.value.id
  })
}

function handleFavoriteToggle(payload) {
  emit('favorite-toggle', payload)
}

function handleRequestCreate(payload) {
  emit('request-create', payload)
}

function handleRequestEdit(entry) {
  emit('request-edit', entry)
}

function normalizeAmount() {
  if (!amountValue.value || !amountUnit.value) return null
  const value = Number(amountValue.value)
  if (!Number.isFinite(value)) return null
  return { value, unit: amountUnit.value }
}

function selectMaterial(entry, options = {}) {
  selectedMaterial.value = entry || null
  if (!entry) return
  const shouldApplyRole = options.forceRole || !selectedRole.value
  if (entry?.defaults?.role && shouldApplyRole) {
    selectedRole.value = entry.defaults.role
  }
  if (entry?.defaults?.amount) {
    amountValue.value = entry.defaults.amount.value ?? ''
    amountUnit.value = entry.defaults.amount.unit ?? ''
  }
}

function addControlIntentRow(prefill = {}) {
  if (!featureOptions.value.length) return
  controlIntentCounter += 1
  controlIntentRows.value = [
    ...controlIntentRows.value,
    {
      id: `ci-${controlIntentCounter}-${Date.now()}`,
      feature: prefill.feature || '',
      kind: prefill.kind || '',
      expected_effect: prefill.expected_effect || ''
    }
  ]
}

function removeControlIntentRow(id) {
  controlIntentRows.value = controlIntentRows.value.filter((row) => row.id !== id)
}

function buildControlIntents() {
  return controlIntentRows.value
    .map((row) => {
      const feature = typeof row.feature === 'string' ? row.feature.trim() : ''
      const kind = typeof row.kind === 'string' ? row.kind.trim() : ''
      if (!feature || !kind) return null
      const entry = { feature, kind }
      const effect =
        typeof row.expected_effect === 'string' ? row.expected_effect.trim() : ''
      if (effect) {
        entry.expected_effect = effect
      }
      return entry
    })
    .filter(Boolean)
}
</script>

<template>
  <div class="apply-bar">
    <div class="field-group">
      <label>Role</label>
      <select v-model="selectedRole">
        <option value="" disabled>Select role…</option>
        <option v-for="role in roles" :key="role.role || role" :value="role.role || role">
          {{ role.label || role.role || role }}
        </option>
      </select>
    </div>

    <div class="picker-group">
      <label>Material</label>
      <MaterialPicker
        :materials="materials"
        :selected-id="selectedMaterial?.id"
        :role="selectedRole"
        :recent-ids="recentIds"
        :favorite-ids="favoriteIds"
        @select="handleMaterialSelect"
        @favorite-toggle="handleFavoriteToggle"
        @request-create="handleRequestCreate"
        @request-edit="handleRequestEdit"
      />
    </div>

    <div class="amount-row">
      <div class="field-group">
        <label>Amount</label>
        <div class="amount-inputs">
          <input v-model="amountValue" type="number" min="0" step="any" placeholder="Value" />
          <input v-model="amountUnit" type="text" placeholder="Unit" />
        </div>
      </div>
      <div class="actions">
        <button class="primary" type="button" :disabled="!canApply" @click="handleApply">
          Apply to {{ selectionCount }} wells
        </button>
        <button class="danger" type="button" :disabled="!canRemove" @click="handleRemove">
          Remove material
        </button>
      </div>
    </div>

    <div v-if="featureOptions.length" class="control-section">
      <div class="control-header">
        <label>Control intents</label>
        <button class="ghost tiny" type="button" :disabled="!featureOptions.length" @click="addControlIntentRow()">
          Add control intent
        </button>
      </div>
      <p class="control-help">Tag this material as a control for specific observable features/channels.</p>
      <div v-if="controlIntentRows.length" class="control-rows">
        <div v-for="row in controlIntentRows" :key="row.id" class="control-row">
          <select v-model="row.feature">
            <option value="">Feature…</option>
            <option v-for="feature in featureOptions" :key="feature.id" :value="feature.id">
              {{ feature.label }}
            </option>
          </select>
          <select v-model="row.kind">
            <option value="">Kind…</option>
            <option v-for="option in CONTROL_KIND_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <select v-model="row.expected_effect">
            <option value="">Expected effect</option>
            <option v-for="option in EXPECTED_EFFECT_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <button class="ghost tiny" type="button" @click="removeControlIntentRow(row.id)">Remove</button>
        </div>
      </div>
      <p v-else class="control-placeholder">No control intents selected.</p>
    </div>
  </div>
</template>

<style scoped>
.apply-bar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

label {
  font-weight: 600;
  color: #0f172a;
}

select,
input {
  border: 1px solid #cbd5f5;
  border-radius: 10px;
  padding: 0.4rem 0.6rem;
  font-size: 0.95rem;
}

.picker-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.amount-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.amount-inputs {
  display: flex;
  gap: 0.35rem;
}

.amount-inputs input {
  flex: 1;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.primary,
.danger {
  border: none;
  border-radius: 10px;
  padding: 0.45rem 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.primary {
  background: #2563eb;
  color: #fff;
}

.primary:disabled,
.danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.danger {
  background: #fee2e2;
  color: #991b1b;
}

.control-section {
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.control-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.control-help {
  margin: 0;
  font-size: 0.8rem;
  color: #475569;
}

.control-rows {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.control-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.35rem;
  align-items: center;
}

.control-placeholder {
  font-size: 0.8rem;
  color: #94a3b8;
  font-style: italic;
}

.ghost {
  border: 1px solid #cbd5f5;
  border-radius: 999px;
  background: transparent;
  color: #0f172a;
  padding: 0.3rem 0.8rem;
  cursor: pointer;
}

.ghost.tiny {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
}
</style>
