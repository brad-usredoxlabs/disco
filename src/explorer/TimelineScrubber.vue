<script setup>
import { computed } from 'vue'

const props = defineProps({
  events: {
    type: Array,
    default: () => []
  },
  cursor: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:cursor'])

const sortedEvents = computed(() => {
  return [...(props.events || [])].sort((a, b) => (Date.parse(a.timestamp || '') || 0) - (Date.parse(b.timestamp || '') || 0))
})

const minTs = computed(() => (sortedEvents.value[0] ? Date.parse(sortedEvents.value[0].timestamp || '') : 0))
const maxTs = computed(() => (sortedEvents.value[sortedEvents.value.length - 1] ? Date.parse(sortedEvents.value[sortedEvents.value.length - 1].timestamp || '') : 0))

const cursorValue = computed(() => {
  const ts = Date.parse(props.cursor || '')
  if (!Number.isFinite(ts)) return maxTs.value
  return ts
})

function handleInput(event) {
  const ts = Number(event.target.value)
  if (!Number.isFinite(ts)) return
  emit('update:cursor', new Date(ts).toISOString())
}

function jumpTo(timestamp) {
  emit('update:cursor', timestamp)
}
</script>

<template>
  <div class="scrubber">
    <div class="scrubber__row">
      <input
        v-if="sortedEvents.length"
        type="range"
        class="scrubber__range"
        :min="minTs"
        :max="maxTs"
        :value="cursorValue"
        :step="1000"
        @input="handleInput"
      />
      <div class="scrubber__ticks">
        <button
          v-for="evt in sortedEvents"
          :key="evt.id || evt.timestamp"
          type="button"
          class="tick"
          :title="`${evt.event_type || 'event'} @ ${evt.timestamp}`"
          @click="jumpTo(evt.timestamp)"
        />
      </div>
    </div>
    <div class="scrubber__meta">
      <span v-if="cursor">Cursor: {{ new Date(cursor).toLocaleString() }}</span>
      <span v-else>Cursor: latest</span>
      <span>Events: {{ sortedEvents.length }}</span>
    </div>
  </div>
</template>

<style scoped>
.scrubber {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.scrubber__row {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.scrubber__range {
  width: 100%;
}

.scrubber__ticks {
  display: flex;
  gap: 0.2rem;
  overflow-x: auto;
}

.tick {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid #cbd5e1;
  background: #e2e8f0;
  cursor: pointer;
}
</style>
