<script setup>
const props = defineProps({
  kicker: { type: String, default: '' },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  connectionLabel: { type: String, default: '' },
  isReady: { type: Boolean, default: false },
  isRequesting: { type: Boolean, default: false },
  isSupported: { type: Boolean, default: true }
})

const emit = defineEmits(['open-settings', 'connect'])

const handleSettings = () => emit('open-settings')
const handleConnect = () => emit('connect')
</script>

<template>
  <div class="header-main">
    <div>
      <p class="app-kicker">{{ kicker }}</p>
      <h1>{{ title }}</h1>
      <p class="app-subtitle">{{ subtitle }}</p>
    </div>
    <div class="header-actions">
      <button class="ghost-button settings-button" type="button" @click="handleSettings">⚙ Settings</button>
      <div class="connection-chip" :class="{ 'is-connected': isReady }">
        <span class="chip-label">{{ connectionLabel }}</span>
        <button
          class="pill-button"
          type="button"
          :disabled="!isSupported"
          :class="{ 'is-loading': isRequesting }"
          @click="handleConnect"
        >
          {{ isRequesting ? 'Awaiting…' : isReady ? 'Reconnect' : 'Connect' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
}

.app-kicker {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 0.5rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.settings-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.app-subtitle {
  margin: 0.2rem 0 0;
  color: #475569;
}

.connection-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: #fff;
}

.connection-chip.is-connected {
  border-color: rgba(16, 185, 129, 0.4);
}

.chip-label {
  font-size: 0.85rem;
  color: #0f172a;
}

.pill-button {
  border: none;
  background: #f1f5f9;
  border-radius: 999px;
  padding: 0.2rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
  color: #0f172a;
}

.pill-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
