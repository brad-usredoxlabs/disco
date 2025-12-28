import { describe, it, expect } from 'vitest'
import { validateMaterialEntry } from '../src/run-editor/materialValidation.js'

const FEATURES = [{ id: 'feature:foo' }, { id: 'feature:bar' }]

describe('validateMaterialEntry', () => {
  it('fails when required base fields missing', () => {
    const result = validateMaterialEntry({}, FEATURES)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('id'))).toBe(true)
    expect(result.errors.some((e) => e.includes('label'))).toBe(true)
    expect(result.errors.some((e) => e.includes('category'))).toBe(true)
  })

  it('enforces sample intent classified_as', () => {
    const result = validateMaterialEntry(
      {
        id: 'material:test',
        label: 'Test',
        category: 'reagent',
        experimental_intents: ['sample']
      },
      FEATURES
    )
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('sample intent requires classified_as (taxon/cell_line/tissue)')
  })

  it('enforces treatment intent mechanism/type/targets', () => {
    const result = validateMaterialEntry(
      {
        id: 'material:test',
        label: 'Test',
        category: 'reagent',
        experimental_intents: ['treatment'],
        mechanism: { type: 'agonist', targets: [] }
      },
      FEATURES
    )
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('treatment intent requires mechanism.targets when type is not other')
  })

  it('enforces assay_material measures against feature vocab', () => {
    const result = validateMaterialEntry(
      {
        id: 'material:test',
        label: 'Test',
        category: 'reagent',
        experimental_intents: ['assay_material'],
        measures: ['feature:missing']
      },
      FEATURES
    )
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/missing in feature vocab/)
  })

  it('enforces control role and control_for.features', () => {
    const result = validateMaterialEntry(
      {
        id: 'material:test',
        label: 'Test',
        category: 'reagent',
        experimental_intents: ['control'],
        control_role: '',
        control_for: { features: [] }
      },
      FEATURES
    )
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('control role'))).toBe(true)
    expect(result.errors.some((e) => e.includes('control_for.features'))).toBe(true)
  })

  it('passes when all intent requirements are met', () => {
    const result = validateMaterialEntry(
      {
        id: 'material:test',
        label: 'Test',
        category: 'reagent',
        experimental_intents: ['sample', 'treatment', 'assay_material', 'control'],
        classified_as: [{ id: 'NCBITaxon:9606', label: 'Human', domain: 'taxon' }],
        mechanism: { type: 'agonist', targets: [{ id: 'NCIT:C123', label: 'Target' }] },
        measures: ['feature:foo'],
        control_role: 'positive',
        control_for: { features: ['feature:bar'] }
      },
      FEATURES
    )
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })
})
