<script setup>
import { computed } from 'vue'

const props = defineProps({
  search: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['open'])

const FILTER_FIELDS = [
  { key: 'recordType', label: 'Record type', placeholder: 'All record types' },
  { key: 'taxonId', label: 'Taxon', placeholder: 'All taxa' },
  { key: 'anatomicalContextId', label: 'Tissue', placeholder: 'All tissues' },
  { key: 'pathwayId', label: 'Pathway', placeholder: 'All pathways' },
  { key: 'operatorId', label: 'Operator', placeholder: 'All operators' },
  { key: 'plateId', label: 'Plate', placeholder: 'All plates' }
]

const usingGraphFallback = computed(() => props.search.source?.value === 'graph')
const usingCachedShards = computed(() => props.search.source?.value === 'cache')

function handleInput(event) {
  props.search.setQuery(event.target.value)
}

function openResult(path) {
  emit('open', path)
}

function handleFilterChange(key, event) {
  props.search.setFilter?.(key, event.target.value)
}

function clearFilters() {
  props.search.clearFilters?.()
}
</script>

<template>
  <div class="search-panel">
    <div class="panel-heading">
      <div>
        <h2>Search</h2>
        <p>Find records by metadata or Markdown content.</p>
      </div>
      <span v-if="search.isIndexing.value" class="status status-muted">Indexing…</span>
    </div>

    <input
      class="search-input"
      type="search"
      placeholder="Search keyword…"
      :value="search.query.value"
      @input="handleInput"
    />

    <p v-if="usingGraphFallback" class="status status-muted">
      Using local graph fallback. Re-run <code>npm run build:index</code> and click
      <button class="text-button" type="button" @click="search.rebuild">refresh index</button>
      once shards are available.
    </p>
    <p v-else-if="usingCachedShards" class="status status-muted">
      Serving cached shards (offline). Refresh when connectivity returns.
    </p>

    <div class="filters-grid">
      <label v-for="filter in FILTER_FIELDS" :key="filter.key">
        <span>{{ filter.label }}</span>
        <select
          :value="props.search.filters.value?.[filter.key] || ''"
          @change="(event) => handleFilterChange(filter.key, event)"
        >
          <option value="">{{ filter.placeholder }}</option>
          <option
            v-for="option in props.search.facetOptions.value?.[filter.key] || []"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }} ({{ option.count }})
          </option>
        </select>
      </label>
    </div>

    <div v-if="props.search.hasActiveFilters.value" class="filter-actions">
      <button class="text-button" type="button" @click="clearFilters">Clear filters</button>
    </div>

    <p v-if="search.error.value" class="status status-error">{{ search.error.value }}</p>
    <p v-else-if="search.query.value && !search.results.value.length" class="status status-muted">No matches yet.</p>

    <ul v-if="search.results.value.length" class="search-results">
      <li v-for="hit in search.results.value" :key="hit.path">
        <div>
          <strong>{{ hit.title }}</strong>
          <span class="search-meta">{{ hit.recordType }}</span>
          <p class="search-snippet">{{ hit.snippet }}</p>
        </div>
        <button class="text-button" type="button" @click="openResult(hit.path)">Open</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.search-input {
  width: 100%;
  border-radius: 10px;
  border: 1px solid #cbd5f5;
  padding: 0.5rem 0.75rem;
  font-size: 0.95rem;
  margin-bottom: 0.75rem;
}

.search-results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  margin: 0.75rem 0;
}

.filters-grid label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: #475569;
}

.filters-grid select {
  border-radius: 10px;
  border: 1px solid #cbd5f5;
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
  background: #fff;
}

.filter-actions {
  text-align: right;
  margin-bottom: 0.5rem;
}

.search-results li {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 0.5rem;
}

.search-meta {
  margin-left: 0.5rem;
  font-size: 0.8rem;
  color: #94a3b8;
}

.search-snippet {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: #475569;
}
</style>
