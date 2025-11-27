import assert from 'node:assert/strict'
import { generateMarkdownView } from '../src/records/markdownView.js'

const bundle = {
  metadataFields: {
    project: ['id', 'title'],
    experiment: ['id', 'title', 'projectId']
  },
  recordSchemas: {
    project: {
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' }
      }
    },
    experiment: {
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        projectId: { type: 'string' },
        samples: { type: 'array' },
        configuration: { type: 'object' }
      }
    }
  },
  uiConfigs: {
    experiment: {
      layout: {
        fields: {
          samples: { order: 10 },
          configuration: { order: 20 }
        }
      }
    }
  }
}

function testProjectMarkdown() {
  const md = generateMarkdownView(
    'project',
    { id: 'PRJ-1', title: 'Alpha', description: 'Research' },
    {},
    bundle
  )
  assert.match(md, /\*\*\*Metadata\*\*\*/)
  assert.match(md, /\*\*Id:\*\* PRJ-1/)
  assert.match(md, /\*\*Title:\*\* Alpha/)
  assert.match(md, /\*\*\*Record Body\*\*\*/)
  assert.match(md, /### Description/)
}

function testExperimentMarkdown() {
  const md = generateMarkdownView(
    'experiment',
    { id: 'EXP-1', title: 'Mix', projectId: 'PRJ-1' },
    { samples: ['A', 'B'], configuration: { temp: '37C' } },
    bundle
  )
  assert.match(md, /\*\*Project Id:\*\* PRJ-1/)
  assert.match(md, /### Samples/)
  assert.match(md, /- A/)
  assert.match(md, /- B/)
  assert.match(md, /### Configuration/)
  assert.match(md, /```yaml/)
}

testProjectMarkdown()
testExperimentMarkdown()

console.log('markdownView tests passed')
