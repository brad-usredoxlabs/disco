import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import YAML from 'yaml'

const ROOT = process.cwd()
const FEATURES_DIR = path.join(ROOT, 'vocab', 'features')
const ALLOWED_DOMAINS = new Set([
  'cellular_state',
  'molecular',
  'metabolite',
  'gene_expression',
  'morphology',
  'physiology',
  'other'
])

describe('feature concepts', () => {
  const files = fs
    .readdirSync(FEATURES_DIR)
    .filter((file) => file.startsWith('feature--') && file.endsWith('.yaml'))

  it('includes seed features', () => {
    const ids = files.map((f) => path.basename(f, '.yaml'))
    expect(ids).toContain('feature--reactive_oxygen_species')
    expect(ids).toContain('feature--mitochondrial_membrane_potential')
  })

  it.each(files)('%s validates required shape', (filename) => {
    const text = fs.readFileSync(path.join(FEATURES_DIR, filename), 'utf8')
    const parsed = YAML.parse(text) || {}
    expect(typeof parsed.id).toBe('string')
    expect(parsed.id).toMatch(/^feature:[a-z0-9_]+$/)
    expect(typeof parsed.label).toBe('string')
    if (parsed.domain) {
      expect(ALLOWED_DOMAINS.has(parsed.domain)).toBe(true)
    }
    if (parsed.modality_hints) {
      expect(Array.isArray(parsed.modality_hints)).toBe(true)
    }
  })
})
