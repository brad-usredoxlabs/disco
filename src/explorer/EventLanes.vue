<script setup>
const props = defineProps({
  events: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['select'])

function handleSelect(evt) {
  emit('select', evt)
}

function lanes(events = []) {
  const groups = {
    transfer: [],
    incubate: [],
    read: [],
    wash: [],
    sample_operation: [],
    harvest: [],
    other: []
  }
  events.forEach((evt) => {
    const key = groups[evt.event_type] ? evt.event_type : 'other'
    groups[key].push(evt)
  })
  return Object.entries(groups)
}
</script>

<template>
  <div class="lanes">
    <div v-for="[kind, list] in lanes(events)" :key="kind" class="lane">
      <div class="lane__label">{{ kind }} ({{ list.length }})</div>
      <div class="lane__events">
        <button
          v-for="evt in list"
          :key="evt.id || evt.timestamp"
          type="button"
          class="lane__event"
          @click="handleSelect(evt)"
        >
          {{ evt.label || evt.event_type || 'event' }}
          <small v-if="evt.timestamp"> · {{ new Date(evt.timestamp).toLocaleTimeString() }}</small>
        </button>
        <span v-if="!list.length" class="lane__empty">No events</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lanes {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.lane {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.lane__label {
  font-weight: 700;
  color: #334155;
  font-size: 0.9rem;
}

.lane__events {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.lane__event {
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 0.25rem 0.6rem;
  background: #fff;
  cursor: pointer;
  font-size: 0.85rem;
}

.lane__empty {
  color: #94a3b8;
  font-size: 0.85rem;
}
</style>
