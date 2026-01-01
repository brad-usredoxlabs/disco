<script setup>
import TipTapRecordEditor from '../../../tiptap/components/TipTapRecordEditor.vue'

const props = defineProps({
  isOnline: { type: Boolean, default: true },
  isReady: { type: Boolean, default: false },
  repo: { type: Object, required: true },
  tiptapTarget: { type: Object, default: null },
  tiptapStatus: { type: String, default: '' },
  tiptapBundleMismatch: { type: Boolean, default: false },
  tiptapSupports: { type: Boolean, default: false },
  tiptapSchema: { type: Object, default: null },
  tiptapUiConfig: { type: Object, default: null },
  tiptapNamingRule: { type: Object, default: () => ({}) },
  schemaBundle: { type: Object, default: () => ({}) },
  validateRecord: { type: Function, required: true },
  tiptapContextOverrides: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['connect', 'clear', 'saved'])

const handleConnect = () => emit('connect')
const handleClear = () => emit('clear')
const handleSaved = () => emit('saved')
</script>

<template>
  <div class="tiptap-standalone">
    <header class="tiptap-standalone__header">
      <div>
        <p class="app-kicker">TapTab</p>
        <h1>{{ tiptapTarget?.recordType || 'Record' }}</h1>
        <p class="app-subtitle">{{ tiptapTarget?.path }}</p>
      </div>
      <div class="tiptap-standalone__actions">
        <button class="secondary" type="button" :disabled="repo.isRequesting" @click="handleConnect">
          {{ repo.isRequesting ? 'Awaiting permission…' : 'Reconnect repo' }}
        </button>
        <button class="secondary" type="button" @click="handleClear">Return to workspace</button>
      </div>
    </header>
    <p v-if="!isOnline" class="offline-banner">
      You are currently offline. Cached schema/search data are in use until connectivity returns.
    </p>
    <div class="tiptap-standalone__body">
      <p v-if="tiptapStatus" class="status status-ok">{{ tiptapStatus }}</p>
      <div v-if="!isReady" class="tiptap-standalone__message">
        <p>Connect your repository to edit this record.</p>
        <button class="primary" type="button" @click="handleConnect">Select repository folder</button>
      </div>
      <div v-else-if="tiptapBundleMismatch" class="tiptap-standalone__message">
        <p>Loading schema bundle {{ tiptapTarget?.bundle }}…</p>
      </div>
      <div v-else-if="!tiptapSupports" class="tiptap-standalone__message">
        <p>This record type is not TapTab-enabled.</p>
      </div>
      <div v-else-if="!tiptapSchema || !tiptapUiConfig" class="tiptap-standalone__message">
        <p>Schema details are still loading…</p>
      </div>
      <div v-else class="tiptap-standalone__editor">
        <TipTapRecordEditor
          :repo="repo"
          :record-path="tiptapTarget.path"
          :record-type="tiptapTarget.recordType"
          :schema="tiptapSchema"
          :ui-config="tiptapUiConfig"
          :naming-rule="tiptapNamingRule || {}"
          :read-only="false"
          :schema-bundle="schemaBundle || {}"
          :validate-record="validateRecord"
          :project-context-overrides="tiptapContextOverrides || {}"
          @close="handleClear"
          @saved="handleSaved"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tiptap-standalone {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.tiptap-standalone__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.tiptap-standalone__actions {
  display: flex;
  gap: 0.5rem;
}

.tiptap-standalone__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tiptap-standalone__message {
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  color: #475569;
  background: #f8fafc;
}

.tiptap-standalone__editor {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 1rem;
  background: #fff;
  min-height: 70vh;
}
</style>
