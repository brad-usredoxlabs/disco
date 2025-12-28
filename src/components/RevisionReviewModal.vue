<template>
  <div v-if="open" class="rrm-backdrop" role="dialog" aria-modal="true">
    <div class="rrm-card">
      <header class="rrm-header">
        <h3>{{ title }}</h3>
        <p v-if="concept?.label" class="muted">{{ concept.label }} · {{ concept.id }}</p>
        <p v-if="revision?.id" class="muted">Revision: {{ revision.id }} ({{ revision.status || 'unknown' }})</p>
      </header>
      <section class="rrm-body">
        <slot />
        <p v-if="!revision" class="muted">No active revision available for this concept.</p>
      </section>
      <footer class="rrm-actions">
        <button class="ghost" type="button" @click="$emit('cancel')">Cancel</button>
        <button class="secondary" type="button" @click="$emit('create-new')" :disabled="!revision">Create new revision</button>
        <button class="primary" type="button" @click="$emit('use')" :disabled="!revision">Use this revision</button>
      </footer>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: 'Review revision' },
  concept: { type: Object, default: null },
  revision: { type: Object, default: null }
})

defineEmits(['use', 'create-new', 'cancel'])
</script>

<style scoped>
.rrm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: grid;
  place-items: center;
  z-index: 30;
}
.rrm-card {
  background: #fff;
  border-radius: 10px;
  padding: 1rem;
  max-width: 720px;
  width: 100%;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.2);
}
.rrm-header h3 {
  margin: 0 0 0.25rem 0;
}
.rrm-header .muted {
  margin: 0;
}
.rrm-body {
  margin: 0.75rem 0;
}
.rrm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.ghost {
  border: 1px solid #cbd5f5;
  border-radius: 999px;
  background: transparent;
  color: #0f172a;
  padding: 0.35rem 0.8rem;
  cursor: pointer;
}
.secondary {
  border: none;
  border-radius: 10px;
  padding: 0.45rem 0.9rem;
  background: #e0e7ff;
  color: #1d2b50;
  cursor: pointer;
}
.primary {
  border: none;
  border-radius: 10px;
  padding: 0.45rem 0.9rem;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}
.muted {
  color: #475569;
  font-size: 0.9rem;
}
</style>
