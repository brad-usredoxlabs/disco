<template>
  <div class="rev-viewer">
    <div class="summary">
      <p class="title" v-if="rev.label">{{ rev.label }}</p>
    </div>

    <!-- Basic Information -->
    <div class="form-section">
      <h3 class="section-header basic">📋 Basic Information</h3>
      
      <div class="form-field">
        <label class="field-label">Category:</label>
        <div class="field-value">{{ rev.category || 'Not specified' }}</div>
      </div>

      <div class="form-field" v-if="rev.experimental_intents?.length">
        <label class="field-label">Experimental Intents:</label>
        <div class="field-value">
          <span v-for="(intent, idx) in rev.experimental_intents" :key="intent">
            {{ intent }}<span v-if="idx < rev.experimental_intents.length - 1">, </span>
          </span>
        </div>
      </div>

      <div class="form-field" v-if="tags.length">
        <label class="field-label">Tags:</label>
        <div class="field-value">
          <span class="tag-chip" v-for="tag in tags" :key="tag">{{ tag }}</span>
        </div>
      </div>
    </div>

    <!-- Ontological References Section (Prominent) -->
    <div v-if="hasOntologyReferences" class="form-section ontology-section">
      <h3 class="section-header ontology">🔬 Ontological References</h3>
      
      <div class="form-field" v-if="xrefEntries.length">
        <label class="field-label">Cross Reference (Xref):</label>
        <div class="field-value">
          <div v-for="item in xrefEntries" :key="item.source" class="ontology-item">
            <span class="ontology-badge">{{ item.source.toUpperCase() }}</span>
            <span class="ontology-id">{{ item.value }}</span>
          </div>
        </div>
      </div>

      <div class="form-field" v-if="classified.length">
        <label class="field-label">Classifications:</label>
        <div class="field-value">
          <div v-for="c in classified" :key="c.id || c.label" class="ontology-item">
            <span class="ontology-badge" v-if="c.domain">{{ c.domain }}</span>
            <div class="ontology-text">
              <div class="ontology-label">{{ c.label || c.id }}</div>
              <div v-if="c.id" class="ontology-id-sub">{{ c.id }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="form-field" v-if="hasMechanism">
        <label class="field-label">Mechanism:</label>
        <div class="field-value">
          <div class="mechanism-type" v-if="rev.mechanism.type">
            <strong>Type:</strong> <span class="mechanism-badge">{{ rev.mechanism.type }}</span>
          </div>
          <div v-if="mechanismTargets.length" class="mechanism-targets">
            <div class="subsection-label">Targets:</div>
            <div v-for="t in mechanismTargets" :key="t.id || t.label" class="ontology-item">
              <span class="ontology-badge" v-if="t.domain">{{ t.domain }}</span>
              <div class="ontology-text">
                <div class="ontology-label">{{ t.label || t.id }}</div>
                <div v-if="t.id" class="ontology-id-sub">{{ t.id }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="form-field" v-if="affectedProcesses.length">
        <label class="field-label">Affected Process:</label>
        <div class="field-value">
          <div v-for="p in affectedProcesses" :key="p.id || p.label" class="ontology-item">
            <span class="ontology-badge" v-if="p.domain">{{ p.domain }}</span>
            <div class="ontology-text">
              <div class="ontology-label">{{ p.label || p.id }}</div>
              <div v-if="p.id" class="ontology-id-sub">{{ p.id }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="form-field" v-if="assayTarget">
        <label class="field-label">Assay Material Target:</label>
        <div class="field-value">
          <div class="ontology-item">
            <span class="ontology-badge" v-if="assayTarget.domain">{{ assayTarget.domain }}</span>
            <div class="ontology-text">
              <div class="ontology-label">{{ assayTarget.label || assayTarget.id }}</div>
              <div v-if="assayTarget.id" class="ontology-id-sub">{{ assayTarget.id }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="form-field" v-if="vendorDisplay || catalogLinks.length">
        <label class="field-label">Vendor / Catalog:</label>
        <div class="field-value">
          <div v-if="vendorDisplay" class="vendor-line">
            <strong>{{ vendorDisplay.name }}</strong>
            <span v-if="vendorDisplay.homepage" class="muted tiny">
              · <a :href="vendorDisplay.homepage" target="_blank" rel="noreferrer">homepage</a>
            </span>
          </div>
          <div v-if="catalogLinks.length" class="catalog-list">
            <div v-for="entry in catalogLinks" :key="entry.catalog" class="catalog-item">
              <a v-if="entry.url" :href="entry.url" target="_blank" rel="noreferrer">{{ entry.catalog }}</a>
              <span v-else>{{ entry.catalog }}</span>
            </div>
          </div>
          <p v-else class="muted tiny">No catalog numbers.</p>
        </div>
      </div>
    </div>

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
const tags = computed(() => {
  const tagList = Array.isArray(rev.value.tags) ? rev.value.tags : []
  return tagList.filter(t => t && t.trim())
})
const classified = computed(() => {
  const list = Array.isArray(rev.value.classified_as) ? rev.value.classified_as : []
  return list.map((item) => ({
    ...item,
    domain: item?.domain || inferDomain(item?.id)
  })).filter((item) => item.id || item.label)
})
const mechanismTargets = computed(() => {
  const list = Array.isArray(rev.value?.mechanism?.targets) ? rev.value.mechanism.targets : []
  return list.map((item) => ({
    ...item,
    domain: item?.domain || inferDomain(item?.id)
  })).filter((item) => item.id || item.label)
})
const hasMechanism = computed(() => Boolean(rev.value?.mechanism?.type || mechanismTargets.value.length))
const affectedProcesses = computed(() => {
  const list = Array.isArray(rev.value.affected_processes)
    ? rev.value.affected_processes
    : rev.value.affected_process && (rev.value.affected_process.id || rev.value.affected_process.label)
    ? [rev.value.affected_process]
    : []
  return list.map((item) => ({
    ...item,
    domain: item?.domain || inferDomain(item?.id)
  })).filter((item) => item.id || item.label)
})
const assayTarget = computed(() => {
  const target =
    rev.value?.assay_target ||
    rev.value?.assay_material_target ||
    rev.value?.assay_materials?.target ||
    null
  if (!target || (!target.id && !target.label)) return null
  return {
    ...target,
    domain: target.domain || inferDomain(target.id)
  }
})
const xrefEntries = computed(() => {
  const xref = rev.value?.xref || {}
  if (!xref || typeof xref !== 'object') return []
  return Object.entries(xref)
    .filter(([source, value]) => source && value)
    .map(([source, value]) => ({ source, value }))
})
const hasOntologyReferences = computed(() => {
  return (
    xrefEntries.value.length > 0 ||
    classified.value.length > 0 ||
    hasMechanism.value ||
    affectedProcesses.value.length > 0 ||
    assayTarget.value !== null
  )
})
const hasDetection = computed(() =>
  Boolean(
    rev.value?.detection?.modality ||
      rev.value?.detection?.channel_hint ||
      Number.isFinite(rev.value?.detection?.excitation_nm) ||
      Number.isFinite(rev.value?.detection?.emission_nm)
  )
)
const vendorDisplay = computed(() => {
  const slug = rev.value.vendor_slug || ''
  const vendors = {
    thermo: { name: 'Thermo Fisher', homepage: 'https://www.thermofisher.com' },
    sigmaaldrich: { name: 'Sigma-Aldrich', homepage: 'https://www.sigmaaldrich.com' },
    biorad: { name: 'Bio-Rad', homepage: 'https://www.bio-rad.com' },
    thomas: { name: 'Thomas', homepage: '' },
    internal: { name: 'Internal', homepage: '' },
    unknown: { name: 'Unknown vendor', homepage: '' }
  }
  if (!slug) return null
  return vendors[slug] || { name: slug, homepage: '' }
})
const catalogLinks = computed(() => {
  const catalogs = Array.isArray(rev.value.catalog_numbers) ? rev.value.catalog_numbers : []
  if (!catalogs.length) return []
  const slug = rev.value.vendor_slug || ''
  const templates = {
    thermo: 'https://www.thermofisher.com/search/results?query={catalog_number}',
    sigmaaldrich: 'https://www.sigmaaldrich.com/US/en/search/{catalog_number}',
    biorad: 'https://www.bio-rad.com/en-us/search?query={catalog_number}'
  }
  const template = templates[slug] || ''
  return catalogs
    .map((catalog) => {
      const encoded = encodeURIComponent(catalog)
      const url = template ? template.replace('{catalog_number}', encoded) : ''
      return { catalog, url }
    })
    .filter((entry) => entry.catalog)
})
const hasControlFor = computed(() =>
  Boolean(
    rev.value?.control_for?.features?.length ||
      rev.value?.control_for?.acquisition_modalities?.length ||
      rev.value?.control_for?.notes
  )
)

function inferDomain(id) {
  if (!id || typeof id !== 'string') return ''
  const match = id.match(/^([A-Za-z0-9_]+):/)
  return match ? match[1].toUpperCase() : ''
}
</script>

<script>
// small inline components
export default {
  components: {
    InfoBlock: {
      props: ['label', 'variant'],
      template: `<section class="info-block" :class="variant"><h4>{{ label }}</h4><slot /></section>`
    }
  }
}
</script>

<style scoped>
.rev-viewer {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 0.5rem;
}
.summary {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}
.title {
  margin: 0;
  font-weight: 700;
  font-size: 0.95rem;
}
.badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.2rem;
}
.pill {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0f172a;
  font-size: 0.75rem;
}
.pill.subtle {
  background: #eef2ff;
  color: #334155;
}
.info-block {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.5rem;
  background: #fff;
}
.info-block.prominent {
  border: 2px solid #3b82f6;
  background: #f8faff;
}
.info-block h4 {
  margin: 0 0 0.4rem 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: #1e293b;
}
.form-section {
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.65rem;
  background: #fafafa;
  margin-top: 0.35rem;
}
.form-section.ontology-section {
  border: 1.5px solid #8b5cf6;
  background: linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%);
}
.section-header {
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  font-weight: 700;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding-bottom: 0.35rem;
  border-bottom: 1.5px solid #e2e8f0;
}
.section-header.basic {
  color: #0f766e;
  border-bottom-color: #99f6e4;
}
.section-header.ontology {
  color: #6b21a8;
  border-bottom-color: #e9d5ff;
}
.form-field {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  align-items: start;
}
.field-label {
  font-weight: 600;
  color: #475569;
  padding-top: 0.15rem;
  font-size: 0.8rem;
}
.field-value {
  color: #1e293b;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.5rem;
  margin-right: 0.3rem;
  margin-bottom: 0.3rem;
  border-radius: 999px;
  background: #dbeafe;
  border: 1px solid #93c5fd;
  color: #1e3a8a;
  font-size: 0.75rem;
  font-weight: 500;
}
.ontology-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.5rem;
  background: white;
  border-radius: 5px;
  border: 1px solid #e9d5ff;
  margin-bottom: 0.25rem;
}
.ontology-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  background: #7c3aed;
  color: white;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.3px;
  flex-shrink: 0;
  text-transform: uppercase;
}
.ontology-text {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  flex: 1;
  min-width: 0;
}
.ontology-label {
  font-weight: 600;
  color: #1e293b;
  font-size: 0.8rem;
}
.ontology-id {
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 0.75rem;
  color: #334155;
  font-weight: 600;
}
.ontology-id-sub {
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 0.7rem;
  color: #64748b;
}
.mechanism-type {
  margin-bottom: 0.4rem;
}
.mechanism-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.6rem;
  border-radius: 5px;
  background: linear-gradient(135deg, #ec4899 0%, #f43f5e 100%);
  color: white;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.mechanism-targets {
  margin-top: 0.4rem;
}
.subsection-label {
  font-weight: 600;
  color: #64748b;
  font-size: 0.7rem;
  margin-bottom: 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.chips {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.chip {
  background: #ecfeff;
  border: 1px solid #cffafe;
  color: #0f172a;
  border-radius: 999px;
  padding: 0.15rem 0.5rem;
  font-size: 0.8rem;
}
.muted {
  color: #475569;
}
.tiny {
  font-size: 0.7rem;
}
.vendor-line {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.catalog-list {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.catalog-item a {
  color: #2563eb;
  text-decoration: none;
}
.catalog-item a:hover {
  text-decoration: underline;
}
</style>
