<script setup>
import ExplorerShell from '../../../explorer/ExplorerShell.vue'

const props = defineProps({
  isOnline: { type: Boolean, default: true },
  isReady: { type: Boolean, default: false },
  repoIsRequesting: { type: Boolean, default: false },
  explorerTarget: { type: Object, default: null },
  explorerBundleMismatch: { type: Boolean, default: false },
  explorerState: { type: Object, required: true },
  explorerForm: { type: Object, required: true },
  canAppendExplorerEvent: { type: Boolean, default: false },
  fallbackLayout: { type: Object, default: null }
})

const emit = defineEmits(['connect', 'clear', 'use-as-source', 'reset-form', 'append-event'])

const handleConnect = () => emit('connect')
const handleClear = () => emit('clear')
const handleUseAsSource = (payload) => emit('use-as-source', payload)
const handleReset = () => emit('reset-form')
const handleAppend = () => emit('append-event')
</script>

<template>
  <div class="explorer-standalone protocol-editor-standalone">
    <header class="protocol-editor-standalone__header">
      <div>
        <p class="app-kicker">Lab Event Graph Explorer</p>
        <h1>Explorer</h1>
        <p class="app-subtitle">{{ explorerTarget?.path }}</p>
      </div>
      <div class="protocol-editor-standalone__actions">
        <button class="secondary" type="button" :disabled="repoIsRequesting" @click="handleConnect">
          {{ repoIsRequesting ? 'Awaiting permission…' : 'Reconnect repo' }}
        </button>
        <button class="secondary" type="button" @click="handleClear">Return to workspace</button>
      </div>
    </header>
    <p v-if="!isOnline" class="offline-banner">
      You are currently offline. Cached schema/search data are in use until connectivity returns.
    </p>
    <div class="protocol-editor-standalone__body">
      <div v-if="!isReady" class="protocol-editor-standalone__message">
        <p>Connect your repository to open the explorer.</p>
        <button class="primary" type="button" @click="handleConnect">Select repository folder</button>
      </div>
      <div v-else-if="explorerBundleMismatch" class="protocol-editor-standalone__message">
        <p>Loading schema bundle {{ explorerTarget?.bundle }}…</p>
      </div>
      <div v-else-if="!explorerTarget?.path" class="protocol-editor-standalone__message">
        <p>Missing run path.</p>
      </div>
      <div v-else class="protocol-editor-standalone__editor">
        <p v-if="explorerState.status" class="status status-muted">{{ explorerState.status }}</p>
        <p v-if="explorerState.error" class="status status-error">{{ explorerState.error }}</p>
        <ExplorerShell
          v-if="explorerState.layoutIndex && explorerState.labwareId"
          :events="explorerState.events"
          :layout-index="explorerState.layoutIndex || fallbackLayout"
          :labware-id="explorerState.labwareId"
          @use-as-source="handleUseAsSource"
        />
        <div class="explorer-form">
          <h4>Append PlateEvent</h4>
          <p class="muted">Quick transfer into the selected run.</p>
          <div class="modal-form">
            <label>
              Activity
              <select v-model="explorerForm.activityId">
                <option value="" disabled>Select activity…</option>
                <option v-for="act in explorerState.activities" :key="act.id" :value="act.id">
                  {{ act.label || act.id || act.kind }}
                </option>
              </select>
            </label>
            <label>
              Source well
              <input v-model="explorerForm.sourceWell" type="text" placeholder="SRC1 or A01" />
            </label>
            <label>
              Target well
              <input v-model="explorerForm.targetWell" type="text" placeholder="A01" />
            </label>
            <label>
              Volume
              <input v-model="explorerForm.volume" type="text" placeholder="50 uL" />
            </label>
            <label>
              Material ID (optional)
              <input v-model="explorerForm.materialId" type="text" placeholder="material:drug" />
            </label>
          </div>
          <div class="explorer-form__actions">
            <button class="ghost-button" type="button" @click="handleReset">Clear</button>
            <button class="primary" type="button" :disabled="!canAppendExplorerEvent" @click="handleAppend">
              Append event
            </button>
          </div>
          <p v-if="explorerForm.status" class="status status-muted">{{ explorerForm.status }}</p>
          <p v-if="explorerForm.error" class="status status-error">{{ explorerForm.error }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.protocol-editor-standalone {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.protocol-editor-standalone__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.protocol-editor-standalone__actions {
  display: flex;
  gap: 0.5rem;
}

.protocol-editor-standalone__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.protocol-editor-standalone__message {
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  color: #475569;
  background: #f8fafc;
}

.protocol-editor-standalone__editor {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
}

.offline-banner {
  margin: 0;
  padding: 0.55rem 0.9rem;
  border-radius: 10px;
  border: 1px solid rgba(202, 138, 4, 0.4);
  background: #fefce8;
  color: #713f12;
  font-size: 0.9rem;
}

.explorer-form {
  margin-top: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.explorer-form__actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
</style>
