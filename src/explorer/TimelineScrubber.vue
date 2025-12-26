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

function durationToMs(duration = '') {
  if (typeof duration !== 'string') return null
  const match = duration.match(/^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i)
  if (!match) return null
  const hours = Number(match[1] || 0)
  const minutes = Number(match[2] || 0)
  const seconds = Number(match[3] || 0)
  return (hours * 3600 + minutes * 60 + seconds) * 1000
}

function eventTimeMs(evt = {}, fallbackIndex = 0) {
  const ts = evt.timestamp_actual || evt.timestamp
  const parsed = Date.parse(ts || '')
  if (Number.isFinite(parsed)) return parsed
  const offsetMs = durationToMs(evt.t_offset || '')
  if (Number.isFinite(offsetMs)) return offsetMs
  return fallbackIndex
}

const sortedEvents = computed(() => {
  return [...(props.events || [])]
    .map((evt, index) => ({ evt, timeMs: eventTimeMs(evt, index), index }))
    .sort((a, b) => a.timeMs - b.timeMs || a.index - b.index)
})

const minTs = computed(() => (sortedEvents.value[0] ? sortedEvents.value[0].timeMs : 0))
const maxTs = computed(() => (sortedEvents.value[sortedEvents.value.length - 1] ? sortedEvents.value[sortedEvents.value.length - 1].timeMs : 0))

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

function displayTs(evt = {}) {
  return evt.timestamp_actual || evt.timestamp || evt.t_offset || 'unscheduled'
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
          v-for="entry in sortedEvents"
          :key="entry.evt?.id || entry.evt?.timestamp || entry.index"
          type="button"
          class="tick"
          :title="`${entry.evt?.event_type || 'event'} @ ${displayTs(entry.evt)}`"
          @click="jumpTo(entry.evt?.timestamp_actual || entry.evt?.timestamp || '')"
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
