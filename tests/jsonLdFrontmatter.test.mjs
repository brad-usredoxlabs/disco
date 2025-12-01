import assert from 'node:assert/strict'
import {
  composeRecordFrontMatter,
  extractRecordData,
  mergeMetadataAndFormData
} from '../src/records/jsonLdFrontmatter.js'

const bundle = Object.freeze({
  metadataFields: {
    experiment: ['recordType', 'recordId', 'state', 'title', 'shortSlug']
  },
  recordSchemas: {
    experiment: {
      properties: {
        recordType: { type: 'string' },
        recordId: { type: 'string' },
        state: { type: 'string' },
        title: { type: 'string' },
        shortSlug: { type: 'string' },
        projectLink: { type: 'object' },
        taxon: { type: 'object' },
        operator: { type: 'object' },
        plateId: { type: 'string' },
        pathways: { type: 'array' }
      }
    }
  },
  uiConfigs: {
    experiment: {
      layout: {
        fields: {
          projectLink: {
            order: 10,
            jsonLd: { target: 'data', section: 'links', key: 'project' }
          },
          taxon: {
            order: 20,
            ui: { fieldType: 'ontology' },
            jsonLd: { target: 'data', section: 'biology', key: 'taxon' }
          },
          operator: {
            order: 30,
            ui: { fieldType: 'ontology' },
            jsonLd: { target: 'data', section: 'operations', key: 'operator' }
          },
          plateId: {
            order: 40,
            jsonLd: { target: 'data', section: 'operations', key: 'plateId' }
          },
          pathways: {
            order: 50,
            ui: { fieldType: 'ontologyList', columns: ['id', 'label'] },
            jsonLd: { target: 'data', section: 'biology', key: 'pathways' }
          }
        }
      }
    }
  },
  jsonLdConfig: {
    prefixes: {
      ex: 'https://example.org/schema/',
      schema: 'http://schema.org/'
    },
    baseIri: 'https://example.org',
    recordTypes: {
      experiment: {
        pathSegment: 'experiment',
        classIris: ['ex:Experiment', 'schema:Experiment'],
        biologyTypeMappings: {
          taxon: { target: '@type' }
        }
      }
    }
  }
})

function buildFormData() {
  return {
    projectLink: {
      id: 'https://example.org/project/PRJ-1',
      label: 'Metabolomics Project'
    },
    taxon: {
      identifier: 'ncbitaxon:632',
      label: 'Faecalibacterium prausnitzii',
      ontology: 'ncbitaxon'
    },
    operator: {
      identifier: 'https://example.org/person/bmarshall',
      label: 'Brad Marshall'
    },
    plateId: 'PL-001',
    pathways: [
      {
        id: 'reactome:R-HSA-1430728',
        label: 'Metabolism of amino acids'
      }
    ]
  }
}

function buildMetadata() {
  return {
    recordType: 'experiment',
    recordId: 'EXP-0009',
    title: 'Example experiment',
    state: 'draft',
    shortSlug: 'EE'
  }
}

function testComposeFrontMatter() {
  const metadata = buildMetadata()
  const formData = buildFormData()
  const overrides = {
    prefixes: {
      custom: 'https://example.org/custom/'
    },
    biology: {
      entities: [
        {
          domain: 'microbe',
          role: 'subject',
          ontology: 'ncbitaxon',
          '@id': 'ncbitaxon:7777',
          label: 'Example microbe'
        }
      ]
    }
  }

  const result = composeRecordFrontMatter('experiment', metadata, formData, bundle, overrides)
  const ctx = result.metadata['@context']

  assert.ok(ctx.ex && ctx.schema, 'default prefixes should be present')
  assert.equal(ctx.custom, 'https://example.org/custom/')
  assert.equal(result.metadata['@id'], 'https://example.org/experiment/EXP-0009')
  assert.deepStrictEqual(result.metadata['@type'].sort(), ['ex:Experiment', 'ncbitaxon:632', 'schema:Experiment'])

  const links = result.data.links || {}
  const biology = result.data.biology || {}
  const operations = result.data.operations || {}

  assert.equal(links.project.id, 'https://example.org/project/PRJ-1')
  assert.equal(biology.taxon.identifier, 'ncbitaxon:632')
  assert.equal(operations.operator.identifier, 'https://example.org/person/bmarshall')
  assert.equal(operations.plateId, 'PL-001')
  assert.equal(biology.pathways[0].id, 'reactome:R-HSA-1430728')
  assert.equal(biology.entities.length, 1, 'project-level biology entities merged into record')
}

function testExtractAndMerge() {
  const metadata = buildMetadata()
  const formData = buildFormData()
  const frontMatter = composeRecordFrontMatter('experiment', metadata, formData, bundle, {})

  const { metadata: hydratedMetadata, formData: extractedFormData } = extractRecordData(
    'experiment',
    frontMatter,
    bundle
  )
  assert.equal(hydratedMetadata.recordType, 'experiment')
  assert.equal(hydratedMetadata.formData.projectLink.id, 'https://example.org/project/PRJ-1')
  assert.equal(extractedFormData.operator.identifier, 'https://example.org/person/bmarshall')

  const merged = mergeMetadataAndFormData(hydratedMetadata, extractedFormData)
  assert.equal(merged.projectLink.id, 'https://example.org/project/PRJ-1')
  assert.equal(merged.taxon.identifier, 'ncbitaxon:632')
}

testComposeFrontMatter()
testExtractAndMerge()

console.log('jsonLdFrontmatter tests passed')
