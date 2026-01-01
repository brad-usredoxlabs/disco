<script setup>
import { computed } from 'vue'

const props = defineProps({
  search: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['open'])

const usingGraphFallback = computed(() => props.search.source?.value === 'graph')
const usingCachedShards = computed(() => props.search.source?.value === 'cache')

const queryModel = computed({
  get: () => props.search.query?.value || '',
  set: (val) => props.search.setQuery?.(val || '')
})

function openResult(path) {
  emit('open', path)
}

function handleFilterChange(key, event) {
  props.search.setFilter?.(key, event.target.value)
}

function clearFilters() {
  props.search.clearFilters?.()
}

function submitSearch() {
  props.search.setQuery?.(queryModel.value || '')
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

    <div class="combo">
      <input
        class="search-input"
        type="search"
        placeholder="Search keyword…"
        v-model="queryModel"
      />
      <button class="primary search-submit" type="button" @click="submitSearch">Search</button>
      <div v-if="search.results.value.length" class="combo-results">
        <button
          v-for="hit in search.results.value.slice(0, 6)"
          :key="hit.path"
          class="combo-result"
          type="button"
          @click="openResult(hit.path)"
        >
          <div>
            <strong>{{ hit.title }}</strong>
            <span class="search-meta">{{ hit.recordType }}</span>
          </div>
          <p class="search-snippet">{{ hit.snippet }}</p>
        </button>
      </div>
    </div>

    <p v-if="usingGraphFallback" class="status status-muted">
      Using local graph fallback. Re-run <code>npm run build:index</code> and click
      <button class="text-button" type="button" @click="search.rebuild">refresh index</button>
      once shards are available.
    </p>
    <p v-else-if="usingCachedShards" class="status status-muted">
      Serving cached shards (offline). Refresh when connectivity returns.
    </p>

    <p v-if="search.error.value" class="status status-error">{{ search.error.value }}</p>
  </div>
</template>

<style scoped>
.combo {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
}

.search-input {
  width: 100%;
  border-radius: 12px;
  border: 1px solid #cbd5f5;
  padding: 0.65rem 0.8rem;
  font-size: 0.95rem;
}

.search-submit {
  padding: 0.65rem 1rem;
  align-self: center;
}

.combo-results {
  position: absolute;
  top: calc(100% + 0.3rem);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #cbd5f5;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  padding: 0.35rem;
  z-index: 10;
}

.combo-result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  border: none;
  background: transparent;
  text-align: left;
  padding: 0.35rem 0.4rem;
  border-radius: 10px;
  cursor: pointer;
}

.combo-result:hover {
  background: #f8fafc;
}

.search-meta {
  margin-left: 0.4rem;
  font-size: 0.75rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.search-snippet {
  margin: 0;
  font-size: 0.8rem;
  color: #475569;
}
</style>
