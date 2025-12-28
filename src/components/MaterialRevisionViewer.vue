<template>
  <div class="rev-viewer">
    <div class="summary">
      <div>
        <p class="title" v-if="rev.label">{{ rev.label }}</p>
        <div class="badge-row">
          <span v-if="rev.category" class="pill prominent">{{ rev.category }}</span>
          <span v-if="rev.experimental_intents?.length" class="pill subtle">
            {{ rev.experimental_intents.join(', ') }}
          </span>
        </div>
      </div>
      <div class="meta" v-if="rev.id || rev.of_material">
        <p v-if="rev.status" class="muted tiny">Status: {{ rev.status }}</p>
        <p v-if="rev.of_material" class="muted tiny">Material: {{ rev.of_material }}</p>
        <p v-if="rev.id" class="muted tiny">Revision: {{ rev.id }}</p>
        <p v-if="rev.created_at" class="muted tiny">Created: {{ formatDate(rev.created_at) }}</p>
      </div>
    </div>

    <InfoBlock v-if="rev.experimental_intents?.length" label="Experimental intents">
      <ul class="chips">
        <li v-for="intent in rev.experimental_intents" :key="intent" class="chip">{{ intent }}</li>
      </ul>
    </InfoBlock>

    <InfoBlock v-if="rev.classified_as?.length" label="Ontology / classification">
      <ul>
        <li v-for="c in rev.classified_as" :key="c.id || c.label">
          <strong>{{ c.label || c.id }}</strong>
          <span v-if="c.domain" class="muted"> · {{ c.domain }}</span>
          <span v-if="c.id" class="muted tiny"> ({{ c.id }})</span>
        </li>
      </ul>
    </InfoBlock>

    <InfoBlock v-if="rev.mechanism && (rev.mechanism.type || rev.mechanism.targets?.length)" label="Mechanism / targets">
      <p v-if="rev.mechanism.type"><strong>Type:</strong> {{ rev.mechanism.type }}</p>
      <ul v-if="rev.mechanism.targets?.length">
        <li v-for="t in rev.mechanism.targets" :key="t.id || t.label">
          {{ t.label || t.id }}
          <span v-if="t.id" class="muted tiny">({{ t.id }})</span>
        </li>
      </ul>
    </InfoBlock>

    <InfoBlock v-if="rev.affected_processes?.length || rev.affected_process" label="Affected processes">
      <ul v-if="rev.affected_processes?.length">
        <li v-for="p in rev.affected_processes" :key="p.id || p.label">
          {{ p.label || p.id }}
          <span v-if="p.id" class="muted tiny">({{ p.id }})</span>
        </li>
      </ul>
      <p v-else-if="rev.affected_process">
        {{ rev.affected_process.label || rev.affected_process.id }}
        <span v-if="rev.affected_process.id" class="muted tiny">({{ rev.affected_process.id }})</span>
      </p>
    </InfoBlock>

    <InfoBlock v-if="rev.measures?.length" label="Measures / readouts">
      <ul>
        <li v-for="m in rev.measures" :key="m">{{ m }}</li>
      </ul>
    </InfoBlock>

    <InfoBlock v-if="rev.control_for && hasControlFor" label="Control for">
      <p v-if="rev.control_for.features?.length"><strong>Features:</strong> {{ rev.control_for.features.join(', ') }}</p>
      <p v-if="rev.control_for.acquisition_modalities?.length">
        <strong>Modalities:</strong> {{ rev.control_for.acquisition_modalities.join(', ') }}
      </p>
      <p v-if="rev.control_for.notes"><strong>Notes:</strong> {{ rev.control_for.notes }}</p>
    </InfoBlock>

    <InfoBlock v-if="rev.detection && hasDetection" label="Detection hints">
      <p v-if="rev.detection.modality"><strong>Modality:</strong> {{ rev.detection.modality }}</p>
      <p v-if="rev.detection.channel_hint"><strong>Channel:</strong> {{ rev.detection.channel_hint }}</p>
      <p v-if="rev.detection.excitation_nm"><strong>Excitation:</strong> {{ rev.detection.excitation_nm }} nm</p>
      <p v-if="rev.detection.emission_nm"><strong>Emission:</strong> {{ rev.detection.emission_nm }} nm</p>
    </InfoBlock>

    <InfoBlock v-if="rev.xref && Object.keys(rev.xref).length" label="Cross references">
      <ul>
        <li v-for="(val, key) in rev.xref" :key="key">
          <strong>{{ key }}:</strong> {{ val }}
        </li>
      </ul>
    </InfoBlock>

    <InfoBlock v-if="rev.changes_summary || rev.created_by" label="Revision metadata">
      <p v-if="rev.changes_summary"><strong>Changes:</strong> {{ rev.changes_summary }}</p>
      <p v-if="rev.created_by"><strong>Author:</strong> {{ rev.created_by }}</p>
    </InfoBlock>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  revision: { type: Object, default: null }
})

const rev = computed(() => props.revision || {})
const hasDetection = computed(() =>
  Boolean(
    rev.value?.detection?.modality ||
      rev.value?.detection?.channel_hint ||
      Number.isFinite(rev.value?.detection?.excitation_nm) ||
      Number.isFinite(rev.value?.detection?.emission_nm)
  )
)
const hasControlFor = computed(() =>
  Boolean(
    rev.value?.control_for?.features?.length ||
      rev.value?.control_for?.acquisition_modalities?.length ||
      rev.value?.control_for?.notes
  )
)

function formatDate(input = '') {
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return input
  return date.toISOString().split('T')[0]
}
</script>

<script>
// small inline components
export default {
  components: {
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
.summary {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}
.title {
  margin: 0;
  font-weight: 700;
  font-size: 1.05rem;
}
.badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.25rem;
}
.pill {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0f172a;
  font-size: 0.85rem;
}
.pill.subtle {
  background: #eef2ff;
  color: #334155;
}
.meta {
  text-align: right;
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
.chips {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.chip {
  background: #ecfeff;
  border: 1px solid #cffafe;
  color: #0f172a;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  font-size: 0.9rem;
}
.muted {
  color: #475569;
}
.tiny {
  font-size: 0.8rem;
}
</style>
