<script setup>
import { computed } from 'vue'
const props = defineProps({
  graphState: {
    type: Object,
    required: true
  }
})

const status = props.graphState.status
const error = props.graphState.error
const graph = props.graphState.graph
const rebuild = props.graphState.rebuild

const graphData = computed(() => graph?.value || { stats: { total: 0, biology: null } })
const biologyStats = computed(() => graphData.value?.stats?.biology || null)

function topEntries(map = {}, limit = 3) {
  return Object.entries(map || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
}

function handleRefresh() {
  rebuild?.()
}
</script>

<template>
  <div>
    <div class="panel-heading">
      <div>
        <h2>Record graph</h2>
        <p>Builds parent/child/backlink relationships from repo files.</p>
      </div>
      <div class="schema-status-pill" :class="status?.value">
        <span class="status-dot"></span>
        <span class="status-text">{{ status?.value }}</span>
      </div>
    </div>

    <div class="graph-summary">
      <div>
        <span class="summary-label">Indexed records</span>
        <strong>{{ graphData.stats?.total || 0 }}</strong>
      </div>
      <div v-if="biologyStats">
        <span class="summary-label">Biology entities</span>
        <strong>{{ biologyStats.totalEntities || 0 }}</strong>
      </div>
    </div>

    <div v-if="biologyStats && biologyStats.totalEntities" class="biology-summary">
      <div>
        <span class="summary-label">Top domains</span>
        <ul>
          <li v-for="([domain, count]) in topEntries(biologyStats.domains)" :key="domain">
            {{ domain }} · {{ count }}
          </li>
        </ul>
      </div>
      <div>
        <span class="summary-label">Top roles</span>
        <ul>
          <li v-for="([role, count]) in topEntries(biologyStats.roles)" :key="role">
            {{ role }} · {{ count }}
          </li>
        </ul>
      </div>
    </div>

    <div class="graph-actions">
      <button class="secondary" type="button" @click="handleRefresh">Rebuild graph</button>
    </div>

    <p v-if="error?.value" class="status status-error">{{ error.value }}</p>
    <p v-else-if="status?.value === 'building'" class="status status-muted">Scanning record files…</p>
    <p v-else-if="!graphData.stats?.total" class="status status-muted">No records indexed yet.</p>
  </div>
</template>

<style scoped>
.graph-summary {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 0.75rem;
}

.summary-label {
  font-size: 0.8rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: block;
  margin-bottom: 0.2rem;
}

.biology-summary {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 0.75rem;
}

.biology-summary ul {
  list-style: none;
  padding: 0;
  margin: 0.2rem 0 0;
}

.biology-summary li {
  font-size: 0.9rem;
  color: #0f172a;
}
</style>
