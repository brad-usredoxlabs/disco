<script setup>
import { ref, defineExpose } from 'vue'
import RunEditorShell from '../../../run-editor/RunEditorShell.vue'

const props = defineProps({
  isOnline: { type: Boolean, default: true },
  isReady: { type: Boolean, default: false },
  repoIsRequesting: { type: Boolean, default: false },
  runEditorTarget: { type: Object, default: null },
  runEditorBundleMismatch: { type: Boolean, default: false },
  runEditorState: { type: Object, required: true },
  runOptions: { type: Array, default: () => [] },
  validateRecord: { type: Function, required: true },
  loadRunById: { type: Function, required: true },
  runEditorSaving: { type: Boolean, default: false }
})

const emit = defineEmits(['connect', 'clear', 'save'])

const runEditorRef = ref(null)
defineExpose({ runEditorRef })

const handleConnect = () => emit('connect')
const handleClear = () => emit('clear')
const handleSave = () => emit('save')
</script>

<template>
  <div class="protocol-editor-standalone">
    <header class="protocol-editor-standalone__header">
      <div>
        <p class="app-kicker">Run Editor</p>
        <h1>Run</h1>
        <p class="app-subtitle">{{ runEditorTarget?.path }}</p>
      </div>
      <div class="protocol-editor-standalone__actions">
        <button class="secondary" type="button" :disabled="repoIsRequesting" @click="handleConnect">
          {{ repoIsRequesting ? 'Awaiting permission…' : 'Reconnect repo' }}
        </button>
        <button
          class="primary"
          type="button"
          :disabled="runEditorSaving || !runEditorState.run"
          @click="handleSave"
        >
          {{ runEditorSaving ? 'Saving…' : 'Save run' }}
        </button>
        <button class="secondary" type="button" @click="handleClear">Return to workspace</button>
      </div>
    </header>
    <p v-if="!isOnline" class="offline-banner">
      You are currently offline. Cached schema/search data are in use until connectivity returns.
    </p>
    <div class="protocol-editor-standalone__body">
      <div v-if="!isReady" class="protocol-editor-standalone__message">
        <p>Connect your repository to edit this run.</p>
        <button class="primary" type="button" @click="handleConnect">Select repository folder</button>
      </div>
      <div v-else-if="runEditorBundleMismatch" class="protocol-editor-standalone__message">
        <p>Loading schema bundle {{ runEditorTarget?.bundle }}…</p>
      </div>
      <div v-else-if="!runEditorTarget?.path" class="protocol-editor-standalone__message">
        <p>Missing run path.</p>
      </div>
      <div v-else class="protocol-editor-standalone__editor">
        <p v-if="runEditorState.error" class="status status-error">{{ runEditorState.error }}</p>
        <p v-else-if="runEditorState.status" class="status status-ok">{{ runEditorState.status }}</p>
        <RunEditorShell
          v-if="runEditorState.run"
          ref="runEditorRef"
          :run="runEditorState.run"
          :layout="runEditorState.layout"
          :material-library="runEditorState.materialLibrary"
          :load-run-by-id="loadRunById"
          :runs="runOptions"
          :validate-record="validateRecord"
        />
        <p v-else class="protocol-editor-standalone__message">Loading run…</p>
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
</style>
