<template>
  <div v-if="open" class="modal">
    <div class="modal__card">
      <header class="modal__header">
        <h3>Add From Past Run</h3>
      </header>
      <div class="modal__body">
        <label>
          Run ID
          <input v-model="local.runId" type="text" placeholder="RUN-0004" />
        </label>
        <label>
          Labware ID
          <input v-model="local.labwareId" type="text" placeholder="labware:PLATE-001" />
        </label>
        <label>
          Label (optional)
          <input v-model="local.label" type="text" placeholder="Previous run plate" />
        </label>
        <div v-if="runs.length" class="run-picker">
          <p class="run-picker__title">Recent runs</p>
          <input v-model="search" type="text" placeholder="Filter runs…" />
          <ul class="run-picker__list">
            <li v-for="run in filteredRuns" :key="run.id">
              <button type="button" class="ghost-button tiny" @click="pickRun(run)">{{ run.id }} — {{ run.label }}</button>
            </li>
          </ul>
        </div>
      </div>
      <footer class="modal__footer">
        <button class="ghost-button" type="button" @click="$emit('cancel')">Cancel</button>
        <button class="primary" type="button" @click="confirm">Add</button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, ref } from 'vue'

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  runs: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['confirm', 'cancel'])

const local = reactive({
  runId: '',
  labwareId: '',
  label: ''
})
const search = ref('')

const filteredRuns = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.runs.slice(0, 10)
  return props.runs
    .filter((run) => run.id.toLowerCase().includes(q) || run.label.toLowerCase().includes(q))
    .slice(0, 10)
})

function pickRun(run) {
  local.runId = run.id
  const candidateLabware =
    run.labwareId ||
    run.labware_id ||
    (Array.isArray(run.labwareIds) ? run.labwareIds[0] : '') ||
    (Array.isArray(run.labware_ids) ? run.labware_ids[0] : '') ||
    ''
  local.labwareId = candidateLabware || ''
  if (!local.label) local.label = run.label || run.id
}

function confirm() {
  emit('confirm', { runId: local.runId.trim(), labwareId: local.labwareId.trim(), label: local.label.trim() })
  local.runId = ''
  local.labwareId = ''
  local.label = ''
  search.value = ''
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
  z-index: 40;
}
.modal__card {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  width: 460px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}
.modal__header h3 {
  margin: 0;
}
.modal__body {
  display: grid;
  gap: 8px;
}
.modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.run-picker {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px;
  background: #f8fafc;
}
.run-picker__title {
  margin: 0 0 4px;
  font-weight: 600;
}
.run-picker__list {
  list-style: none;
  padding: 0;
  margin: 6px 0 0;
  display: grid;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
}
</style>
