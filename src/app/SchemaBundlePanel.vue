<script setup>
const props = defineProps({
  loader: {
    type: Object,
    required: true
  }
})

function handleSelect(event) {
  props.loader.selectBundle(event.target.value)
}

function handleReload() {
  props.loader.reload()
}
</script>

<template>
  <div>
    <div class="panel-heading">
      <div>
        <h2>Schema bundle</h2>
        <p>Loads manifest, record schemas, UI configs, relationships, and naming rules.</p>
      </div>
      <div class="schema-status-pill" :class="loader.status">
        <span class="status-dot"></span>
        <span class="status-text">{{ loader.status }}</span>
      </div>
    </div>

    <div class="schema-controls">
      <label>
        Bundle
        <select :disabled="!loader.availableBundles.length" :value="loader.selectedBundle" @change="handleSelect">
          <option value="" disabled>Select bundle</option>
          <option v-for="name in loader.availableBundles" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <button class="secondary" type="button" :disabled="!loader.selectedBundle" @click="handleReload">Reload</button>
    </div>

    <p v-if="loader.error" class="status status-error">{{ loader.error }}</p>

    <div v-if="loader.schemaBundle" class="schema-summary">
      <div>
        <span class="summary-label">Record schemas</span>
        <strong>{{ loader.recordCount }}</strong>
      </div>
      <div>
        <span class="summary-label">UI configs</span>
        <strong>{{ loader.uiCount }}</strong>
      </div>
      <div>
        <span class="summary-label">Relationships</span>
        <strong>{{ loader.schemaBundle.relationships ? Object.keys(loader.schemaBundle.relationships?.recordTypes || {}).length : 0 }}</strong>
      </div>
      <div>
        <span class="summary-label">Naming rules</span>
        <strong>{{ loader.schemaBundle.naming ? Object.keys(loader.schemaBundle.naming || {}).length : 0 }}</strong>
      </div>
    </div>

    <p v-else class="status status-muted">
      {{ loader.availableBundles.length ? 'Select a bundle to load schema assets.' : 'Connect a repository with /schema bundles to begin.' }}
    </p>

    <div v-if="loader.validationIssues.length" class="schema-validation">
      <h3>Validation issues</h3>
      <ul>
        <li v-for="issue in loader.validationIssues" :key="issue">{{ issue }}</li>
      </ul>
    </div>

    <p v-if="loader.lastLoadedAt" class="schema-footer">
      Last loaded {{ new Date(loader.lastLoadedAt).toLocaleTimeString() }}
    </p>
  </div>
</template>

<style scoped>
.schema-controls {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
  margin-bottom: 1rem;
}

.schema-controls label {
  display: flex;
  flex-direction: column;
  font-weight: 600;
  color: #475569;
  flex: 1;
}

.schema-controls select {
  margin-top: 0.4rem;
  border-radius: 10px;
  border: 1px solid #cbd5f5;
  padding: 0.45rem 0.6rem;
  font-size: 0.95rem;
}

.schema-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.9rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  text-transform: capitalize;
  font-size: 0.85rem;
}

.schema-status-pill.ready {
  border-color: rgba(16, 185, 129, 0.4);
  color: #047857;
}

.schema-status-pill.loading,
.schema-status-pill.scanning {
  border-color: rgba(14, 165, 233, 0.4);
  color: #0369a1;
}

.schema-status-pill.error {
  border-color: rgba(248, 113, 113, 0.4);
  color: #b91c1c;
}

.status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
}

.schema-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.85rem;
  margin-top: 0.5rem;
}

.schema-summary > div {
  background: #f8fafc;
  border-radius: 12px;
  padding: 0.75rem 1rem;
  border: 1px solid #e2e8f0;
}

.summary-label {
  display: block;
  font-size: 0.8rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.2rem;
}

.schema-validation {
  margin-top: 1.25rem;
  border: 1px solid #fee2e2;
  background: #fef2f2;
  border-radius: 12px;
  padding: 0.85rem 1.1rem;
}

.schema-validation h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  color: #b91c1c;
}

.schema-validation ul {
  margin: 0;
  padding-left: 1.25rem;
  color: #991b1b;
}

.schema-footer {
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: #94a3b8;
}
</style>
