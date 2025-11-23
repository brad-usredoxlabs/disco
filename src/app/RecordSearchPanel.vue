<script setup>
const props = defineProps({
  search: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['open'])

function handleInput(event) {
  props.search.setQuery(event.target.value)
}

function openResult(path) {
  emit('open', path)
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
