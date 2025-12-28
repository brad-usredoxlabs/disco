<template>
  <span class="status-tag" :class="`status-${status}`">
    {{ status }}
  </span>
</template>

<script setup>
const props = defineProps({
  status: {
    type: String,
    default: 'unknown'
  }
})
</script>

<style scoped>
.status-tag {
  display: inline-block;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 0.75rem;
  border: 1px solid #cbd5f5;
}

.status-active {
  background: #ecfdf3;
  border-color: #4ade80;
  color: #166534;
}

.status-draft {
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1d4ed8;
}

.status-deprecated {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #991b1b;
}
</style>
