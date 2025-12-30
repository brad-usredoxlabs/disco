import { describe, it, expect } from 'vitest'
import { normalizeAssertionId, mintAssertionId, storagePlacement, shouldEmbedForScope } from '../src/assertions/assertionUtils.js'

describe('assertionUtils', () => {
  const ns = { baseIri: 'https://example.org/base', curiePrefix: 'ex' }

  it('normalizes CURIE to IRI', () => {
    const iri = normalizeAssertionId('ex:assertion:ABC123', ns)
    expect(iri).toBe('https://example.org/base/assertion/ABC123')
  })

  it('mints ULID-based IRI', () => {
    const iri = mintAssertionId(ns)
    expect(iri.startsWith('https://example.org/base/assertion/')).toBe(true)
    expect(iri.length).toBeGreaterThan('https://example.org/base/assertion/'.length)
  })

  it('infers storage placement for well-scoped assertions', () => {
    const placement = storagePlacement('run_editor', { well: 'A1' })
    expect(placement.mode).toBe('embedded_in_run')
    expect(placement.embedRecommended).toBe(true)
    expect(placement.fieldName).toBe('assertions')
  })

  it('allows standalone from global browser', () => {
    const placement = storagePlacement('global_assertions_browser', {})
    expect(placement.mode).toBe('standalone_record')
    expect(placement.embedRecommended).toBe(false)
  })

  it('recommends embed when scope contains run even from quick-add', () => {
    const placement = storagePlacement('quick_add_command_palette', { run: 'run-1' })
    expect(placement.embedRecommended).toBe(true)
    expect(shouldEmbedForScope({ run: 'run-1' })).toBe(true)
  })
})
