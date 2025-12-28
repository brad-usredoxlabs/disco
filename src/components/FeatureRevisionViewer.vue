<template>
  <div class="rev-viewer">
    <div class="grid">
      <InfoRow v-if="rev.id" label="Revision ID" :value="rev.id" />
      <InfoRow v-if="rev.of_feature" label="Of feature" :value="rev.of_feature" />
      <InfoRow v-if="rev.status" label="Status" :value="rev.status" />
      <InfoRow v-if="rev.label" label="Label" :value="rev.label" />
      <InfoRow v-if="rev.description" label="Description" :value="rev.description" />
      <InfoRow v-if="rev.tags?.length" label="Tags" :value="rev.tags.join(', ')" />
      <InfoRow v-if="rev.modality" label="Modality" :value="rev.modality" />
      <InfoRow v-if="rev.units" label="Units" :value="rev.units" />
    </div>

    <InfoBlock v-if="rev.ontology && Object.keys(rev.ontology).length" label="Ontology">
      <ul>
        <li v-for="(val, key) in rev.ontology" :key="key">
          <strong>{{ key }}:</strong> {{ val }}
        </li>
      </ul>
    </InfoBlock>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  revision: { type: Object, default: null }
})

const rev = computed(() => props.revision || {})
</script>

<script>
export default {
  components: {
    InfoRow: {
      props: ['label', 'value'],
      template: `<div class="info-row"><span class="label">{{ label }}</span><span class="value">{{ value }}</span></div>`
    },
    InfoBlock: {
      props: ['label'],
      template: `<section class="info-block"><h4>{{ label }}</h4><slot /></section>`
    }
  }
}
</script>

<style scoped>
.rev-viewer {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.4rem;
}
.info-row {
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.4rem 0.5rem;
}
.info-row .label {
  font-size: 0.8rem;
  color: #475569;
}
.info-row .value {
  font-weight: 600;
}
.info-block {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.6rem;
  background: #fff;
}
.info-block h4 {
  margin: 0 0 0.35rem 0;
}
.muted {
  color: #475569;
}
</style>
