<script setup>
import { computed, ref, watch } from 'vue'
import { useGraphQuery } from '../graph/useGraphQuery'
import { useGraphQueriesConfig } from '../graph/useGraphQueriesConfig'

const props = defineProps({
  graphState: {
    type: Object,
    required: true
  },
  schemaLoader: {
    type: Object,
    required: true
  }
})

const graph = computed(() => props.graphState?.graph?.value || null)
const graphStatus = computed(() => props.graphState?.status?.value || props.graphState?.status || 'idle')
const graphError = computed(() => props.graphState?.error?.value || props.graphState?.error || '')

const configs = useGraphQueriesConfig(props.schemaLoader)
const availableQueries = computed(() => configs.queryList.value || [])
const selectedQueryId = ref('')
const filterInput = ref('')

const { query, matches, groups, expandedNeighbors } = useGraphQuery({
  graph,
  schemaLoader: props.schemaLoader,
  queryId: selectedQueryId,
  filterValue: filterInput
})

const requiresFilter = computed(() => !!query.value?.filter)
const hasMatches = computed(() => (matches.value || []).length > 0)

function handleSelectQuery(event) {
  selectedQueryId.value = event.target.value
  filterInput.value = ''
}

function neighborList(nodeId) {
  return expandedNeighbors.value.get(nodeId) || []
}

function isNodeImmutable() {
  return false
}

watch(
  availableQueries,
  (list) => {
    if (!selectedQueryId.value && list.length) {
      selectedQueryId.value = list[0].id
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="graph-query-panel">
    <div class="panel-heading">
      <div>
        <h2>Graph query</h2>
        <p>Semantic slices driven by <code>graph/&lt;bundle&gt;/queries.yaml</code>.</p>
      </div>
      <div class="schema-status-pill" :class="graphStatus">
        <span class="status-dot"></span>
        <span class="status-text">{{ graphStatus }}</span>
      </div>
    </div>

    <div class="query-controls">
      <label>
        Query
        <select :value="selectedQueryId" @change="handleSelectQuery">
          <option v-for="option in availableQueries" :key="option.id" :value="option.id">{{ option.label }}</option>
        </select>
      </label>

      <label v-if="query?.filter">
        Filter value
        <input
          type="text"
          v-model="filterInput"
          :placeholder="query.filter.placeholder || query.filter.path"
        />
      </label>
    </div>

    <p v-if="graphError" class="status status-error">{{ graphError }}</p>
    <p v-else-if="graphStatus !== 'ready'" class="status status-muted">
      {{ graphStatus === 'building' ? 'Building graph…' : 'Graph not ready yet.' }}
    </p>

    <div v-else class="query-results">
      <p v-if="requiresFilter && !filterInput" class="status status-muted">Enter a filter value to run this query.</p>
      <p v-else-if="!hasMatches" class="status status-muted">No matching records.</p>
      <div v-else>
        <div v-for="group in groups" :key="group.id" class="result-group">
          <h4>{{ group.label }}</h4>
          <ul>
            <li v-for="node in group.nodes" :key="node.id">
              <div class="result-node">
                <div>
                  <strong>{{ node.title || node.id }}</strong>
                  <p>
                    {{ node.recordType }} · {{ node.id }}
                  </p>
                </div>
                <div v-if="neighborList(node.id).length" class="neighbors">
                  <p>Neighbors:</p>
                  <ul>
                    <li v-for="neighbor in neighborList(node.id)" :key="neighbor.id">
                      {{ neighbor.recordType }} · {{ neighbor.title || neighbor.id }}
                    </li>
                  </ul>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.query-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
}

.query-controls label {
  display: flex;
  flex-direction: column;
  font-weight: 600;
  color: #475569;
}

.query-controls select,
.query-controls input {
  margin-top: 0.25rem;
  border: 1px solid #cbd5f5;
  border-radius: 8px;
  padding: 0.4rem 0.6rem;
}

.result-group {
  border-top: 1px solid #e2e8f0;
  padding-top: 0.75rem;
}

.result-group h4 {
  margin: 0 0 0.5rem;
}

.result-node {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
}

.result-node p {
  margin: 0.2rem 0 0;
  color: #64748b;
}

.neighbors {
  font-size: 0.85rem;
  color: #475569;
}

.neighbors ul {
  list-style: none;
  padding: 0;
  margin: 0.25rem 0 0;
}

.lock-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: #fee2e2;
  color: #b91c1c;
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.lock-pill--inline {
  margin-left: 0.4rem;
}
</style>
