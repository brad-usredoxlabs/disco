<template>
  <div class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal-panel" :style="{ maxWidth: maxWidthComputed }">
      <header class="modal-header" v-if="title || showClose">
        <h2 v-if="title">{{ title }}</h2>
        <button v-if="showClose" class="icon-button" type="button" aria-label="Close dialog" @click="$emit('close')">
          ×
        </button>
      </header>

      <div class="modal-body">
        <slot />
      </div>

      <footer v-if="$slots.footer" class="modal-footer">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: ''
  },
  showClose: {
    type: Boolean,
    default: true
  },
  maxWidth: {
    type: [String, Number],
    default: '520px'
  }
})

defineEmits(['close'])

const maxWidthComputed = computed(() =>
  typeof props.maxWidth === 'number' ? `${props.maxWidth}px` : props.maxWidth || '520px'
)
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 50;
}

.modal-panel {
  width: 100%;
  max-width: 520px;
  background: #fff;
  border-radius: 20px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.2);
  animation: modalIn 0.2s ease-out;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 0.5rem;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #0f172a;
}

.modal-body {
  padding: 0 1.5rem 1.5rem;
  color: #1f2937;
}

.modal-footer {
  padding: 0 1.5rem 1.5rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.icon-button {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  cursor: pointer;
  color: #64748b;
}

.icon-button:hover {
  color: #0f172a;
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
