<template>
  <section class="app-panel">
    <slot />
  </section>
</template>

<style scoped>
.app-panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.05);
}

.app-panel + .app-panel {
  margin-top: 1.5rem;
}
</style>