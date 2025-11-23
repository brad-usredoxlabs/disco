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

const graphData = computed(() => graph?.value || { stats: { total: 0 } })

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
    </div>

    <div class="graph-actions">
      <button class="secondary" type="button" @click="handleRefresh">Rebuild graph</button>
    </div>

    <p v-if="error?.value" class="status status-error">{{ error.value }}</p>
    <p v-else-if="status?.value === 'building'" class="status status-muted">Scanning record files…</p>
    <p v-else-if="!graphData.stats?.total" class="status status-muted">No records indexed yet.</p>
  </div>
</template>
