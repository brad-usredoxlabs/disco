<script setup>
const props = defineProps({
  isOnline: { type: Boolean, default: true },
  repoIsRequesting: { type: Boolean, default: false },
  settingsForm: { type: Object, required: true },
  settingsSaving: { type: Boolean, default: false },
  settingsError: { type: String, default: '' }
})

const emit = defineEmits(['connect', 'clear', 'save'])

const handleConnect = () => emit('connect')
const handleClear = () => emit('clear')
const handleSave = () => emit('save')
</script>

<template>
  <div class="settings-standalone">
    <header class="protocol-editor-standalone__header">
      <div>
        <p class="app-kicker">Settings</p>
        <h1>System configuration</h1>
        <p class="app-subtitle">Ontology search + provenance</p>
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
      <div class="modal-form settings-form">
        <label>
          Ontology cache duration (days)
          <input v-model.number="settingsForm.cacheDuration" type="number" min="1" />
        </label>
        <label>
          Local namespace (provenance)
          <input
            v-model="settingsForm.localNamespace"
            type="text"
            placeholder="urn:local"
          />
        </label>
        <p v-if="settingsError" class="status status-error">{{ settingsError }}</p>
        <p class="status status-muted">
          Settings are saved to <code>config/system.yaml</code> in your connected repository.
        </p>
        <div class="settings-actions">
          <button class="ghost-button" type="button" @click="handleClear">Cancel</button>
          <button class="primary" type="button" :class="{ 'is-loading': settingsSaving }" @click="handleSave">
            {{ settingsSaving ? 'Saving…' : 'Save settings' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-standalone {
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

.offline-banner {
  margin: 0;
  padding: 0.55rem 0.9rem;
  border-radius: 10px;
  border: 1px solid rgba(202, 138, 4, 0.4);
  background: #fefce8;
  color: #713f12;
  font-size: 0.9rem;
}

.settings-standalone .settings-form {
  max-width: 520px;
  display: grid;
  gap: 12px;
}

.settings-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
