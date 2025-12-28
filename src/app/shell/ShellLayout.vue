<script setup>
defineProps({
  showOffline: { type: Boolean, default: false }
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <slot name="header" />
    </header>
    <slot name="status" />
    <slot name="offline" v-if="showOffline" />
    <main class="app-main-layout">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.app-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1.5rem;
}

.app-main-layout {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 1.5rem;
}

@media (max-width: 1100px) {
  .app-main-layout {
    grid-template-columns: 1fr;
  }
}
</style>
