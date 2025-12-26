<template>
  <div v-if="open" class="modal">
    <div class="modal__card">
      <header class="modal__header">
        <h3>Add Template Labware</h3>
      </header>
      <div class="modal__body">
        <label>
          Type
          <select v-model="local.kind">
            <option value="reservoir-1">1-well reservoir</option>
            <option value="reservoir-8">8-well reservoir</option>
            <option value="reservoir-12">12-well reservoir</option>
            <option value="plate6">6-well plate</option>
            <option value="plate12">12-well plate</option>
            <option value="plate24">24-well plate</option>
            <option value="plate48">48-well plate</option>
            <option value="plate96">96-well plate</option>
            <option value="plate384">384-well plate</option>
          </select>
        </label>
        <label>
          Label
          <input v-model="local.label" type="text" placeholder="Reservoir A" />
        </label>
      </div>
      <footer class="modal__footer">
        <button class="ghost-button" type="button" @click="$emit('cancel')">Cancel</button>
        <button class="primary" type="button" @click="confirm">Add</button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['confirm', 'cancel'])

const local = reactive({
  kind: 'reservoir-1',
  label: ''
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      local.kind = local.kind || 'reservoir-1'
    }
  }
)

function confirm() {
  emit('confirm', { kind: local.kind, label: local.label?.trim() })
  local.label = ''
}
</script>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
}
.modal__card {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  width: 420px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}
.modal__header h3 {
  margin: 0;
}
.modal__body {
  display: grid;
  gap: 8px;
}
.modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
