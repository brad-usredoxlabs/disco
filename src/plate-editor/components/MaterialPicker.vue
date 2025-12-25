<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  materials: {
    type: Array,
    default: () => []
  },
  selectedId: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    default: ''
  },
  recentIds: {
    type: Array,
    default: () => []
  },
  favoriteIds: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['select', 'favorite-toggle', 'request-create', 'request-edit'])

const activeTab = ref('search')

const ROLE_TAG_PRIORITIES = {
  assay_material: ['dye', 'reporter', 'primer', 'probe', 'mastermix'],
  treatment: ['compound', 'agonist', 'antagonist', 'inhibitor', 'activator'],
  sample: ['cells', 'cell_line', 'primary_cells', 'extract'],
  positive_control: ['positive_control', 'control'],
  negative_control: ['negative_control', 'control'],
  vehicle_control: ['vehicle', 'solvent', 'control']
}

const recentIds = computed(() => props.recentIds || [])

const materialMap = computed(() => {
  const map = {}
  props.materials.forEach((entry) => {
    if (entry?.id) {
      map[entry.id] = entry
    }
  })
  return map
})

const queryInput = ref('')
const query = ref('')
let queryTimer = null

watch(
  () => queryInput.value,
  (value) => {
    clearTimeout(queryTimer)
    queryTimer = setTimeout(() => {
      query.value = value.trim().toLowerCase()
      if (query.value && activeTab.value !== 'search') {
        activeTab.value = 'search'
      }
    }, 120)
  }
)

const favoriteIds = computed(() => props.favoriteIds || [])

const favorites = computed(() =>
  favoriteIds.value.map((id) => materialMap.value[id]).filter(Boolean)
)

const recents = computed(() => recentIds.value.map((id) => materialMap.value[id]).filter(Boolean))

const recommendedTags = computed(() => ROLE_TAG_PRIORITIES[props.role] || [])
const activeFilters = ref([])

watch(
  () => props.role,
  (role) => {
    if (role && ROLE_TAG_PRIORITIES[role]) {
      activeFilters.value = [...ROLE_TAG_PRIORITIES[role]]
    } else {
      activeFilters.value = []
    }
  },
  { immediate: true }
)

const filteredMaterials = computed(() => {
  let source = props.materials
  if (activeTab.value === 'recent') {
    source = recents.value
  } else if (activeTab.value === 'favorites') {
    source = favorites.value
  }

  const tokens = query.value ? query.value.split(/\s+/).filter(Boolean) : []
  const hasFilter = activeFilters.value.length > 0
  const list = source
    .map((entry) => {
      const score = computeScore(entry, tokens, activeFilters.value)
      const matchesQuery = tokens.length ? tokens.every((token) => buildTokens(entry).some((t) => t.includes(token))) : true
      const matchesFilter = !hasFilter || (entry.tags || []).some((tag) => activeFilters.value.includes(tag))
      return { entry, score, matchesQuery, matchesFilter }
    })
    .filter((item) => item.matchesQuery && item.matchesFilter)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.entry)

  return list.slice(0, 50)
})

watch(
  () => props.materials,
  () => {
    queryInput.value = ''
    query.value = ''
  }
)

function handleSelect(item) {
  if (!item) return
  emit('select', item)
}

function handleFavorite(item, event) {
  event.stopPropagation()
  emit('favorite-toggle', { id: item.id })
}

function handleCreate() {
  const value = queryInput.value.trim()
  if (!value) return
  emit('request-create', {
    label: value,
    role: props.role || '',
    tags: buildCreationTags()
  })
}

function handleEdit(item, event) {
  event?.stopPropagation()
  emit('request-edit', item)
}

function buildTokens(entry = {}) {
  const base = Array.isArray(entry.searchTokens) ? entry.searchTokens : []
  if (base.length) return base
  const fallback = [entry.label, entry.id, ...(entry.tags || [])]
  return fallback
    .map((token) => (typeof token === 'string' ? token.trim().toLowerCase() : ''))
    .filter(Boolean)
}

function computeScore(entry, tokens = [], filters = []) {
  let score = 0
  if (filters.length) {
    const tagMatches = entry.tags?.filter((tag) => filters.includes(tag)) || []
    score += tagMatches.length * 5
  }
  if (tokens.length) {
    const entryTokens = buildTokens(entry)
    tokens.forEach((token) => {
      entryTokens.forEach((candidate) => {
        if (candidate === token) {
          score += 6
        } else if (candidate.startsWith(token)) {
          score += 3
        } else if (candidate.includes(token)) {
          score += 1
        }
      })
    })
  } else {
    // Prioritize recommended tags even without query
    score += (entry.tags?.some((tag) => filters.includes(tag)) ? 5 : 0)
  }
  return score
}

function toggleFilter(tag) {
  if (!tag) return
  const set = new Set(activeFilters.value)
  if (set.has(tag)) {
    set.delete(tag)
  } else {
    set.add(tag)
  }
  activeFilters.value = Array.from(set)
}

function highlightText(text = '') {
  const content = escapeHtml(text)
  if (!query.value) return content
  const tokens = query.value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!tokens.length) return content
  const pattern = new RegExp(`(${tokens.join('|')})`, 'gi')
  return content.replace(pattern, '<mark>$1</mark>')
}

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildCreationTags() {
  const suggested = new Set()
  const seeds = activeFilters.value.length ? activeFilters.value : recommendedTags.value
  seeds.forEach((tag) => suggested.add(tag))
  return Array.from(suggested)
}
</script>

<template>
  <div class="material-picker">
    <div class="picker-header">
      <input
        v-model="queryInput"
        type="text"
        placeholder="Search materials…"
        @keydown.enter.prevent="activeTab === 'create' ? handleCreate() : null"
      />
      <div class="tablist" role="tablist">
        <button
          type="button"
          :class="['tab', { 'is-active': activeTab === 'search' }]"
          role="tab"
          @click="activeTab = 'search'"
        >
          Search
        </button>
        <button
          type="button"
          :class="['tab', { 'is-active': activeTab === 'recent' }]"
          role="tab"
          @click="activeTab = 'recent'"
          :disabled="!recents.length"
        >
          Recent
        </button>
        <button
          type="button"
          :class="['tab', { 'is-active': activeTab === 'favorites' }]"
          role="tab"
          @click="activeTab = 'favorites'"
          :disabled="!favorites.length"
        >
          Favorites
        </button>
        <button
          type="button"
          :class="['tab', { 'is-active': activeTab === 'create' }]"
          role="tab"
          @click="activeTab = 'create'"
        >
          Create
        </button>
      </div>
      <div v-if="recommendedTags.length" class="filter-chips">
        <span>Filters:</span>
        <button
          v-for="tag in recommendedTags"
          :key="tag"
          type="button"
          class="chip"
          :class="{ 'is-active': activeFilters.includes(tag) }"
          @click="toggleFilter(tag)"
        >
          {{ tag }}
        </button>
        <button
          v-if="activeFilters.length"
          type="button"
          class="chip clear"
          @click="activeFilters = []"
        >
          Clear filters
        </button>
      </div>
    </div>

    <div v-if="activeTab === 'create'" class="create-panel">
      <p>Hit “Create material” to draft a new entry named “{{ queryInput || 'Unnamed material' }}”.</p>
      <button class="primary" type="button" :disabled="!queryInput.trim()" @click="handleCreate">
        Create material “{{ queryInput.trim() }}”
      </button>
    </div>
    <ul v-else class="results-list">
      <li v-if="!filteredMaterials.length" class="empty-state">
        <p>No materials found.</p>
        <button
          class="primary ghosty"
          type="button"
          :disabled="!queryInput.trim()"
          @click="handleCreate"
        >
          Create “{{ queryInput.trim() || 'material' }}”
        </button>
      </li>
      <li
        v-for="material in filteredMaterials"
        :key="material.id"
        class="result-row"
        :class="{ 'is-selected': material.id === selectedId }"
        role="option"
        @click="handleSelect(material)"
      >
        <div class="result-main">
          <p class="result-label" v-html="highlightText(material.label)"></p>
          <p class="result-meta">
            <span v-html="highlightText(material.id)"></span>
            <span v-if="material.tags?.length"> · {{ material.tags.slice(0, 3).join(', ') }}</span>
          </p>
        </div>
        <div class="row-actions">
          <button
            class="icon-button"
            type="button"
            :title="favoriteIds.includes(material.id) ? 'Remove favorite' : 'Favorite'"
            @click="(event) => handleFavorite(material, event)"
          >
            {{ favoriteIds.includes(material.id) ? '★' : '☆' }}
          </button>
          <button class="text-button" type="button" @click="(event) => handleEdit(material, event)">
            Edit
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.material-picker {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.picker-header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

input {
  border: 1px solid #cbd5f5;
  border-radius: 10px;
  padding: 0.4rem 0.6rem;
  font-size: 0.95rem;
}

.tablist {
  display: inline-flex;
  gap: 0.35rem;
}

.tab {
  border: 1px solid #cbd5f5;
  background: #fff;
  border-radius: 20px;
  padding: 0.2rem 0.7rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.tab.is-active {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.tab:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.results-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 260px;
  overflow: auto;
}

.result-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.5rem 0.75rem;
  background: #fff;
  cursor: pointer;
}

.result-row:hover {
  border-color: #2563eb;
}

.result-row.is-selected {
  background: #e0f2fe;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.25);
}

.result-main {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.result-label {
  margin: 0;
  font-weight: 600;
  color: #0f172a;
}

.result-meta {
  margin: 0;
  font-size: 0.8rem;
  color: #475569;
}

.icon-button {
  border: none;
  background: transparent;
  font-size: 1.2rem;
  cursor: pointer;
}

.empty-state {
  text-align: center;
  color: #94a3b8;
  font-style: italic;
}

.empty-state p {
  margin-bottom: 0.35rem;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.text-button {
  border: 1px solid #cbd5f5;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  font-size: 0.75rem;
  background: transparent;
  cursor: pointer;
}

.create-panel {
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.primary {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 0.4rem 0.8rem;
  cursor: pointer;
}

.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary.ghosty {
  background: #fff;
  color: #2563eb;
  border: 1px solid #2563eb;
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: 0.8rem;
  align-items: center;
}

.chip {
  border: 1px solid #cbd5f5;
  border-radius: 999px;
  background: #fff;
  padding: 0.15rem 0.6rem;
  cursor: pointer;
}

.chip.is-active {
  background: #0ea5e9;
  border-color: #0ea5e9;
  color: #fff;
}

.chip.clear {
  border-style: dashed;
}

mark {
  background: #fef08a;
  padding: 0 0.15rem;
}
</style>
