<script setup>
import FieldInspector from '../../FieldInspector.vue'

const props = defineProps({
  isOnline: { type: Boolean, default: true },
  isReady: { type: Boolean, default: false },
  repo: { type: Object, required: true },
  inspectorTarget: { type: Object, default: null },
  schemaLoader: { type: Object, required: true },
  recordGraph: { type: Object, required: true }
})

const emit = defineEmits(['connect', 'saved'])

const handleConnect = () => emit('connect')
const handleSaved = () => emit('saved')
</script>

<template>
  <div class="inspector-standalone">
    <p v-if="!isOnline" class="offline-banner">
      You are currently offline. Cached schema/search data are in use until connectivity returns.
    </p>
    <FieldInspector
      v-if="isReady"
      :repo="repo"
      :record-path="inspectorTarget?.path"
      :record-type="''"
      :schema-loader="schemaLoader"
      :record-graph="recordGraph"
      @saved="handleSaved"
    />
    <div v-else class="inspector-standalone__message">
      <p>Connect your repository to view this record.</p>
      <button class="primary" type="button" @click="handleConnect">Select repository folder</button>
    </div>
  </div>
</template>

<style scoped>
.inspector-standalone {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.inspector-standalone__message {
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  color: #475569;
  background: #f8fafc;
}

.offline-banner {
  margin: 0;
  padding: 0.55rem 0.9rem;
  border-radius: 10px;
  border: 1px solid rgba(202, 138, 4, 0.4);
  background: #fefce8;
  color: #713f12;
  font-size: 0.9rem;
}
</style>
